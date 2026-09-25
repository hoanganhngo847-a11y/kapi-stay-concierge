"use server";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";
import { isValidTicketCategory } from "./constants";

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
 * 1. Xác thực tham số đầu vào và danh mục sự cố (isValidTicketCategory).
 * 2. Xác thực phiên đăng nhập người dùng (auth.getUser()).
 * 3. Xác thực tính hợp lệ và quyền sở hữu đơn đặt phòng (user_id === user.id && room_id === roomId).
 * 4. Kiểm tra trạng thái booking chuẩn (canonical booking_status === 'confirmed').
 * 5. Xác thực khung giờ lưu trú active qua trusted RPC get_my_stay_credentials (Fail-Closed).
 * 6. Tạo bản ghi ticket an toàn với media_paths = [] và status = 'pending'.
 * 7. Tuyệt đối không để lộ thông báo lỗi thô của cơ sở dữ liệu ra client.
 */
export type TicketSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export async function createGuestTicketAction(
  input: CreateGuestTicketInput,
  clientOverride?: TicketSupabaseClient
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

    // Validate danh mục sự cố theo whitelist chuẩn (Defect C.6)
    if (!isValidTicketCategory(cleanCategory)) {
      return {
        success: false,
        error: "Danh mục yêu cầu không hợp lệ.",
      };
    }

    if (cleanDescription.length < 5) {
      return {
        success: false,
        error: "Mô tả cần ít nhất 5 ký tự để lễ tân nắm bắt sự cố.",
      };
    }

    // 2. Xác thực người dùng phía server
    const supabase = clientOverride || (await createClient());
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
      .select("id, user_id, room_id, booking_status")
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

    // 5. Xác thực thời gian lưu trú bằng trusted RPC get_my_stay_credentials (Defects C.2, C.3, C.4)
    // Tuyệt đối không query trực tiếp booking_access_credentials và không fallback tính giờ thủ công
    const { data: rawRpcData, error: rpcError } = await supabase.rpc(
      "get_my_stay_credentials",
      { p_booking_id: cleanBookingId }
    );

    if (rpcError) {
      console.error(
        `[createGuestTicketAction error]: Lỗi khi gọi get_my_stay_credentials (${cleanBookingId}):`,
        rpcError
      );
      return {
        success: false,
        error: "Không thể xác thực thông tin lưu trú. Vui lòng thử lại sau.",
      };
    }

    const rpcResponse = rawRpcData as { success?: boolean; is_active?: boolean } | null;
    if (!rpcResponse || rpcResponse.success !== true || rpcResponse.is_active !== true) {
      return {
        success: false,
        error: "Kỳ lưu trú chưa bắt đầu, đã kết thúc hoặc không có quyền truy cập.",
      };
    }

    // 6. Tạo ticket nguyên tử (Atomic Ticket Creation)
    const { data: ticket, error: insertError } = await supabase
      .from("tickets")
      .insert({
        user_id: user.id, // Lấy trực tiếp từ auth.getUser(), không tin cậy client
        booking_id: cleanBookingId,
        room_id: cleanRoomId,
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
