"use server";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";
import { isValidTicketCategory } from "./constants";

export type Ticket = Tables<"tickets">;

export interface CreateGuestTicketInput {
  bookingId: string;
  category: string;
  description: string;
  roomId?: string;
}

export type CreateGuestTicketResult =
  | { success: true; ticket: Ticket }
  | { success: false; error: string };

const DOMAIN_ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "Vui lòng đăng nhập để gửi yêu cầu hỗ trợ.",
  INVALID_BOOKING_ID: "Không tìm thấy thông tin đặt phòng hợp lệ.",
  INVALID_CATEGORY: "Danh mục yêu cầu không hợp lệ.",
  DESCRIPTION_TOO_SHORT: "Mô tả cần ít nhất 5 ký tự để lễ tân nắm bắt sự cố.",
  BOOKING_NOT_FOUND_OR_FORBIDDEN: "Không tìm thấy thông tin đặt phòng hợp lệ.",
  BOOKING_NOT_ACTIVE: "Đơn đặt phòng chưa được xác nhận hoặc đã bị hủy.",
  NO_ACTIVE_STAY_CREDENTIAL:
    "Kỳ lưu trú chưa bắt đầu, đã kết thúc hoặc không có quyền truy cập.",
};

const GENERIC_ERROR_MESSAGE =
  "Không thể tạo yêu cầu hỗ trợ lúc này. Vui lòng thử lại sau.";

export type TicketSupabaseClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: { message: string; [key: string]: unknown } | null }>;
  from?: (table: string) => {
    insert?: (payload: unknown) => unknown;
    select?: (columns?: string) => unknown;
  };
};

function isValidPersistedTicket(ticket: unknown): ticket is Ticket {
  if (!ticket || typeof ticket !== "object") {
    return false;
  }
  const t = ticket as Record<string, unknown>;
  if (typeof t.id !== "string" || !t.id.trim()) return false;
  if (typeof t.booking_id !== "string" || !t.booking_id.trim()) return false;
  if (typeof t.room_id !== "string" || !t.room_id.trim()) return false;
  if (typeof t.user_id !== "string" || !t.user_id.trim()) return false;
  if (!isValidTicketCategory(t.category)) return false;
  if (typeof t.description !== "string") return false;
  if (
    !Array.isArray(t.media_paths) ||
    !t.media_paths.every((item) => typeof item === "string")
  ) {
    return false;
  }
  if (t.status !== "pending") return false;
  if (typeof t.created_at !== "string" || !t.created_at.trim()) return false;
  if (typeof t.updated_at !== "string" || !t.updated_at.trim()) return false;

  return true;
}

/**
 * Server Action xử lý gửi yêu cầu hỗ trợ (Ticket) từ khách lưu trú.
 *
 * TV6 Core Security Invariants:
 * 1. Validate sơ bộ input (bookingId, whitelist category, min 5 ký tự description).
 * 2. Không tin cậy roomId từ client để xác định quyền sở hữu hay phòng lưu trú.
 * 3. Không direct INSERT vào bảng tickets (quyền INSERT đã bị REVOKE phía DB).
 * 4. Không tự query bảng bookings hoặc booking_access_credentials để kiểm tra ownership/stay window.
 * 5. Gọi duy nhất trusted RPC canonical `create_guest_ticket` với media_paths = [].
 * 6. Validate RPC response fail-closed (toàn bộ field id, status === 'pending', timestamps).
 * 7. Map các domain error chuẩn sang thông báo tiếng Việt thân thiện, không làm lộ chi tiết lỗi cơ sở dữ liệu.
 */
