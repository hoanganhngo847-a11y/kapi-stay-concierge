/**
 * @file lib/data/checkout.ts
 * @owner TV4 — Linh (feat/booking-checkout)
 *
 * Data access layer cho module Checkout / Booking / Payment.
 * Chỉ sử dụng Supabase server client được cấp phép. Tuân thủ đúng schema
 * đã thiết kế trong docs/SUPABASE_SCHEMA_DESIGN.md và kiểu dữ liệu từ
 * lib/database.types.ts.
 *
 * QUY TẮC BẤT DI BẤT DỊCH (theo docs/TEAM_FILE_OWNERSHIP.md):
 * - KHÔNG tự tạo flow auth riêng. Sử dụng requireBookingAuth() khi cần.
 * - KHÔNG khởi tạo client Supabase ngoài createClient() từ lib/supabase/server.
 * - KHÔNG sửa schema / migrations / RLS. Phối hợp TV8 (Quỳnh) nếu cần thêm DB.
 * - KHÔNG can thiệp vào lib/data/rooms.ts hay các file của thành viên khác.
 *
 * NGHIỆP VỤ CỐT LÕI (theo docs/PROJECT_GUIDE.md & AGENTS.md):
 * - Thanh toán 100% trước khi tạo booking. KHÔNG hỗ trợ đặt cọc hay trả góp.
 * - checkout_sessions là trạng thái tạm thời; bookings là kết quả bền vững đã thanh toán.
 * - Tối đa 1 voucher / booking. Điểm loyalty = final_paid_amount_vnd × 0.00025.
 * - voucher_redemptions.checkout_session_id là nguồn chân lý cho voucher tạm giữ.
 *
 * CẬP NHẬT (feat/booking-checkout — sau khi merge main từ TV8):
 * Tất cả thao tác ghi (INSERT / UPDATE) đã được chuyển sang gọi RPC
 * SECURITY DEFINER do TV8 (Quỳnh) cung cấp qua migration
 * 20260920120000_trusted_checkout_flow.sql, giải quyết [Blocker 1]:
 * Direct insert/update bị RLS chặn.
 *
 * Các RPC được sử dụng:
 *   - create_checkout_session_atomic   → createCheckoutSession
 *   - reserve_checkout_voucher_atomic  → validateAndApplyVoucher
 *   - release_checkout_voucher_atomic  → releaseVoucherFromSession
 *
 * LƯU Ý: finalize_verified_checkout_atomic (service_role only) KHÔNG được gọi
 * từ frontend. Việc finalize booking sẽ do payment webhook xử lý (TV1 + TV8).
 */

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

// ---------------------------------------------------------------------------
// Re-export kiểu tiện dụng để component có thể import từ một nơi duy nhất
// ---------------------------------------------------------------------------

export type CheckoutSession = Tables<"checkout_sessions">;
export type Booking = Tables<"bookings">;
export type Voucher = Tables<"vouchers">;
export type VoucherRedemption = Tables<"voucher_redemptions">;

/**
 * Kết quả chứa chi tiết checkout session kèm thông tin phòng (join).
 */
export interface CheckoutSessionWithRoom extends CheckoutSession {
  room: {
    id: string;
    name: string;
    nightly_price_vnd: number;
    capacity: number;
    image_paths: string[];
    property: {
      id: string;
      name: string;
      address: string;
      maps_url: string | null;
    } | null;
  } | null;
}

/**
 * Dữ liệu đầu vào để tạo checkout session.
 * gross_amount_vnd KHÔNG được truyền vào — RPC tự tính server-side
 * từ nightly_price_vnd × số đêm để đảm bảo giá trị không bị giả mạo.
 */
export interface CreateCheckoutSessionInput {
  roomId: string;
  checkIn: string;   // ISO date string: "YYYY-MM-DD"
  checkOut: string;  // ISO date string: "YYYY-MM-DD"
  guestCount: number;
}

/**
 * Kết quả trả về của validateAndApplyVoucher.
 */
