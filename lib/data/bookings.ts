"use server";

import { createClient } from "@/lib/supabase/server";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Kiểm tra tính khả dụng của phòng theo khoảng ngày nhận và trả phòng.
 *
 * Hàm này đóng vai trò preliminary UX availability check cho phía client (TV3).
 * Không dùng thay thế cho atomic lock/constraint khi chốt đơn đặt phòng (TV4) để chống race condition.
 *
 * @param roomId - Mã định danh UUID của phòng
 * @param checkIn - Ngày nhận phòng định dạng YYYY-MM-DD
 * @param checkOut - Ngày trả phòng định dạng YYYY-MM-DD (phải sau ngày nhận phòng)
 * @returns Promise<boolean> - true nếu phòng còn trống, false nếu đã có lịch trùng hoặc dữ liệu không hợp lệ
 */
export async function checkRoomAvailability(
  roomId: string,
  checkIn: string,
  checkOut: string
): Promise<boolean> {
  // 1. Validate roomId theo định dạng UUID regex
  if (!roomId || typeof roomId !== "string" || !UUID_REGEX.test(roomId.trim())) {
    return false;
  }

  // 2. Validate checkIn và checkOut theo định dạng YYYY-MM-DD
  if (
    !checkIn ||
    typeof checkIn !== "string" ||
    !DATE_REGEX.test(checkIn.trim()) ||
    !checkOut ||
    typeof checkOut !== "string" ||
    !DATE_REGEX.test(checkOut.trim())
  ) {
    return false;
  }

  const cleanRoomId = roomId.trim();
  const cleanCheckIn = checkIn.trim();
  const cleanCheckOut = checkOut.trim();

  // 3. Kiểm tra ngày: new Date(checkOut) > new Date(checkIn)
  const checkInDate = new Date(cleanCheckIn);
  const checkOutDate = new Date(cleanCheckOut);

  if (
    isNaN(checkInDate.getTime()) ||
    isNaN(checkOutDate.getTime()) ||
    !(checkOutDate > checkInDate)
  ) {
    return false;
  }

  try {
    const supabase = await createClient();

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
      console.error(
        `[checkRoomAvailability] Lỗi RPC check_room_availability cho phòng ${cleanRoomId}:`,
        error.message
      );
      return false;
    }

    return Boolean(data);
  } catch (err) {
    console.error("[checkRoomAvailability] Ngoại lệ không xác định:", err);
    return false;
  }
}
