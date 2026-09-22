'use server';

import { createClient } from "@/lib/supabase/server";

export interface MyStayCredentialsRpcResponse {
  success: boolean;
  error?: string;
  booking_id?: string;
  is_active: boolean;
  digital_key: string | null;
  credential_type?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
  wifi_ssid: string | null;
  wifi_password: string | null;
}

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
  hasActiveCredential: boolean;
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function parseCredentialsResponse(data: unknown): Promise<any> {
  if (!data || typeof data !== "object") {
    return null;
  }
  const obj = data as Record<string, unknown>;
  if (typeof obj.success !== "boolean") {
    return null;
  }

  // Failure response: validate error string
  if (!obj.success) {
    if (typeof obj.error !== "string" || obj.error.trim().length === 0) {
      return null;
    }
    return {
      success: false,
      error: obj.error,
      is_active: false,
      digital_key: null,
      wifi_ssid: null,
      wifi_password: null,
    };
  }

  // Success response: enforce strict types without coercion
  // 1. booking_id MUST be a non-empty string
  if (typeof obj.booking_id !== "string" || obj.booking_id.trim().length === 0) {
    return null;
  }

  // 2. is_active MUST be a boolean
  if (typeof obj.is_active !== "boolean") {
    return null;
  }

  const credTypeValid =
    obj.credential_type === undefined ||
    obj.credential_type === null ||
    typeof obj.credential_type === "string";

  if (!credTypeValid) {
    return null;
  }

  // 3. Defense-in-depth: strict checks based on is_active state
  if (!obj.is_active) {
    // Inactive: secrets MUST be null
    if (obj.digital_key !== null || obj.wifi_ssid !== null || obj.wifi_password !== null) {
      return null;
    }
    const validFromValid =
      obj.valid_from === undefined ||
      obj.valid_from === null ||
      typeof obj.valid_from === "string";
    const validUntilValid =
      obj.valid_until === undefined ||
      obj.valid_until === null ||
      typeof obj.valid_until === "string";

    if (!validFromValid || !validUntilValid) {
      return null;
    }

    return {
      success: true,
      booking_id: obj.booking_id,
      is_active: false,
      digital_key: null,
      credential_type: typeof obj.credential_type === "string" ? obj.credential_type : null,
      valid_from: typeof obj.valid_from === "string" ? obj.valid_from : null,
      valid_until: typeof obj.valid_until === "string" ? obj.valid_until : null,
      wifi_ssid: null,
      wifi_password: null,
    };
  }

  // Active: digital_key, valid_from, valid_until MUST be non-empty strings
  if (typeof obj.digital_key !== "string" || obj.digital_key.trim().length === 0) {
    return null;
  }
  if (typeof obj.valid_from !== "string" || obj.valid_from.trim().length === 0) {
    return null;
  }
  if (typeof obj.valid_until !== "string" || obj.valid_until.trim().length === 0) {
    return null;
  }

  // Wi-Fi credentials can be string or null (if room_private_details is not seeded)
  const wifiSsidValid = obj.wifi_ssid === null || typeof obj.wifi_ssid === "string";
  const wifiPassValid = obj.wifi_password === null || typeof obj.wifi_password === "string";
  if (!wifiSsidValid || !wifiPassValid) {
    return null;
  }

  return {
    success: true,
    booking_id: obj.booking_id,
    is_active: true,
    digital_key: obj.digital_key,
    credential_type: typeof obj.credential_type === "string" ? obj.credential_type : null,
    valid_from: obj.valid_from,
    valid_until: obj.valid_until,
    wifi_ssid: typeof obj.wifi_ssid === "string" ? obj.wifi_ssid : null,
    wifi_password: typeof obj.wifi_password === "string" ? obj.wifi_password : null,
  };
}