export interface VoucherValidationResult {
  valid: boolean;
  redemption: VoucherRedemption | null;
  discountAmountVnd: number;
  errorMessage: string | null;
}

// ---------------------------------------------------------------------------
// Helper: ánh xạ mã lỗi RPC → thông báo tiếng Việt thân thiện
// ---------------------------------------------------------------------------

const RPC_ERROR_MESSAGES: Record<string, string> = {
  // create_checkout_session_atomic
  UNAUTHORIZED: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  INVALID_DATE_RANGE: "Ngày nhận / trả phòng không hợp lệ.",
  INVALID_GUEST_COUNT: "Số khách không hợp lệ.",
  ROOM_NOT_FOUND_OR_UNLISTED:
    "Phòng không tồn tại hoặc hiện không còn nhận đặt phòng.",
  GUEST_COUNT_EXCEEDS_CAPACITY: "Số khách vượt quá sức chứa của phòng.",
  ROOM_NOT_AVAILABLE:
    "Phòng đã được đặt trong khoảng thời gian này. Vui lòng chọn ngày khác.",

  // reserve_checkout_voucher_atomic
  CHECKOUT_SESSION_NOT_FOUND: "Không tìm thấy phiên đặt phòng.",
  FORBIDDEN: "Bạn không có quyền thực hiện thao tác này.",
  INVALID_CHECKOUT_SESSION_STATUS:
    "Phiên đặt phòng không ở trạng thái hợp lệ để áp voucher.",
  CHECKOUT_SESSION_EXPIRED:
    "Phiên đặt phòng đã hết hạn. Vui lòng bắt đầu lại.",
  VOUCHER_ALREADY_RESERVED:
    "Phiên này đã có voucher được áp dụng. Vui lòng hủy trước.",
  VOUCHER_NOT_FOUND: "Không tìm thấy voucher.",
  VOUCHER_NOT_AVAILABLE: "Voucher không ở trạng thái khả dụng.",
  VOUCHER_EXPIRED: "Voucher đã hết hạn sử dụng.",
  VOUCHER_DEFINITION_INVALID: "Loại voucher này hiện không còn hiệu lực.",

  // release_checkout_voucher_atomic
  NO_RESERVED_VOUCHER_ATTACHED:
    "Không có voucher nào đang được gắn vào phiên này.",

};

function mapRpcError(errorCode: string | undefined | null, fallback: string): string {
  if (!errorCode) return fallback;
  return RPC_ERROR_MESSAGES[errorCode] ?? fallback;
}

// ---------------------------------------------------------------------------
// Hàm 1 — Tạo phiên checkout tạm thời
// ---------------------------------------------------------------------------

/**
 * Tạo một bản ghi mới trong bảng `checkout_sessions` thông qua RPC
 * `create_checkout_session_atomic` (SECURITY DEFINER, authenticated).
 *
 * RPC đảm bảo:
 * - gross_amount_vnd được tính server-side: nightly_price_vnd × số đêm
 * - payment_reference được sinh server-side từ session ID
 * - Dọn dẹp opportunistic các ACTIVE sessions đã hết hạn của caller
 * - Kiểm tra sơ bộ availability (final check xảy ra tại finalize)
 *
 * THAY ĐỔI SO VỚI TRƯỚC: không truyền grossAmountVnd nữa — RPC tự tính.
 *
 * @returns ID của checkout session vừa tạo, hoặc error string nếu thất bại.
 */
