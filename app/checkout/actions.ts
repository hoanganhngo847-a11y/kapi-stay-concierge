"use server";

/**
 * @file app/checkout/actions.ts
 * @owner TV4 — Linh (feat/booking-checkout)
 *
 * Server Actions cho trang Checkout.
 * Đây là lớp cầu nối giữa Client Component (CheckoutClient) và
 * data layer (lib/data/checkout) — bắt buộc vì data layer dùng
 * createClient() từ lib/supabase/server (server-only context).
 *
 * Mỗi action bắt buộc xác minh lại userId từ session thực (không trust props)
 * để bảo vệ khỏi tấn công giả mạo từ phía client.
 *
 * TUÂN THỦ QUY TẮC DỰ ÁN:
 * - KHÔNG sửa file nào ngoài app/checkout/**
 * - KHÔNG import từ lib/supabase/client (chỉ dùng server client)
 */

import { createClient } from "@/lib/supabase/server";
import {
  validateAndApplyVoucher,
  releaseVoucherFromSession,
  getUserAvailableVouchers,
  confirmBookingAndPayment,
} from "@/lib/data/checkout";
import type { VoucherValidationResult } from "@/lib/data/checkout";

// ---------------------------------------------------------------------------
// Helper: lấy userId đã xác thực từ session server-side
// ---------------------------------------------------------------------------

async function getAuthenticatedUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return data.claims.sub as string;
}

// ---------------------------------------------------------------------------
// Action: Áp voucher vào checkout session
// ---------------------------------------------------------------------------

export async function applyVoucherAction(
  redemptionId: string,
  sessionId: string,
  grossAmountVnd: number
): Promise<VoucherValidationResult> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return {
      valid: false,
      redemption: null,
      discountAmountVnd: 0,
      errorMessage: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
    };
  }

  return validateAndApplyVoucher(redemptionId, userId, sessionId, grossAmountVnd);
}

// ---------------------------------------------------------------------------
// Action: Hủy gắn voucher khỏi checkout session
// ---------------------------------------------------------------------------

export async function releaseVoucherAction(
  sessionId: string
): Promise<{ success: boolean; error: string | null }> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return { success: false, error: "Phiên đăng nhập đã hết hạn." };
  }

  return releaseVoucherFromSession(sessionId, userId);
}

// ---------------------------------------------------------------------------
// Action: Lấy lại danh sách voucher khả dụng (sau khi có lỗi)
// ---------------------------------------------------------------------------

export async function refreshAvailableVouchersAction(): Promise<{
  data: Awaited<ReturnType<typeof getUserAvailableVouchers>>["data"];
  error: string | null;
}> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return { data: [], error: "Phiên đăng nhập đã hết hạn." };
  }

  return getUserAvailableVouchers(userId);
}

// ---------------------------------------------------------------------------
// Action: Xác nhận booking sau khi thanh toán VietQR
// ---------------------------------------------------------------------------

export async function confirmPaymentAction(
  sessionId: string
): Promise<{ bookingId: string | null; error: string | null }> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return {
      bookingId: null,
      error: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
    };
  }

  return confirmBookingAndPayment(sessionId, userId);
}
