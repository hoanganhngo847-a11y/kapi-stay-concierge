"use server";

import { createClient } from "@/lib/supabase/server";


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
