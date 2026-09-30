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

// ---------------------------------------------------------------------------
// Actions cho Phần thưởng hiện vật / ẩm thực
// ---------------------------------------------------------------------------

export async function getPhysicalRewardsAction(): Promise<{
  data: Awaited<ReturnType<typeof import("@/lib/data/checkout").getUserAvailablePhysicalRewards>>["data"];
  error: string | null;
}> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return { data: [], error: "Phiên đăng nhập đã hết hạn." };
  }
  const { getUserAvailablePhysicalRewards } = await import("@/lib/data/checkout");
  return getUserAvailablePhysicalRewards(userId);
}

export async function getMenuItemsAction(): Promise<{
  data: Awaited<ReturnType<typeof import("@/lib/data/checkout").getActiveCheckoutMenuItems>>["data"];
  error: string | null;
}> {
  const { getActiveCheckoutMenuItems } = await import("@/lib/data/checkout");
  return getActiveCheckoutMenuItems();
}

export async function applyPhysicalRewardAction(
  sessionId: string,
  entitlementId: string,
  menuItemId?: string
): Promise<{ success: boolean; selectionData?: Record<string, unknown>; error?: string }> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return { success: false, error: "Phiên đăng nhập đã hết hạn." };
  }
  const { applyPhysicalReward } = await import("@/lib/data/checkout");
  return applyPhysicalReward(sessionId, entitlementId, menuItemId);
}

export async function releasePhysicalRewardAction(
  sessionId: string,
  entitlementId?: string
): Promise<{ success: boolean; error?: string }> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return { success: false, error: "Phiên đăng nhập đã hết hạn." };
  }
  const { releasePhysicalReward } = await import("@/lib/data/checkout");
  return releasePhysicalReward(sessionId, entitlementId);
}

export async function updateCheckoutMenuItemsAction(
  sessionId: string,
  items: import("@/lib/data/checkout").CheckoutMenuItemPayload[]
): Promise<{
  success: boolean;
  menuAmountVnd?: number;
  finalPayableAmountVnd?: number;
  error?: string;
}> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return { success: false, error: "Phiên đăng nhập đã hết hạn." };
  }
  const { updateCheckoutMenuItems } = await import("@/lib/data/checkout");
  return updateCheckoutMenuItems(sessionId, items);
}

export async function getCheckoutMenuItemsAction(
  sessionId: string
): Promise<{
  data: import("@/lib/data/checkout").CheckoutMenuItemRecord[];
  menuAmountVnd: number;
  error: string | null;
}> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return { data: [], menuAmountVnd: 0, error: "Phiên đăng nhập đã hết hạn." };
  }
  const { getCheckoutMenuItems } = await import("@/lib/data/checkout");
  return getCheckoutMenuItems(sessionId);
}

export async function getAllMenuProductsAction(): Promise<{
  data: import("@/lib/data/menu").MenuProduct[];
  error: string | null;
}> {
  const { getMenuProducts } = await import("@/lib/data/menu");
  return getMenuProducts();
}

/**
 * Releases temporary room hold by marking the checkout session as EXPIRED or FAILED.
 */
export async function releaseCheckoutHoldAction(
  sessionId: string
): Promise<{ success: boolean; error: string | null }> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return { success: false, error: "Phiên đăng nhập đã hết hạn." };
  }
  const { releaseCheckoutHold } = await import("@/lib/data/bookings");
  const res = await releaseCheckoutHold(sessionId);
  return { success: res.success, error: res.error ?? null };
}

// ---------------------------------------------------------------------------
// Action: Kiểm tra trạng thái thanh toán — customer-safe, READ-ONLY
// ---------------------------------------------------------------------------

export async function getCheckoutPaymentStatusAction(
  sessionId: string
): Promise<{
  data: import("@/lib/data/checkout").CheckoutPaymentStatus | null;
  error: string | null;
}> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return { data: null, error: "Phiên đăng nhập đã hết hạn." };
  }

  const { getCheckoutPaymentStatus } = await import("@/lib/data/checkout");
  return getCheckoutPaymentStatus(sessionId, userId);
}
