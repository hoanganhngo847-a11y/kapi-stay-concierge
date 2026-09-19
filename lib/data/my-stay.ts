"use server";

import { createClient } from "@/lib/supabase/server";

export interface MyStayBookingDetails {
  bookingId: string;
  userId: string;
  roomId: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  finalPaidAmount: number;
  bookingStatus: string;
  paymentStatus: string;
  createdAt: string;

  // Stay lifecycle
  stayStatus: "ACTIVE" | "UPCOMING" | "COMPLETED" | "CANCELLED";
  isActiveStay: boolean;
  activationNotice: string | null;

  // Room & Property Info
  roomName: string;
  roomDescription: string | null;
  roomImages: string[];
  roomAmenities: string[];
  propertyName: string;
  propertyAddress: string;
  propertyMapsUrl: string | null;

  // Sensitive Room Access Credentials (only revealed during active stay window)
  passcode: string | null;
  wifi_ssid: string | null;
  wifi_pass: string | null;
  wifiSsid: string | null;
  wifiPass: string | null;
  instructions: string | null;
}

/**
 * Retrieves full booking and stay details securely for TV5's My Stay view (/stay/[bookingId] or /my-stay).
 *
 * Security & Business Rules:
 * 1. Authenticates current user with Supabase Server Client (Google Auth).
 * 2. Enforces ownership: Throws Unauthorized (401) if not logged in,
 *    or Forbidden (403) if the booking does not belong to the user.
 * 3. Compares current time (Date.now()) with the stay interval [check_in, check_out].
 * 4. IF WITHIN STAY WINDOW:
 *    Returns room details, property address, passcode (door PIN), wifi_ssid, and wifi_pass.
 * 5. IF BEFORE CHECK-IN OR AFTER CHECK-OUT:
 *    Hides passcode and wifi_pass (sets to null) and provides activationNotice:
 *    "Mã khóa và Wi-Fi sẽ kích hoạt vào ngày nhận phòng".
 *
 * @param bookingId - The UUID or ID of the booking to retrieve
 * @returns Promise<MyStayBookingDetails>
 */
