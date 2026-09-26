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
 *
 * RE-REVIEW #2 — Điểm 1 (BLOCKER):
 * confirmPaymentAction đã bị XOÁ. User bấm nút không phải payment verifier
 * ngân hàng — không được phép kích hoạt finalize_verified_checkout_atomic
 * (service_role-only RPC). Flow finalize sẽ được thực hiện qua payment
 * webhook do TV1+TV8 phụ trách riêng.
 */

import { createClient } from "@/lib/supabase/server";
import {
  validateAndApplyVoucher,
  releaseVoucherFromSession,
  getUserAvailableVouchers,
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
  sessionId: string
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

  // userId không truyền vào data layer — RPC tự xác minh qua auth.uid().
  return validateAndApplyVoucher(redemptionId, sessionId);
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

  // userId không truyền vào data layer — RPC tự xác minh qua auth.uid().
  return releaseVoucherFromSession(sessionId);
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
