"use server";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

export type Ticket = Tables<"tickets">;

export interface CreateGuestTicketInput {
  bookingId: string;
  roomId: string;
  category: string;
  description: string;
}

export type CreateGuestTicketResult =
  | { success: true; ticket: Ticket }
  | { success: false; error: string };

/**
 * Server Action xử lý gửi yêu cầu hỗ trợ (Ticket) từ khách lưu trú.
 *
 * Thực hiện xác thực và phân quyền phía máy chủ (Server-side):
 * 1. Xác thực phiên đăng nhập người dùng (auth.getUser()).
 * 2. Xác thực tính hợp lệ và quyền sở hữu đơn đặt phòng (user_id === user.id && room_id === roomId).
 * 3. Kiểm tra trạng thái booking chuẩn (canonical booking_status === 'confirmed').
 * 4. Kiểm tra khung giờ lưu trú hợp lệ (booking_access_credentials active hoặc 14:00 check_in - 12:00 check_out UTC+7).
 * 5. Tạo bản ghi ticket an toàn với media_paths = [] và status = 'pending'.
 * 6. Tuyệt đối không để lộ thông báo lỗi thô của cơ sở dữ liệu ra client.
 */
export async function createGuestTicketAction(
  input: CreateGuestTicketInput
): Promise<CreateGuestTicketResult> {
  try {
    // 1. Kiểm tra tính hợp lệ của tham số đầu vào
    if (
      !input ||
      typeof input !== "object" ||
      !input.bookingId?.trim() ||
      !input.roomId?.trim() ||
      !input.category?.trim() ||
      !input.description?.trim()
    ) {
      return {
        success: false,
        error: "Không tìm thấy thông tin đặt phòng hợp lệ.",
      };
    }

    const cleanBookingId = input.bookingId.trim();
    const cleanRoomId = input.roomId.trim();
    const cleanCategory = input.category.trim();
    const cleanDescription = input.description.trim();

    if (cleanDescription.length < 5) {
      return {
        success: false,
        error: "Mô tả cần ít nhất 5 ký tự để lễ tân nắm bắt sự cố.",
      };
    }

    // 2. Xác thực người dùng phía server
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        success: false,
        error: "Vui lòng đăng nhập để gửi yêu cầu hỗ trợ.",
      };
    }

    // 3. Xác thực quyền sở hữu và tính toàn vẹn của đơn đặt phòng
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, user_id, room_id, booking_status, check_in, check_out")
      .eq("id", cleanBookingId)
      .maybeSingle();

    if (bookingError || !booking) {
      if (bookingError) {
        console.error(
          `[createGuestTicketAction error]: Lỗi truy vấn booking (${cleanBookingId}):`,
          bookingError
        );
      }
      return {
        success: false,
        error: "Không tìm thấy thông tin đặt phòng hợp lệ.",
      };
    }

    if (booking.user_id !== user.id || booking.room_id !== cleanRoomId) {
      return {
        success: false,
        error: "Không tìm thấy thông tin đặt phòng hợp lệ.",
      };
    }

    // 4. Kiểm tra trạng thái booking chuẩn (chỉ chấp nhận 'confirmed')
    const normalizedStatus = (booking.booking_status || "").toLowerCase().trim();
    if (normalizedStatus !== "confirmed") {
      return {
        success: false,
        error: "Đơn đặt phòng chưa được xác nhận hoặc đã bị hủy.",
      };
    }

    // 5. Kiểm tra thời gian lưu trú (Stay Window Enforcement)
    const now = Date.now();
    let hasActiveCredential = false;
    let isWithinCredentialWindow = false;

    try {
      const { data: credentials, error: credsError } = await supabase
        .from("booking_access_credentials")
        .select("valid_from, valid_until")
        .eq("booking_id", booking.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1);

      if (credsError) {
        console.error(
          `[createGuestTicketAction error]: Truy vấn access credentials (${booking.id}):`,
          credsError
        );
      } else if (credentials && credentials.length > 0) {
        const cred = credentials[0];
        if (cred.valid_from && cred.valid_until) {
          const credStart = new Date(cred.valid_from).getTime();
          const credEnd = new Date(cred.valid_until).getTime();

          if (!isNaN(credStart) && !isNaN(credEnd)) {
            hasActiveCredential = true;
            isWithinCredentialWindow = now >= credStart && now <= credEnd;
          }
        }
      }
    } catch (credException) {
      console.error(
        `[createGuestTicketAction error]: Ngoại lệ khi kiểm tra credentials (${booking.id}):`,
        credException
      );
    }

    if (hasActiveCredential) {
      if (!isWithinCredentialWindow) {
        return {
          success: false,
          error: "Kỳ lưu trú chưa bắt đầu hoặc đã kết thúc.",
        };
      }
    } else {
      // Nếu không có bản ghi credential nào, áp dụng khung giờ chuẩn khách sạn (Asia/Ho_Chi_Minh: UTC+7)
      // Check-in: 14:00:00+07:00 ngày nhận phòng
      // Check-out: 12:00:00+07:00 ngày trả phòng
      const checkInDateStr = booking.check_in.includes("T")
        ? booking.check_in.split("T")[0].trim()
        : booking.check_in.trim();
      const checkOutDateStr = booking.check_out.includes("T")
        ? booking.check_out.split("T")[0].trim()
        : booking.check_out.trim();

      const checkInStartTime = new Date(`${checkInDateStr}T14:00:00+07:00`).getTime();
      const checkOutEndTime = new Date(`${checkOutDateStr}T12:00:00+07:00`).getTime();

      if (
        isNaN(checkInStartTime) ||
        isNaN(checkOutEndTime) ||
        now < checkInStartTime ||
        now > checkOutEndTime
      ) {
        return {
          success: false,
          error: "Kỳ lưu trú chưa bắt đầu hoặc đã kết thúc.",
        };
      }
    }

    // 6. Tạo ticket nguyên tử (Atomic Ticket Creation)
    const { data: ticket, error: insertError } = await supabase
      .from("tickets")
      .insert({
        user_id: user.id, // Lấy trực tiếp từ auth.getUser(), không tin cậy client
        booking_id: booking.id,
        room_id: booking.room_id,
        category: cleanCategory,
        description: cleanDescription,
        status: "pending",
        media_paths: [],
      })
      .select()
      .single();

    if (insertError || !ticket) {
      console.error(
        `[createGuestTicketAction error]: Lỗi khi thêm ticket vào database:`,
        insertError
      );
      return {
        success: false,
        error: "Không thể tạo yêu cầu hỗ trợ lúc này. Vui lòng thử lại sau.",
      };
    }

    return {
      success: true,
      ticket: ticket as Ticket,
    };
  } catch (err: unknown) {
    console.error("[createGuestTicketAction error]:", err);
    return {
      success: false,
      error: "Không thể tạo yêu cầu hỗ trợ lúc này. Vui lòng thử lại sau.",
    };
  }
}
