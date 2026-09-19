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
 */

import { createClient } from "@/lib/supabase/server";
import type { Tables, TablesInsert } from "@/lib/database.types";

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
 * Không bao gồm id / created_at / updated_at (DB tự sinh).
 */
export interface CreateCheckoutSessionInput {
  userId: string;
  roomId: string;
  checkIn: string;   // ISO date string: "YYYY-MM-DD"
  checkOut: string;  // ISO date string: "YYYY-MM-DD"
  guestCount: number;
  grossAmountVnd: number;
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
// Hàm 1 — Tạo phiên checkout tạm thời
// ---------------------------------------------------------------------------

/**
 * Tạo một bản ghi mới trong bảng `checkout_sessions`.
 *
 * - Status mặc định: "ACTIVE" (theo schema: ACTIVE → PAYMENT_PROCESSING → COMPLETED | EXPIRED | FAILED)
 * - Phiên hết hạn sau 30 phút (expires_at)
 * - discount_amount_vnd = 0 (chưa áp voucher)
 * - final_payable_amount_vnd = gross_amount_vnd (chưa giảm)
 * - payment_reference được sinh bởi server từ session ID và lưu vào DB
 *
 * @returns ID của checkout session vừa tạo, hoặc error string nếu thất bại.
 */
export async function createCheckoutSession(
  input: CreateCheckoutSessionInput
): Promise<{ sessionId: string | null; error: string | null }> {
  try {
    const supabase = await createClient();

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const insertData: TablesInsert<"checkout_sessions"> = {
      user_id: input.userId,
      room_id: input.roomId,
      check_in: input.checkIn,
      check_out: input.checkOut,
      guest_count: input.guestCount,
      gross_amount_vnd: input.grossAmountVnd,
      discount_amount_vnd: 0,
      final_payable_amount_vnd: input.grossAmountVnd,
      // ACTIVE là trạng thái khởi tạo đúng theo schema.
      // PENDING không tồn tại trong checkout_sessions.status.
      status: "ACTIVE",
      expires_at: expiresAt,
      // payment_reference sẽ được gán sau khi có session ID (bên dưới)
      payment_reference: null,
    };

    const { data, error } = await supabase
      .from("checkout_sessions")
      .insert(insertData)
      .select("id")
      .single();

    if (error) {
      console.error("[checkout] createCheckoutSession error:", error.message);
      return { sessionId: null, error: error.message };
    }

    const sessionId = data.id;

    // Sinh payment_reference từ session ID (server-side) và ghi vào DB.
    // Format: KAPI + 8 ký tự hex đầu UUID (không dấu gạch ngang), viết hoa.
    // Việc này đảm bảo payment_reference không bao giờ được client tự tạo.
    const paymentReference =
      "KAPI" + sessionId.replace(/-/g, "").slice(0, 8).toUpperCase();

    const { error: refError } = await supabase
      .from("checkout_sessions")
      .update({ payment_reference: paymentReference })
      .eq("id", sessionId);

    if (refError) {
      // Không block việc tạo session — log để team xử lý, session vẫn dùng được.
      // payment_reference sẽ là null, QRModal sẽ hiển thị fallback.
      console.error(
        "[checkout] createCheckoutSession — update payment_reference error:",
        refError.message
      );
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
      return { data: null, error: error.message };
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
 * Kiểm tra voucher redemption còn hiệu lực của user và tính số tiền được giảm,
 * sau đó gắn voucher đó vào checkout session bằng cách cập nhật
 * `voucher_redemptions.checkout_session_id` và status = "RESERVED".
 *
 * NGHIỆP VỤ (AGENTS.md / SUPABASE_SCHEMA_DESIGN.md):
 * - Voucher phải ở trạng thái "AVAILABLE" và chưa hết hạn (expires_at > now).
 * - Chỉ 1 voucher được áp vào 1 checkout session.
 * - Discount = min(grossAmountVnd, max_eligible_base_vnd) × (discount_percentage / 100)
 *   Tối đa 400.000 VND (= 1.000.000 × 40%).
 * - Sau khi gắn: cập nhật discount_amount_vnd và final_payable_amount_vnd trên
 *   checkout_sessions.
 *
 * @param redemptionId   - UUID của voucher_redemptions record (user đã đổi trước đó)
 * @param userId         - UUID của user đang thực hiện checkout
 * @param sessionId      - UUID của checkout_sessions record đang xử lý
 * @param grossAmountVnd - Tổng tiền trước giảm giá (VND)
 */
export async function validateAndApplyVoucher(
  redemptionId: string,
  userId: string,
  sessionId: string,
  grossAmountVnd: number
): Promise<VoucherValidationResult> {
  try {
    const supabase = await createClient();
    const now = new Date().toISOString();

    // 1. Lấy thông tin redemption kèm voucher gốc
    const { data: redemption, error: redemptionError } = await supabase
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
          discount_percentage,
          max_eligible_base_vnd,
          points_cost,
          is_active,
          voucher_type
        )
      `
      )
      .eq("id", redemptionId)
      .eq("user_id", userId)
      .maybeSingle();

    if (redemptionError) {
      console.error("[checkout] validateAndApplyVoucher query error:", redemptionError.message);
      return {
        valid: false,
        redemption: null,
        discountAmountVnd: 0,
        errorMessage: "Không thể kiểm tra voucher. Vui lòng thử lại.",
      };
    }

    if (!redemption) {
      return {
        valid: false,
        redemption: null,
        discountAmountVnd: 0,
        errorMessage: "Voucher không tồn tại hoặc không thuộc tài khoản của bạn.",
      };
    }

    // 2. Kiểm tra trạng thái voucher
    if (redemption.status !== "AVAILABLE") {
      const statusMsg: Record<string, string> = {
        RESERVED: "Voucher này đang được sử dụng trong một phiên khác.",
        USED: "Voucher này đã được sử dụng.",
        EXPIRED: "Voucher này đã hết hạn.",
        REVOKED: "Voucher không hợp lệ.",
      };
      return {
        valid: false,
        redemption: null,
        discountAmountVnd: 0,
        errorMessage: statusMsg[redemption.status] ?? "Voucher không hợp lệ.",
      };
    }

    // 3. Kiểm tra voucher còn hạn (expires_at > now)
    if (redemption.expires_at <= now) {
      return {
        valid: false,
        redemption: null,
        discountAmountVnd: 0,
        errorMessage: "Voucher đã hết hạn sử dụng (hết hạn sau 24 giờ kể từ khi đổi).",
      };
    }

    // 4. Lấy thông tin voucher gốc
    const voucherRaw = redemption.vouchers as unknown;
    const voucherObj = Array.isArray(voucherRaw) ? voucherRaw[0] : voucherRaw;

    if (!voucherObj || typeof voucherObj !== "object") {
      return {
        valid: false,
        redemption: null,
        discountAmountVnd: 0,
        errorMessage: "Không tìm thấy thông tin voucher.",
      };
    }

    const voucher = voucherObj as {
      id: string;
      discount_percentage: number;
      max_eligible_base_vnd: number;
      is_active: boolean;
    };

    if (!voucher.is_active) {
      return {
        valid: false,
        redemption: null,
        discountAmountVnd: 0,
        errorMessage: "Loại voucher này hiện không còn hiệu lực.",
      };
    }

    // 5. Tính số tiền giảm giá
    // Discount = min(grossAmountVnd, max_eligible_base_vnd) × (discount_percentage / 100)
    const eligibleBase = Math.min(grossAmountVnd, voucher.max_eligible_base_vnd);
    const discountAmountVnd = Math.floor(
      (eligibleBase * voucher.discount_percentage) / 100
    );
    const finalPayableAmountVnd = Math.max(0, grossAmountVnd - discountAmountVnd);

    // 6. Gắn voucher vào session: cập nhật voucher_redemptions
    const { error: reserveError } = await supabase
      .from("voucher_redemptions")
      .update({
        status: "RESERVED",
        checkout_session_id: sessionId,
        discount_amount_vnd: discountAmountVnd,
      })
      .eq("id", redemptionId)
      .eq("status", "AVAILABLE"); // Guard race-condition: chỉ update nếu vẫn AVAILABLE

    if (reserveError) {
      console.error("[checkout] reserveVoucher update error:", reserveError.message);
      return {
        valid: false,
        redemption: null,
        discountAmountVnd: 0,
        errorMessage: "Không thể giữ chỗ voucher. Voucher có thể đã được sử dụng ở nơi khác.",
      };
    }

    // 7. Cập nhật discount và final_payable trên checkout_sessions
    const { error: sessionUpdateError } = await supabase
      .from("checkout_sessions")
      .update({
        discount_amount_vnd: discountAmountVnd,
        final_payable_amount_vnd: finalPayableAmountVnd,
      })
      .eq("id", sessionId)
      .eq("user_id", userId);

    if (sessionUpdateError) {
      console.error(
        "[checkout] updateCheckoutSessionDiscount error:",
        sessionUpdateError.message
      );
      return {
        valid: false,
        redemption: null,
        discountAmountVnd: 0,
        errorMessage: "Lỗi cập nhật phiên thanh toán. Vui lòng thử lại.",
      };
    }

    // 8. Đọc lại redemption record để trả về dữ liệu mới nhất
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
// Hàm 4 — Xác nhận booking sau khi thanh toán thành công
// ---------------------------------------------------------------------------

/**
 * Hoàn tất quá trình đặt phòng sau khi thanh toán VietQR được xác nhận:
 *
 * 1. Kiểm tra phiên checkout (status là ACTIVE hoặc PAYMENT_PROCESSING, chưa hết hạn, thuộc đúng user).
 * 2. Tạo bản ghi `bookings` với booking_status = "CONFIRMED", payment_status = "PAID".
 * 3. Cập nhật `checkout_sessions` status = "COMPLETED".
 * 4. Cập nhật `voucher_redemptions` status = "USED", booking_id, used_at (nếu có voucher).
 *
 * QUAN TRỌNG (AGENTS.md):
 * - Điểm loyalty (BOOKING_EARN) KHÔNG được tính trong hàm này.
 *   Việc ghi loyalty_transactions là nghiệp vụ backend (RPC / trigger / server action
 *   được TV8 thiết kế và TV1 phê duyệt), không thuộc scope của data layer client.
 * - Hàm này chỉ tạo booking record và cập nhật trạng thái liên quan.
 *   Không xử lý thêm logic thanh toán ngân hàng hay webhook.
 *
 * @param sessionId - UUID của checkout_sessions
 * @param userId    - UUID của user đang xác nhận (dùng để bảo vệ RLS)
 * @returns bookingId nếu thành công, error string nếu thất bại
 */
export async function confirmBookingAndPayment(
  sessionId: string,
  userId: string
): Promise<{ bookingId: string | null; error: string | null }> {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(sessionId) || !uuidRegex.test(userId)) {
    return { bookingId: null, error: "ID phiên hoặc user không hợp lệ" };
  }

  try {
    const supabase = await createClient();
    const now = new Date().toISOString();

    // 1. Lấy và kiểm tra checkout session
    const { data: session, error: sessionError } = await supabase
      .from("checkout_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();

    if (sessionError) {
      console.error("[checkout] confirmBooking — fetch session error:", sessionError.message);
      return { bookingId: null, error: sessionError.message };
    }

    if (!session) {
      return {
        bookingId: null,
        error: "Không tìm thấy phiên đặt phòng hoặc không có quyền truy cập.",
      };
    }

    // Chỉ cho phép xác nhận khi session ở trạng thái ACTIVE hoặc PAYMENT_PROCESSING.
    // PENDING không tồn tại trong schema — không bao giờ match.
    const confirmableStatuses = ["ACTIVE", "PAYMENT_PROCESSING"];
    if (!confirmableStatuses.includes(session.status)) {
      const statusMsg: Record<string, string> = {
        COMPLETED: "Đặt phòng đã được xác nhận trước đó.",
        EXPIRED: "Phiên đặt phòng đã hết hạn. Vui lòng bắt đầu lại từ đầu.",
        FAILED: "Phiên thanh toán đã thất bại. Vui lòng bắt đầu lại từ đầu.",
      };
      return {
        bookingId: null,
        error: statusMsg[session.status] ?? "Phiên đặt phòng không hợp lệ.",
      };
    }

    if (session.expires_at <= now) {
      return {
        bookingId: null,
        error: "Phiên đặt phòng đã hết hạn. Vui lòng bắt đầu lại từ đầu.",
      };
    }

    // 2. Tạo booking record (trạng thái CONFIRMED / PAID)
    const bookingInsert: TablesInsert<"bookings"> = {
      user_id: session.user_id,
      room_id: session.room_id,
      check_in: session.check_in,
      check_out: session.check_out,
      guest_count: session.guest_count,
      gross_amount_vnd: session.gross_amount_vnd,
      discount_amount_vnd: session.discount_amount_vnd,
      final_paid_amount_vnd: session.final_payable_amount_vnd,
      booking_status: "CONFIRMED",
      payment_status: "PAID",
    };

    const { data: newBooking, error: bookingError } = await supabase
      .from("bookings")
      .insert(bookingInsert)
      .select("id")
      .single();

    if (bookingError || !newBooking) {
      console.error(
        "[checkout] confirmBooking — insert booking error:",
        bookingError?.message
      );
      return {
        bookingId: null,
        error: bookingError?.message ?? "Không thể tạo đặt phòng. Vui lòng thử lại.",
      };
    }

    const bookingId = newBooking.id;

    // 3. Cập nhật checkout_sessions → COMPLETED
    const { error: completeSessionError } = await supabase
      .from("checkout_sessions")
      .update({ status: "COMPLETED" })
      .eq("id", sessionId)
      .eq("user_id", userId);

    if (completeSessionError) {
      // Booking đã tạo thành công nhưng session chưa cập nhật — vẫn trả về bookingId
      // để người dùng không bị mất đặt phòng; log để team backend xử lý.
      console.error(
        "[checkout] confirmBooking — complete session update error:",
        completeSessionError.message
      );
    }

    // 4. Tìm và cập nhật voucher_redemptions → USED (nếu có voucher gắn vào session)
    const { data: redemption, error: redemptionFetchError } = await supabase
      .from("voucher_redemptions")
      .select("id")
      .eq("checkout_session_id", sessionId)
      .eq("user_id", userId)
      .eq("status", "RESERVED")
      .maybeSingle();

    if (redemptionFetchError) {
      console.error(
        "[checkout] confirmBooking — fetch redemption error:",
        redemptionFetchError.message
      );
    }

    if (redemption) {
      const { error: redeemError } = await supabase
        .from("voucher_redemptions")
        .update({
          status: "USED",
          booking_id: bookingId,
          used_at: now,
        })
        .eq("id", redemption.id)
        .eq("status", "RESERVED"); // Guard: chỉ update nếu vẫn RESERVED

      if (redeemError) {
        console.error(
          "[checkout] confirmBooking — redeem voucher update error:",
          redeemError.message
        );
        // Không fail toàn bộ giao dịch — booking đã tạo thành công.
        // Trường hợp này cần alert cho TV8 / TV1 xử lý bằng tay nếu cần.
      }
    }

    // NOTE: Điểm loyalty (BOOKING_EARN) KHÔNG được ghi ở đây.
    // Formula tham khảo: Math.floor(session.final_payable_amount_vnd * 0.00025) points
    // Việc ghi loyalty_transactions phải được thực hiện bởi RPC / DB trigger
    // sau khi booking được xác nhận — thuộc phạm vi TV8 (Quỳnh) + TV1 phê duyệt.

    return { bookingId, error: null };
  } catch (err) {
    console.error("[checkout] confirmBookingAndPayment unexpected error:", err);
    return { bookingId: null, error: "Lỗi kết nối cơ sở dữ liệu" };
  }
}

// ---------------------------------------------------------------------------
// Hàm phụ trợ — Hủy gắn voucher (khi user rời khỏi checkout)
// ---------------------------------------------------------------------------

/**
 * Trả voucher về trạng thái AVAILABLE khi user rời khỏi checkout mà
 * chưa hoàn tất thanh toán (abandoned checkout).
 *
 * NGHIỆP VỤ (AGENTS.md):
 * - Khi user bỏ checkout, voucher quay về AVAILABLE (nếu chưa hết hạn).
 * - 500 điểm KHÔNG được hoàn lại vì voucher vẫn còn hiệu lực đến expires_at.
 *
 * @param sessionId - UUID của checkout_sessions
 * @param userId    - UUID của user sở hữu session
 */
export async function releaseVoucherFromSession(
  sessionId: string,
  userId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient();
    const now = new Date().toISOString();

    // Trả voucher về AVAILABLE nếu còn hạn, clear checkout_session_id
    const { error: voucherError } = await supabase
      .from("voucher_redemptions")
      .update({
        status: "AVAILABLE",
        checkout_session_id: null,
        discount_amount_vnd: null,
      })
      .eq("checkout_session_id", sessionId)
      .eq("user_id", userId)
      .eq("status", "RESERVED")
      .gt("expires_at", now); // Chỉ trả lại nếu voucher chưa hết hạn

    if (voucherError) {
      console.error("[checkout] releaseVoucherFromSession — voucher update error:", voucherError.message);
      return { success: false, error: voucherError.message };
    }

    // Đọc gross_amount_vnd từ session để reset final_payable_amount_vnd về đúng giá trị.
    // NGHIỆP VỤ: khi không còn voucher, final_payable = gross (không phải 0).
    const { data: sessionData, error: sessionFetchError } = await supabase
      .from("checkout_sessions")
      .select("gross_amount_vnd")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();

    if (sessionFetchError) {
      console.error(
        "[checkout] releaseVoucherFromSession — fetch session error:",
        sessionFetchError.message
      );
      return { success: false, error: sessionFetchError.message };
    }

    if (!sessionData) {
      return { success: false, error: "Không tìm thấy phiên đặt phòng." };
    }

    // Reset discount về 0 và final_payable về đúng gross_amount_vnd
    const { error: sessionUpdateError } = await supabase
      .from("checkout_sessions")
      .update({
        discount_amount_vnd: 0,
        final_payable_amount_vnd: sessionData.gross_amount_vnd,
      })
      .eq("id", sessionId)
      .eq("user_id", userId);

    if (sessionUpdateError) {
      console.error(
        "[checkout] releaseVoucherFromSession — session update error:",
        sessionUpdateError.message
      );
      return { success: false, error: sessionUpdateError.message };
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
      return { data: [], error: error.message };
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