/**
 * Retrieves full booking and stay details securely for TV5's My Stay view (/stay/[bookingId] or /my-stay).
 *
 * Security & Business Rules:
 * 1. Authenticates current user with Supabase Server Client (Google Auth).
 * 2. Enforces ownership: Throws Unauthorized (401) if not logged in,
 *    or Forbidden (403) if the booking does not belong to the user.
 * 3. Lifecycle UX uses booking interval [check_in, check_out] for UPCOMING / ACTIVE / COMPLETED / CANCELLED.
 * 4. CREDENTIAL ACCESS SOURCE OF TRUTH:
 *    Digital Key and Wi-Fi credentials are ONLY retrieved via trusted RPC get_my_stay_credentials
 *    which strictly enforces active booking_access_credentials window (valid_from <= NOW <= valid_until).
 *    Date calculations on check_in / check_out are NEVER used to reveal secrets.
 * 5. Returns authentic data only: No fake property addresses, room names, or credentials.
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

  // 5. Extract joined room and property data (Fail safely if required data is missing; no fake data)
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

  if (!room?.name || !property?.name || !property?.address) {
    console.error(`[getMyStayBookingDetails] Thiếu dữ liệu phòng hoặc cơ sở cho booking (${cleanBookingId})`);
    throw new Error("Dữ liệu thông tin phòng hoặc cơ sở không đầy đủ trong hệ thống.");
  }

  const roomName = room.name;
  const propertyName = property.name;
  const propertyAddress = property.address;
  const propertyMapsUrl = property.maps_url || null;
  const roomDescription = room.description || null;
  const roomImages = Array.isArray(room.image_paths) ? room.image_paths : [];
  const roomAmenities = Array.isArray(room.amenities) ? room.amenities : [];

  // 6. Time-window calculation for lifecycle UX only (Asia/Ho_Chi_Minh: UTC+7)
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

  // 7. Security: Call trusted RPC get_my_stay_credentials
  let passcode: string | null = null;
  let wifiSsid: string | null = null;
  let wifiPass: string | null = null;
  let instructions: string | null = null;
  let hasActiveCredential = false;

  let credsResponse: MyStayCredentialsRpcResponse | null = null;
  try {
    const { data: rawData, error: rpcError } = await supabase.rpc(
      "get_my_stay_credentials",
      { p_booking_id: booking.id }
    );

    if (rpcError) {
      console.error(`[getMyStayBookingDetails] Lỗi gọi RPC get_my_stay_credentials (${cleanBookingId}):`, rpcError);
      throw new Error("Lỗi hệ thống khi tải thông tin bảo mật phòng.");
    }

    credsResponse = await parseCredentialsResponse(rawData);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.startsWith("Lỗi hệ thống")) {
      throw err;
    }
    console.error(`[getMyStayBookingDetails] Ngoại lệ khi gọi RPC get_my_stay_credentials (${cleanBookingId}):`, err);
    throw new Error("Lỗi hệ thống khi tải thông tin bảo mật phòng.");
  }

  if (!credsResponse) {
    console.error(`[getMyStayBookingDetails] Phản hồi không hợp lệ từ RPC (${cleanBookingId})`);
    throw new Error("Lỗi hệ thống khi tải thông tin bảo mật phòng.");
  }

  if (credsResponse.success) {
    if (credsResponse.booking_id !== booking.id) {
      console.error(
        `[getMyStayBookingDetails] Booking ID mismatch (expected ${booking.id}, got ${credsResponse.booking_id})`
      );
      throw new Error("Lỗi hệ thống khi tải thông tin bảo mật phòng.");
    }
  }

  if (!credsResponse.success) {
    if (credsResponse.error === "UNAUTHORIZED") {
      throw new Error("Unauthorized: Vui lòng đăng nhập để xem thông tin kỳ nghỉ.");
    }
    if (credsResponse.error === "BOOKING_NOT_FOUND_OR_FORBIDDEN") {
      throw new Error("Forbidden: Bạn không có quyền truy cập vào đơn đặt phòng này.");
    }
    if (credsResponse.error === "BOOKING_NOT_ACTIVE") {
      hasActiveCredential = false;
    } else {
      console.error(`[getMyStayBookingDetails] RPC trả về lỗi (${cleanBookingId}):`, credsResponse.error);
      throw new Error("Lỗi hệ thống khi tải thông tin bảo mật phòng.");
    }
  } else {
    // RPC succeeded: hasActiveCredential is strictly from RPC is_active
    hasActiveCredential = credsResponse.is_active;
    if (hasActiveCredential) {
      passcode = credsResponse.digital_key;
      wifiSsid = credsResponse.wifi_ssid;
      wifiPass = credsResponse.wifi_password;
      if (
        credsResponse.credential_type?.toLowerCase() === "pin" &&
        passcode !== null
      ) {
        instructions = "Nhập mã số trên bàn phím khóa điện tử và bấm phím # để mở cửa.";
      }
    }
  }

  // Set appropriate activation notices when credentials are not active
  let activationNotice: string | null = null;
  if (!hasActiveCredential) {
    if (isUpcoming) {
      activationNotice = "Mã khóa và Wi-Fi sẽ kích hoạt vào ngày nhận phòng";
    } else if (isExpired) {
      activationNotice = "Kỳ nghỉ đã kết thúc. Mã khóa và Wi-Fi đã hết hiệu lực.";
    } else if (isCancelled) {
      activationNotice = "Đơn đặt phòng này đã bị hủy.";
    } else {
      activationNotice = "Thông tin khóa phòng đang được cập nhật.";
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
    hasActiveCredential,
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