export async function createCheckoutSession(
  input: CreateCheckoutSessionInput
): Promise<{ sessionId: string | null; error: string | null }> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc(
      "create_checkout_session_atomic",
      {
        p_room_id: input.roomId,
        p_check_in: input.checkIn,
        p_check_out: input.checkOut,
        p_guest_count: input.guestCount,
      }
    );

    if (error) {
      console.error("[checkout] createCheckoutSession RPC error:", error.message);
      return { sessionId: null, error: "Không thể tạo phiên đặt phòng. Vui lòng thử lại." };
    }

    // RPC trả về JSONB: { success: bool, checkout_session?: {...}, error?: string }
    const result = data as {
      success: boolean;
      checkout_session?: { id: string };
      error?: string;
    };

    if (!result.success) {
      const msg = mapRpcError(
        result.error,
        "Không thể tạo phiên đặt phòng. Vui lòng thử lại."
      );
      console.error("[checkout] createCheckoutSession RPC returned failure:", result.error);
      return { sessionId: null, error: msg };
    }

    const sessionId = result.checkout_session?.id ?? null;
    if (!sessionId) {
      console.error("[checkout] createCheckoutSession: RPC succeeded but no session id returned");
      return { sessionId: null, error: "Không thể lấy ID phiên đặt phòng." };
    }

    return { sessionId, error: null };
  } catch (err) {
    console.error("[checkout] createCheckoutSession unexpected error:", err);
    return { sessionId: null, error: "Lỗi kết nối cơ sở dữ liệu" };
  }
}

// ---------------------------------------------------------------------------
// Hàm 2 — Lấy thông tin phiên checkout kèm chi tiết phòng
// ---------------------------------------------------------------------------

/**
 * Lấy thông tin checkout session theo ID, join với bảng `rooms` và `properties`.
 *
 * Trả về null nếu session không tồn tại.
 * Không kiểm tra quyền ở đây — caller phải đảm bảo user_id khớp.
 * Đây là thao tác READ-ONLY — không thay đổi theo RPC migration.
 *
 * @param id - UUID của checkout session
 */
export async function getCheckoutSession(
  id: string
): Promise<{ data: CheckoutSessionWithRoom | null; error: string | null }> {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(id)) {
    return { data: null, error: "ID phiên checkout không hợp lệ" };
  }

  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("checkout_sessions")
      .select(
        `
        id,
        user_id,
        room_id,
        check_in,
        check_out,
        guest_count,
        gross_amount_vnd,
        discount_amount_vnd,
        final_payable_amount_vnd,
        payment_reference,
        status,
        expires_at,
        created_at,
        updated_at,
        rooms (
          id,
          name,
          nightly_price_vnd,
          capacity,
          image_paths,
          properties (
            id,
            name,
            address,
            maps_url
          )
        )
      `
      )
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[checkout] getCheckoutSession error:", error.message);
      return { data: null, error: "Không thể tải thông tin phiên đặt phòng. Vui lòng thử lại." };
    }

    if (!data) {
      return { data: null, error: null };
    }

    // Chuẩn hoá dữ liệu join (Supabase trả về object hoặc array tuỳ version)
    const roomRaw = data.rooms as unknown;
    const roomObj = Array.isArray(roomRaw) ? roomRaw[0] : roomRaw;

    let room: CheckoutSessionWithRoom["room"] = null;

    if (roomObj && typeof roomObj === "object") {
      const r = roomObj as {
        id: string;
        name: string;
        nightly_price_vnd: number;
        capacity: number;
        image_paths: string[];
        properties: unknown;
      };

      const propRaw = r.properties;
      const propObj = Array.isArray(propRaw) ? propRaw[0] : propRaw;

      room = {
        id: r.id,
        name: r.name,
        nightly_price_vnd: Number(r.nightly_price_vnd) || 0,
        capacity: Number(r.capacity) || 1,
        image_paths: Array.isArray(r.image_paths) ? r.image_paths : [],
        property:
          propObj && typeof propObj === "object"
            ? (propObj as {
                id: string;
                name: string;
                address: string;
                maps_url: string | null;
              })
            : null,
      };
    }

    const session: CheckoutSessionWithRoom = {
      id: data.id,
      user_id: data.user_id,
      room_id: data.room_id,
      check_in: data.check_in,
      check_out: data.check_out,
      guest_count: data.guest_count,
      gross_amount_vnd: data.gross_amount_vnd,
      discount_amount_vnd: data.discount_amount_vnd,
      final_payable_amount_vnd: data.final_payable_amount_vnd,
      payment_reference: data.payment_reference,
      status: data.status,
      expires_at: data.expires_at,
      created_at: data.created_at,
      updated_at: data.updated_at,
      room,
    };

    return { data: session, error: null };
  } catch (err) {
    console.error("[checkout] getCheckoutSession unexpected error:", err);
    return { data: null, error: "Lỗi kết nối cơ sở dữ liệu" };
  }
}

