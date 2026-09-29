"use server";

import { createClient } from "@/lib/supabase/server";
import { normalizeToVietnamISO } from "@/lib/utils/format";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_FORMAT_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Checks if a given year is a leap year in Gregorian calendar.
 */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Returns the maximum number of calendar days in a given month and year.
 */
function getDaysInMonth(year: number, month: number): number {
  switch (month) {
    case 1:
    case 3:
    case 5:
    case 7:
    case 8:
    case 10:
    case 12:
      return 31;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    case 2:
      return isLeapYear(year) ? 29 : 28;
    default:
      return 0;
  }
}

/**
 * Validates that a string is a real calendar date in YYYY-MM-DD format.
 * Evaluates calendar boundaries directly (months 01-12, days per month, leap years)
 * without Date object instantiations to avoid any timezone side effects.
 */
function isValidCalendarDate(dateStr: string): boolean {
  if (!DATE_FORMAT_REGEX.test(dateStr)) {
    return false;
  }

  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  if (year < 1 || month < 1 || month > 12) {
    return false;
  }

  const maxDays = getDaysInMonth(year, month);
  return day >= 1 && day <= maxDays;
}

/**
 * Kiểm tra tính khả dụng của phòng theo khoảng ngày nhận và trả phòng.
 *
 * Hàm này đóng vai trò preliminary UX availability check cho phía client (TV3).
 * Không dùng thay thế cho atomic lock/constraint khi chốt đơn đặt phòng (TV4) để chống race condition.
 *
 * @param roomId - Mã định danh UUID của phòng
 * @param checkIn - Ngày nhận phòng định dạng YYYY-MM-DD
 * @param checkOut - Ngày trả phòng định dạng YYYY-MM-DD (phải sau ngày nhận phòng)
 * @returns Promise<boolean> - true nếu phòng còn trống, false nếu đã có lịch trùng hoặc dữ liệu không hợp lệ. Ném ngoại lệ khi gặp lỗi hệ thống / RPC.
 */
export async function checkRoomAvailability(
  roomId: string,
  checkIn: string,
  checkOut: string
): Promise<boolean> {
  // 1. Validate roomId theo định dạng UUID
  if (!roomId || typeof roomId !== "string" || !UUID_REGEX.test(roomId.trim())) {
    return false;
  }

  // 2. Validate checkIn và checkOut là ngày calendar hợp lệ (YYYY-MM-DD)
  if (
    !checkIn ||
    typeof checkIn !== "string" ||
    !checkOut ||
    typeof checkOut !== "string"
  ) {
    return false;
  }

  const cleanRoomId = roomId.trim();
  const cleanCheckIn = checkIn.trim();
  const cleanCheckOut = checkOut.trim();

  if (
    !isValidCalendarDate(cleanCheckIn) ||
    !isValidCalendarDate(cleanCheckOut)
  ) {
    return false;
  }

  // 3. checkOut phải strictly sau checkIn (so sánh chuỗi ISO YYYY-MM-DD tránh timezone offset)
  if (cleanCheckOut <= cleanCheckIn) {
    return false;
  }

  try {
    const supabase = await createClient();

    // Defense-in-depth: phòng chỉ được coi là khả dụng khi bản thân phòng đang
    // được mở bán và cơ sở cha vẫn đang active.
    const { data: publicRoom, error: publicRoomError } = await supabase
      .from("rooms")
      .select("id, properties!inner(id)")
      .eq("id", cleanRoomId)
      .eq("is_listed", true)
      .eq("properties.is_active", true)
      .maybeSingle();

    if (publicRoomError) {
      throw publicRoomError;
    }

    if (!publicRoom) {
      return false;
    }

    // Gọi RPC function check_room_availability từ Supabase
    const { data, error } = await supabase.rpc(
      "check_room_availability",
      {
        p_room_id: cleanRoomId,
        p_check_in: cleanCheckIn,
        p_check_out: cleanCheckOut,
      }
    );

    if (error) {
      throw error;
    }

    if (typeof data !== "boolean") {
      throw new Error(
        "Unexpected non-boolean response from availability check"
      );
    }

    return data;
  } catch (err) {
    console.error(
      "[checkRoomAvailability] Availability check failed:",
      err
    );
    throw new Error(
      "Không thể kiểm tra tình trạng phòng lúc này. Vui lòng thử lại."
    );
  }
}


/**
 * Kiểm tra tính khả dụng của phòng theo khoảng thời gian giờ nhận và trả phòng.
 *
 * @param roomId - Mã định danh UUID của phòng
 * @param checkInAt - Thời gian nhận phòng định dạng ISO hoặc YYYY-MM-DDTHH:mm
 * @param checkOutAt - Thời gian trả phòng (phải sau check-in ít nhất 2 giờ)
 * @returns Promise<boolean> - true nếu phòng còn trống
 */
