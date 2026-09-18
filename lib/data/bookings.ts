"use server";

import { createClient } from "@/lib/supabase/server";

export interface CreateBookingInput {
  roomId: string;
  guestName: string;
  guestPhone: string;
  checkIn: string;
  checkOut: string;
  totalPrice: number;
  paymentStatus: "paid" | "confirmed";
  userId?: string;
  guestCount?: number;
}

export interface BookingRecord {
  id: string;
  room_id: string;
  user_id: string;
  check_in: string;
  check_out: string;
  guest_count: number;
  gross_amount_vnd: number;
  discount_amount_vnd: number;
  final_paid_amount_vnd: number;
  payment_status: string;
  booking_status: string;
  created_at: string;
  updated_at: string;
  guestName?: string;
  guestPhone?: string;
}

/**
 * Checks whether a room is available for a given check-in and check-out date range.
 *
 * Availability logic:
 * - Room is unavailable if there exists an active booking with roomId and valid status
 *   ('confirmed' or 'paid') satisfying the half-open interval overlap condition:
 *   (booking.check_in < checkOut) AND (booking.check_out > checkIn)
 * - Returns `true` if room is available (no conflicting bookings).
 * - Returns `false` if room is already booked or upon invalid parameters / database error.
 *
 * @param roomId - The UUID of the room to check
 * @param checkIn - Arrival date in YYYY-MM-DD format
 * @param checkOut - Departure date in YYYY-MM-DD format (must be strictly after checkIn)
 * @returns Promise<boolean> - true if available, false if booked or error
 */
export async function checkRoomAvailability(
  roomId: string,
  checkIn: string,
  checkOut: string
): Promise<boolean> {
  // 1. Validate inputs defensively
  if (!roomId || typeof roomId !== "string" || roomId.trim().length === 0) {
    console.warn("[checkRoomAvailability] roomId không hợp lệ:", roomId);
    return false;
  }

  if (!checkIn || typeof checkIn !== "string" || !checkOut || typeof checkOut !== "string") {
    console.warn("[checkRoomAvailability] checkIn và checkOut là bắt buộc");
    return false;
  }

  const cleanRoomId = roomId.trim();
  const cleanCheckIn = checkIn.trim();
  const cleanCheckOut = checkOut.trim();

  // Validate that checkOut is strictly later than checkIn
  if (cleanCheckOut <= cleanCheckIn) {
    console.warn(
      `[checkRoomAvailability] Ngày trả phòng (${cleanCheckOut}) phải sau ngày nhận phòng (${cleanCheckIn})`
    );
    return false;
  }

  try {
    const supabase = await createClient();

    // Query for any conflicting bookings that overlap with requested stay window.
    // Overlap condition for half-open stay intervals [check_in, check_out):
    // booking.check_in < cleanCheckOut AND booking.check_out > cleanCheckIn
    const statusFilter =
      "booking_status.in.(confirmed,paid,CONFIRMED,PAID),payment_status.in.(confirmed,paid,CONFIRMED,PAID)";

    const { data, error } = await supabase
      .from("bookings")
      .select("id")
      .eq("room_id", cleanRoomId)
      .lt("check_in", cleanCheckOut)
      .gt("check_out", cleanCheckIn)
      .neq("booking_status", "cancelled")
      .or(statusFilter)
      .limit(1);

    if (error) {
      console.error(
        `[checkRoomAvailability] Lỗi truy vấn cơ sở dữ liệu cho phòng ${cleanRoomId}:`,
        error.message
      );
      // Defensive: do not confirm availability when database check fails
      return false;
    }

    // Overlapping booking found -> room is not available (false)
    // No overlapping booking found -> room is available (true)
    const hasOverlap = Boolean(data && data.length > 0);
    return !hasOverlap;
  } catch (err) {
    console.error("[checkRoomAvailability] Ngoại lệ không xác định:", err);
    return false;
  }
}

/**
 * Creates a confirmed booking safely after payment verification (e.g. VietQR).
 *
 * Safety workflow:
 * 1. Checks room availability once more to prevent race conditions / double bookings.
 * 2. If room is no longer available, throws an error asking the guest to select another date or room.
 * 3. If available, verifies authenticated user and inserts a new durable record into `bookings`.
 * 4. Updates profile contact info (display_name, phone) if provided.
 * 5. Returns the created booking record with its generated ID for navigation to /stay/[bookingId].
 *
 * @param bookingData - The booking details and verified payment status
 * @returns Promise<BookingRecord> - The newly created booking
 */
export async function createBookingSafe(
  bookingData: CreateBookingInput
): Promise<BookingRecord> {
  const cleanRoomId = bookingData.roomId.trim();
  const cleanCheckIn = bookingData.checkIn.trim();
  const cleanCheckOut = bookingData.checkOut.trim();

  // 1. Re-check room availability to guard against race conditions
  const isAvailable = await checkRoomAvailability(
    cleanRoomId,
    cleanCheckIn,
    cleanCheckOut
  );

  if (!isAvailable) {
    throw new Error(
      "Phòng này vừa có khách đặt trong khoảng ngày bạn chọn. Vui lòng chọn khoảng ngày hoặc phòng khác."
    );
  }

  const supabase = await createClient();

  // 2. Identify the authenticated user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userId = bookingData.userId || user?.id;

  if (!userId) {
    throw new Error(
      "Bạn cần đăng nhập tài khoản trước khi hoàn tất đặt phòng."
    );
  }

  // 3. Optional: update profile contact information
  if (bookingData.guestName || bookingData.guestPhone) {
    try {
      const updateData: { display_name?: string; phone?: string } = {};
      if (bookingData.guestName) updateData.display_name = bookingData.guestName.trim();
      if (bookingData.guestPhone) updateData.phone = bookingData.guestPhone.trim();

      await supabase.from("profiles").update(updateData).eq("id", userId);
    } catch (profileErr) {
      console.warn("[createBookingSafe] Could not update profile:", profileErr);
    }
  }

  // 4. Calculate exact monetary amounts
  const finalPaidAmount = Math.max(0, Math.round(bookingData.totalPrice));

  // 5. Insert durable confirmed booking record
  const { data: newBooking, error: insertError } = await supabase
    .from("bookings")
    .insert({
      room_id: cleanRoomId,
      user_id: userId,
      check_in: cleanCheckIn,
      check_out: cleanCheckOut,
      guest_count: bookingData.guestCount ?? 1,
      gross_amount_vnd: finalPaidAmount,
      discount_amount_vnd: 0,
      final_paid_amount_vnd: finalPaidAmount,
      payment_status: bookingData.paymentStatus,
      booking_status: "confirmed",
    })
    .select()
    .single();

  if (insertError || !newBooking) {
    console.error("[createBookingSafe] Lỗi insert booking:", insertError?.message);
    throw new Error(
      insertError?.message || "Không thể tạo đơn đặt phòng trong cơ sở dữ liệu."
    );
  }

  return {
    ...newBooking,
    guestName: bookingData.guestName,
    guestPhone: bookingData.guestPhone,
  };
}