export async function createGuestTicketAction(
  input: CreateGuestTicketInput,
  clientOverride?: TicketSupabaseClient
): Promise<CreateGuestTicketResult> {
  try {
    // 1. Validate cơ bản trước RPC
    if (
      !input ||
      typeof input !== "object" ||
      typeof input.bookingId !== "string" ||
      !input.bookingId.trim()
    ) {
      return {
        success: false,
        error: "Không tìm thấy thông tin đặt phòng hợp lệ.",
      };
    }

    const cleanBookingId = input.bookingId.trim();
    const cleanCategory =
      typeof input.category === "string" ? input.category.trim() : "";
    const cleanDescription =
      typeof input.description === "string" ? input.description.trim() : "";

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

    // 2. Gọi trusted RPC canonical create_guest_ticket
    const supabase = clientOverride || (await createClient());
    const { data: rawRpcData, error: rpcError } = await supabase.rpc(
      "create_guest_ticket",
      {
        p_booking_id: cleanBookingId,
        p_category: cleanCategory,
        p_description: cleanDescription,
        p_media_paths: [],
      }
    );

    // 3. Xử lý lỗi transport/database từ RPC (Fail-Closed, Sanitized)
    if (rpcError) {
      console.error(
        `[createGuestTicketAction error]: Lỗi khi gọi create_guest_ticket (${cleanBookingId}):`,
        rpcError
      );
      return {
        success: false,
        error: GENERIC_ERROR_MESSAGE,
      };
    }

    // 4. Validate cấu trúc phản hồi RPC
    if (!rawRpcData || typeof rawRpcData !== "object") {
      console.error(
        `[createGuestTicketAction error]: Phản hồi RPC không hợp lệ (${cleanBookingId}):`,
        rawRpcData
      );
      return {
        success: false,
        error: GENERIC_ERROR_MESSAGE,
      };
    }

    const rpcResponse = rawRpcData as Record<string, unknown>;

    // 5. Map domain errors từ RPC nếu RPC trả về success === false
    if (rpcResponse.success === false) {
      const errorCode =
        typeof rpcResponse.error === "string" ? rpcResponse.error : "";
      const mappedMessage =
        DOMAIN_ERROR_MESSAGES[errorCode] || GENERIC_ERROR_MESSAGE;
      return {
        success: false,
        error: mappedMessage,
      };
    }

    if (rpcResponse.success !== true) {
      console.error(
        `[createGuestTicketAction error]: Phản hồi RPC không mang trạng thái thành công (${cleanBookingId}):`,
        rawRpcData
      );
      return {
        success: false,
        error: GENERIC_ERROR_MESSAGE,
      };
    }

    // 6. Validate nghiêm ngặt persisted ticket payload (Fail-Closed)
    if (
      typeof rpcResponse.ticket_id !== "string" ||
      !rpcResponse.ticket_id.trim() ||
      !isValidPersistedTicket(rpcResponse.ticket) ||
      rpcResponse.ticket_id !== rpcResponse.ticket.id
    ) {
      console.error(
        `[createGuestTicketAction error]: Phản hồi ticket từ RPC bị thiếu hoặc không đúng định dạng (${cleanBookingId}):`,
        rawRpcData
      );
      return {
        success: false,
        error: GENERIC_ERROR_MESSAGE,
      };
    }

    return {
      success: true,
      ticket: rpcResponse.ticket,
    };
  } catch (err: unknown) {
    console.error("[createGuestTicketAction error]:", err);
    return {
      success: false,
      error: GENERIC_ERROR_MESSAGE,
    };
  }
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CANONICAL_TICKET_STATUSES = [
  "pending",
  "in_progress",
  "resolved",
] as const;

export type GuestTicketCanonicalStatus =
  (typeof CANONICAL_TICKET_STATUSES)[number];

export interface GuestTicketStatusRecord {
  id: string;
  booking_id: string;
  category: string;
  description: string;
  status: GuestTicketCanonicalStatus;
  created_at: string;
  updated_at: string;
}

export type GetGuestTicketsResult =
  | { success: true; data: GuestTicketStatusRecord[] }
  | { success: false; error: string };

const GENERIC_FETCH_ERROR_MESSAGE =
  "Không thể tải danh sách yêu cầu hỗ trợ lúc này. Vui lòng thử lại sau.";

/**
 * Server Action đọc danh sách ticket của một booking từ góc nhìn khách lưu trú.
 *
 * Security & Integrity Invariants:
 * 1. Validate bookingId là UUID hợp lệ trước khi query.
 * 2. Không nhận userId từ client; RLS (user_id = auth.uid()) là authority cuối cùng.
 * 3. Dùng createClient() hiện có từ @/lib/supabase/server (không dùng service_role).
 * 4. Query public.tickets:
 *    select id, booking_id, category, description, status, created_at, updated_at
 *    eq("booking_id", cleanBookingId)
 *    order("created_at", { ascending: false })
 * 5. Fail-closed: Validate status trả về chỉ thuộc whitelist canonical (pending, in_progress, resolved).
 * 6. Lỗi được log server-side, client chỉ nhận thông báo generic đã sanitized.
 */
export async function getGuestTicketsAction(
  bookingId: string,
  clientOverride?: {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: unknown) => {
          order: (
            column: string,
            options?: { ascending?: boolean }
          ) => PromiseLike<{ data: unknown; error: unknown }>;
        };
      };
    };
  }
): Promise<GetGuestTicketsResult> {
  try {
    if (
      !bookingId ||
      typeof bookingId !== "string" ||
      !UUID_REGEX.test(bookingId.trim())
    ) {
      return {
        success: false,
        error: "Mã đặt phòng không đúng định dạng.",
      };
    }

    const cleanBookingId = bookingId.trim();
    const supabase = clientOverride || (await createClient());

    const { data, error } = await supabase
      .from("tickets")
      .select("id, booking_id, category, description, status, created_at, updated_at")
      .eq("booking_id", cleanBookingId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(
        `[getGuestTicketsAction error]: Lỗi khi truy vấn tickets (${cleanBookingId}):`,
        error
      );
      return {
        success: false,
        error: GENERIC_FETCH_ERROR_MESSAGE,
      };
    }

    if (!Array.isArray(data)) {
      console.error(
        `[getGuestTicketsAction error]: Dữ liệu trả về không phải là mảng (${cleanBookingId}):`,
        data
      );
      return {
        success: false,
        error: GENERIC_FETCH_ERROR_MESSAGE,
      };
    }

    const tickets: GuestTicketStatusRecord[] = [];

    for (const item of data) {
      if (!item || typeof item !== "object") {
        console.error(
          `[getGuestTicketsAction error]: Bản ghi ticket không hợp lệ (${cleanBookingId}):`,
          item
        );
        return {
          success: false,
          error: GENERIC_FETCH_ERROR_MESSAGE,
        };
      }

      const t = item as Record<string, unknown>;

      if (
        typeof t.id !== "string" ||
        !t.id.trim() ||
        typeof t.booking_id !== "string" ||
        !t.booking_id.trim() ||
        typeof t.category !== "string" ||
        typeof t.description !== "string" ||
        typeof t.created_at !== "string" ||
        typeof t.updated_at !== "string"
      ) {
        console.error(
          `[getGuestTicketsAction error]: Cấu trúc ticket bị thiếu trường bắt buộc (${cleanBookingId}):`,
          t
        );
        return {
          success: false,
          error: GENERIC_FETCH_ERROR_MESSAGE,
        };
      }

      if (
        typeof t.status !== "string" ||
        !(CANONICAL_TICKET_STATUSES as readonly string[]).includes(t.status)
      ) {
        console.error(
          `[getGuestTicketsAction error]: Trạng thái ticket không thuộc canonical whitelist (${cleanBookingId}, status=${String(t.status)}):`,
          t
        );
        return {
          success: false,
          error: GENERIC_FETCH_ERROR_MESSAGE,
        };
      }

      tickets.push({
        id: t.id,
        booking_id: t.booking_id,
        category: t.category,
        description: t.description,
        status: t.status as GuestTicketCanonicalStatus,
        created_at: t.created_at,
        updated_at: t.updated_at,
      });
    }

    return {
      success: true,
      data: tickets,
    };
  } catch (err: unknown) {
    console.error("[getGuestTicketsAction error]:", err);
    return {
      success: false,
      error: GENERIC_FETCH_ERROR_MESSAGE,
    };
  }
}