// ---------------------------------------------------------------------------
// Hàm 3 — Xác thực và gắn voucher vào checkout session
// ---------------------------------------------------------------------------

/**
 * Gắn voucher redemption vào checkout session thông qua RPC
 * `reserve_checkout_voucher_atomic` (SECURITY DEFINER, authenticated).
 *
 * RPC đảm bảo (atomic, với row-level locking):
 * - Session tồn tại, thuộc caller, ở trạng thái ACTIVE, chưa hết hạn
 * - Chưa có voucher nào được gắn (tối đa 1 voucher / session)
 * - Voucher tồn tại, thuộc caller, ở trạng thái AVAILABLE, chưa hết hạn
 * - Loại voucher hợp lệ (percentage_discount, 40%, max_eligible 1,000,000 VND)
 * - Discount được tính server-side: min(gross, 1,000,000) × 40%, max 400,000 VND
 * - Cập nhật voucher_redemptions.status = "RESERVED" và checkout_sessions.discount/final_payable
 *
 * @param redemptionId - UUID của voucher_redemptions record
 * @param sessionId    - UUID của checkout_sessions record
 */
export async function validateAndApplyVoucher(
  redemptionId: string,
  sessionId: string
): Promise<VoucherValidationResult> {

  try {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc(
      "reserve_checkout_voucher_atomic",
      {
        p_checkout_session_id: sessionId,
        p_voucher_redemption_id: redemptionId,
      }
    );

    if (error) {
      console.error("[checkout] validateAndApplyVoucher RPC error:", error.message);
      return {
        valid: false,
        redemption: null,
        discountAmountVnd: 0,
        errorMessage: "Không thể áp voucher. Vui lòng thử lại.",
      };
    }

    const result = data as {
      success: boolean;
      error?: string;
      voucher_redemption_id?: string;
      checkout_session?: {
        discount_amount_vnd: number;
      };
    };

    if (!result.success) {
      const msg = mapRpcError(
        result.error,
        "Không thể áp voucher. Vui lòng thử lại."
      );
      console.error("[checkout] validateAndApplyVoucher RPC returned failure:", result.error);
      return {
        valid: false,
        redemption: null,
        discountAmountVnd: 0,
        errorMessage: msg,
      };
    }

    const discountAmountVnd = result.checkout_session?.discount_amount_vnd ?? 0;

    // Đọc lại redemption record đầy đủ để trả về cho caller
    const { data: updatedRedemption } = await supabase
      .from("voucher_redemptions")
      .select("*")
      .eq("id", redemptionId)
      .single();

    return {
      valid: true,
      redemption: updatedRedemption ?? null,
      discountAmountVnd,
      errorMessage: null,
    };
  } catch (err) {
    console.error("[checkout] validateAndApplyVoucher unexpected error:", err);
    return {
      valid: false,
      redemption: null,
      discountAmountVnd: 0,
      errorMessage: "Lỗi kết nối cơ sở dữ liệu",
    };
  }
}

// ---------------------------------------------------------------------------
// Hàm phụ trợ — Hủy gắn voucher (khi user rời khỏi checkout)
// ---------------------------------------------------------------------------

/**
 * Trả voucher về trạng thái AVAILABLE (hoặc EXPIRED nếu đã quá hạn) khi user
 * rời khỏi checkout thông qua RPC `release_checkout_voucher_atomic`
 * (SECURITY DEFINER, authenticated).
 *
 * RPC đảm bảo (atomic):
 * - Session tồn tại, thuộc caller, ở trạng thái ACTIVE
 * - Tìm voucher RESERVED gắn với session đó
 * - Chuyển về AVAILABLE nếu chưa hết hạn, EXPIRED nếu đã hết hạn
 * - Reset checkout_sessions.discount = 0, final_payable = gross
 *
 * NGHIỆP VỤ (AGENTS.md):
 * - 500 điểm KHÔNG được hoàn lại vì voucher vẫn còn hiệu lực đến expires_at.
 *
 * @param sessionId - UUID của checkout_sessions
 */