export async function getMyStayBookingDetails(
  bookingId: string
): Promise<MyStayBookingDetails> {
  // 1. Validate parameter
  if (!bookingId || typeof bookingId !== "string" || bookingId.trim().length === 0) {
    throw new Error("Mã đơn đặt phòng không hợp lệ.");
  }

  const cleanBookingId = bookingId.trim();
  const supabase = await createClient();

  // 2. Authenticate current user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Unauthorized: Vui lòng đăng nhập để xem thông tin kỳ nghỉ.");
  }

  // 3. Query booking with joined room & property details
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select(`
      id,
      user_id,
      room_id,
      check_in,
      check_out,
      guest_count,
      gross_amount_vnd,
      discount_amount_vnd,
      final_paid_amount_vnd,
      payment_status,
      booking_status,
      created_at,
      updated_at,
      rooms (
        id,
        name,
        description,
        capacity,
        image_paths,
        amenities,
        property_id,
        properties (
          id,
          name,
          slug,
          address,
          maps_url
        )
      )
    `)
    .eq("id", cleanBookingId)
    .maybeSingle();

  if (bookingError) {
    console.error(`[getMyStayBookingDetails] Lỗi truy vấn booking (${cleanBookingId}):`, bookingError.message);
    throw new Error("Lỗi khi tải thông tin kỳ nghỉ từ hệ thống.");
  }

  if (!booking) {
    throw new Error("Forbidden: Đơn đặt phòng không tồn tại hoặc bạn không có quyền truy cập.");
  }

  // 4. Verify booking ownership
  if (booking.user_id !== user.id) {
    throw new Error("Forbidden: Bạn không có quyền truy cập vào đơn đặt phòng này.");
  }

  // 5. Extract joined room and property data
  const rawRoom = booking.rooms as unknown;
  const room = Array.isArray(rawRoom) ? rawRoom[0] : (rawRoom as {
    id: string;
    name: string;
    description: string | null;
    capacity: number;
    image_paths: string[];
    amenities: string[];
    properties: {
      id: string;
      name: string;
      slug: string;
      address: string;
      maps_url: string | null;
    } | {
      id: string;
      name: string;
      slug: string;
      address: string;
      maps_url: string | null;
    }[] | null;
  } | null);

  const rawProperty = room?.properties as unknown;
  const property = Array.isArray(rawProperty) ? rawProperty[0] : (rawProperty as {
    id: string;
    name: string;
    slug: string;
    address: string;
    maps_url: string | null;
  } | null);

  const roomName = room?.name || "Phòng Kapi House";
  const propertyName = property?.name || "Kapi House";
  const propertyAddress = property?.address || "Đà Lạt, Lâm Đồng";
  const propertyMapsUrl = property?.maps_url || null;
  const roomDescription = room?.description || null;
  const roomImages = Array.isArray(room?.image_paths) ? room.image_paths : [];
  const roomAmenities = Array.isArray(room?.amenities) ? room.amenities : [];

  // 6. Time-window calculation (Asia/Ho_Chi_Minh: UTC+7)
  // Extract clean YYYY-MM-DD in case the date column returns ISO timestamp
  const checkInDateStr = booking.check_in.includes("T")
    ? booking.check_in.split("T")[0].trim()
    : booking.check_in.trim();
  const checkOutDateStr = booking.check_out.includes("T")
    ? booking.check_out.split("T")[0].trim()
    : booking.check_out.trim();

  // Check-in day starts at 00:00:00 UTC+7; Check-out day ends at 23:59:59.999 UTC+7
  const checkInStartTime = new Date(`${checkInDateStr}T00:00:00+07:00`).getTime();
  const checkOutEndTime = new Date(`${checkOutDateStr}T23:59:59.999+07:00`).getTime();
  const now = Date.now();

  const isCancelled = booking.booking_status.toLowerCase() === "cancelled";
  const isUpcoming = now < checkInStartTime;
  const isExpired = now > checkOutEndTime;
  const isActiveStay = !isCancelled && now >= checkInStartTime && now <= checkOutEndTime;

  let stayStatus: "ACTIVE" | "UPCOMING" | "COMPLETED" | "CANCELLED" = "ACTIVE";
  if (isCancelled) {
    stayStatus = "CANCELLED";
  } else if (isUpcoming) {
    stayStatus = "UPCOMING";
  } else if (isExpired) {
    stayStatus = "COMPLETED";
  }

  // 7. Security: fetch or derive door PIN (Digital Key) & Wi-Fi credentials
  let passcode: string | null = null;
  let wifiSsid: string | null = null;
  let wifiPass: string | null = null;
  let instructions: string | null = null;
  let activationNotice: string | null = null;

  if (isActiveStay) {
    // A. Query door credentials from booking_access_credentials
    try {
      const { data: creds } = await supabase
        .from("booking_access_credentials")
        .select("credential_value, instructions")
        .eq("booking_id", booking.id)
        .eq("status", "active")
        .maybeSingle();

      if (creds?.credential_value) {
        passcode = creds.credential_value;
        instructions = creds.instructions;
      }
    } catch (credErr) {
      console.warn("[getMyStayBookingDetails] Could not fetch booking_access_credentials:", credErr);
    }

    // Fallback passcode for development / demo if not yet seeded
    if (!passcode) {
      // Deterministic 6-digit passcode from booking ID
      const digits = booking.id.replace(/\D/g, "");
      passcode = (digits.slice(-6) || "888666").padStart(6, "8");
      instructions = "Nhập mã số trên bàn phím khóa điện tử và bấm phím # để mở cửa.";
    }

    // B. Query private details (Wi-Fi) from room_private_details
    try {
      const { data: priv } = await supabase
        .from("room_private_details")
        .select("wifi_ssid, wifi_password, private_instructions")
        .eq("room_id", booking.room_id)
        .maybeSingle();

      if (priv) {
        wifiSsid = priv.wifi_ssid;
        wifiPass = priv.wifi_password;
        if (!instructions && priv.private_instructions) {
          instructions = priv.private_instructions;
        }
      }
    } catch (privErr) {
      console.warn("[getMyStayBookingDetails] Could not fetch room_private_details:", privErr);
    }

    // Fallback Wi-Fi for development / demo if not yet seeded
    if (!wifiSsid) {
      wifiSsid = `Kapi_${property?.slug || "Guest"}`;
    }
    if (!wifiPass) {
      wifiPass = "kapi@welcome2026";
    }
  } else {
    // Out of stay window: mask sensitive credentials
    passcode = null;
    wifiPass = null;
    wifiSsid = null;
    instructions = null;

    if (isUpcoming) {
      activationNotice = "Mã khóa và Wi-Fi sẽ kích hoạt vào ngày nhận phòng";
    } else if (isExpired) {
      activationNotice = "Kỳ nghỉ đã kết thúc. Mã khóa và Wi-Fi đã hết hiệu lực.";
    } else {
      activationNotice = "Đơn đặt phòng này đã bị hủy.";
    }
  }

  return {
    bookingId: booking.id,
    userId: booking.user_id,
    roomId: booking.room_id,
    checkIn: booking.check_in,
    checkOut: booking.check_out,
    guestCount: booking.guest_count,
    finalPaidAmount: Number(booking.final_paid_amount_vnd) || 0,
    bookingStatus: booking.booking_status,
    paymentStatus: booking.payment_status,
    createdAt: booking.created_at,

    stayStatus,
    isActiveStay,
    activationNotice,

    roomName,
    roomDescription,
    roomImages,
    roomAmenities,
    propertyName,
    propertyAddress,
    propertyMapsUrl,

    passcode,
    wifi_ssid: wifiSsid,
    wifi_pass: wifiPass,
    wifiSsid,
    wifiPass,
    instructions,
  };
}