export async function checkRoomAvailabilityHourly(
  roomId: string,
  checkInAt: string,
  checkOutAt: string
): Promise<boolean> {
  if (!roomId || typeof roomId !== "string" || !UUID_REGEX.test(roomId.trim())) {
    return false;
  }

  const isoIn = normalizeToVietnamISO(checkInAt);
  const isoOut = normalizeToVietnamISO(checkOutAt);

  if (!isoIn || !isoOut) {
    return false;
  }

  const tIn = new Date(isoIn).getTime();
  const tOut = new Date(isoOut).getTime();

  // checkOutAt phải sau checkInAt
  if (tOut <= tIn) {
    return false;
  }

  // Minimum booking: 2 hours (7,200,000 ms)
  if ((tOut - tIn) < 2 * 60 * 60 * 1000) {
    return false;
  }

  // Không cho phép đặt phòng trong quá khứ (5 phút dung sai)
  if (tIn < Date.now() - 5 * 60 * 1000) {
    return false;
  }

  try {
    const supabase = await createClient();

    const { data: publicRoom, error: publicRoomError } = await supabase
      .from("rooms")
      .select("id, properties!inner(id)")
      .eq("id", roomId.trim())
      .eq("is_listed", true)
      .eq("properties.is_active", true)
      .maybeSingle();

    if (publicRoomError) {
      throw publicRoomError;
    }

    if (!publicRoom) {
      return false;
    }

    const { data, error } = await supabase.rpc(
      "check_room_availability_hourly",
      {
        p_room_id: roomId.trim(),
        p_check_in_at: isoIn,
        p_check_out_at: isoOut,
      }
    );

    if (error) {
      throw error;
    }

    if (typeof data !== "boolean") {
      throw new Error(
        "Unexpected non-boolean response from hourly availability check"
      );
    }

    return data;
  } catch (err) {
    console.error(
      "[checkRoomAvailabilityHourly] Availability check failed:",
      err
    );
    throw new Error(
      "Không thể kiểm tra tình trạng phòng lúc này. Vui lòng thử lại."
    );
  }
}

export interface PublicTimelineInterval {
  start_at: string;
  end_at: string;
  state: "BOOKED" | "HELD" | "BLOCKED";
}

export interface PublicRoomAvailabilityTimelineResult {
  success: boolean;
  room_id?: string;
  range_start?: string;
  range_end?: string;
  intervals: PublicTimelineInterval[];
  error?: string;
}

/**
 * Lấy danh sách các khoảng thời gian đã được Đặt (BOOKED), Đang giữ (HELD), hoặc Khóa (BLOCKED)
 * trong ngày/khoảng thời gian. Dữ liệu công khai và đã được khử hoàn toàn thông tin định danh khách hàng.
 */
export async function getPublicRoomAvailabilityTimeline(
  roomId: string,
  rangeStart: string,
  rangeEnd: string
): Promise<PublicRoomAvailabilityTimelineResult> {
  if (!roomId || typeof roomId !== "string" || !UUID_REGEX.test(roomId.trim())) {
    return { success: false, intervals: [], error: "ID phòng không hợp lệ" };
  }

  const isoStart = normalizeToVietnamISO(rangeStart);
  const isoEnd = normalizeToVietnamISO(rangeEnd);

  if (!isoStart || !isoEnd) {
    return { success: false, intervals: [], error: "Khoảng thời gian không hợp lệ" };
  }

  try {
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)(
      "get_public_room_availability_timeline",
      {
        p_room_id: roomId.trim(),
        p_range_start: isoStart,
        p_range_end: isoEnd,
      }
    );

    if (error) {
      console.error("[getPublicRoomAvailabilityTimeline] RPC error:", error.message);
      return { success: false, intervals: [], error: error.message };
    }

    const payload = data as PublicRoomAvailabilityTimelineResult | null;
    if (!payload?.success) {
      return {
        success: false,
        intervals: [],
        error: payload?.error || "Không thể tải dữ liệu lịch trống",
      };
    }

    return {
      success: true,
      room_id: payload.room_id,
      range_start: payload.range_start,
      range_end: payload.range_end,
      intervals: Array.isArray(payload.intervals) ? payload.intervals : [],
    };
  } catch (err) {
    console.error("[getPublicRoomAvailabilityTimeline] Unexpected error:", err);
    return {
      success: false,
      intervals: [],
      error: "Không thể kết nối máy chủ để tải lịch trống phòng.",
    };
  }
}

/**
 * Hủy chủ động phiên tạm giữ phòng của người dùng hiện tại khi rời khỏi hoặc hủy đơn checkout.
 */
export async function releaseCheckoutHold(
  sessionId: string
): Promise<{ success: boolean; error?: string }> {
  if (!sessionId || typeof sessionId !== "string" || !UUID_REGEX.test(sessionId.trim())) {
    return { success: false, error: "ID phiên không hợp lệ" };
  }

  try {
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)(
      "release_checkout_hold_atomic",
      {
        p_checkout_session_id: sessionId.trim(),
      }
    );

    if (error) {
      console.error("[releaseCheckoutHold] RPC error:", error.message);
      return { success: false, error: error.message };
    }

    const payload = data as { success: boolean; error?: string } | null;
    return {
      success: payload?.success ?? false,
      error: payload?.error,
    };
  } catch (err) {
    console.error("[releaseCheckoutHold] Unexpected error:", err);
    return { success: false, error: "Không thể hủy phiên giữ phòng" };
  }
}