export async function releaseVoucherFromSession(
  sessionId: string
): Promise<{ success: boolean; error: string | null }> {

  try {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc(
      "release_checkout_voucher_atomic",
      {
        p_checkout_session_id: sessionId,
      }
    );

    if (error) {
      console.error(
        "[checkout] releaseVoucherFromSession RPC error:",
        error.message
      );
      return { success: false, error: "Không thể hủy voucher. Vui lòng thử lại." };
    }

    const result = data as {
      success: boolean;
      error?: string;
    };

    if (!result.success) {
      // NO_RESERVED_VOUCHER_ATTACHED không phải lỗi nghiêm trọng —
      // có thể xảy ra nếu user gọi release khi chưa có voucher.
      if (result.error === "NO_RESERVED_VOUCHER_ATTACHED") {
        console.info(
          "[checkout] releaseVoucherFromSession: no reserved voucher to release (session:",
          sessionId,
          ")"
        );
        return { success: true, error: null };
      }

      const msg = mapRpcError(
        result.error,
        "Không thể hủy voucher. Vui lòng thử lại."
      );
      console.error(
        "[checkout] releaseVoucherFromSession RPC returned failure:",
        result.error
      );
      return { success: false, error: msg };
    }

    return { success: true, error: null };
  } catch (err) {
    console.error("[checkout] releaseVoucherFromSession unexpected error:", err);
    return { success: false, error: "Lỗi kết nối cơ sở dữ liệu" };
  }
}

// ---------------------------------------------------------------------------
// Hàm phụ trợ — Lấy danh sách voucher AVAILABLE của user
// ---------------------------------------------------------------------------

/**
 * Lấy tất cả voucher redemptions còn hiệu lực (AVAILABLE, chưa hết hạn) của user.
 * Dùng để hiển thị danh sách voucher có thể áp dụng trong VoucherPicker.
 * Đây là thao tác READ-ONLY — không thay đổi theo RPC migration.
 *
 * @param userId - UUID của authenticated user
 */
export async function getUserAvailableVouchers(
  userId: string
): Promise<{ data: (VoucherRedemption & { voucher: Voucher | null })[]; error: string | null }> {
  try {
    const supabase = await createClient();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("voucher_redemptions")
      .select(
        `
        id,
        user_id,
        voucher_id,
        checkout_session_id,
        booking_id,
        discount_amount_vnd,
        status,
        expires_at,
        issued_at,
        used_at,
        vouchers (
          id,
          name,
          voucher_type,
          discount_percentage,
          max_eligible_base_vnd,
          points_cost,
          is_active,
          created_at,
          updated_at
        )
      `
      )
      .eq("user_id", userId)
      .eq("status", "AVAILABLE")
      .gt("expires_at", now)
      .order("expires_at", { ascending: true });

    if (error) {
      console.error("[checkout] getUserAvailableVouchers error:", error.message);
      return { data: [], error: "Không thể tải danh sách voucher. Vui lòng thử lại." };
    }

    if (!data) {
      return { data: [], error: null };
    }

    const result = data.map((item) => {
      const voucherRaw = item.vouchers as unknown;
      const voucherObj = Array.isArray(voucherRaw) ? voucherRaw[0] : voucherRaw;
      return {
        id: item.id,
        user_id: item.user_id,
        voucher_id: item.voucher_id,
        checkout_session_id: item.checkout_session_id,
        booking_id: item.booking_id,
        discount_amount_vnd: item.discount_amount_vnd,
        status: item.status,
        expires_at: item.expires_at,
        issued_at: item.issued_at,
        used_at: item.used_at,
        voucher: (voucherObj as Voucher) ?? null,
      };
    });

    return { data: result, error: null };
  } catch (err) {
    console.error("[checkout] getUserAvailableVouchers unexpected error:", err);
    return { data: [], error: "Lỗi kết nối cơ sở dữ liệu" };
  }
}
