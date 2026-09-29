"use server";

import { revalidatePath } from "next/cache";
import {
  claimDailyReward,
  redeemLoyaltyVoucher,
  getRewardsSummary,
  getActiveRewardMenuItems,
  reserveRewardEntitlement,
  releaseRewardEntitlement,
  type ClaimRewardResult,
  type RedeemVoucherResult,
  type RewardsSummary,
  type RewardMenuItem,
} from "@/lib/data/rewards";

/**
 * Server Action: Điểm danh nhận thưởng +5 điểm và cập nhật chuỗi streak.
 */
export async function claimDailyRewardAction(): Promise<ClaimRewardResult> {
  const result = await claimDailyReward();
  if (result.success) {
    revalidatePath("/rewards");
    revalidatePath("/");
  }
  return result;
}

/**
 * Server Action: Đổi 500 điểm lấy 1 Voucher giảm giá 40%.
 */
export async function redeemLoyaltyVoucherAction(): Promise<RedeemVoucherResult> {
  const result = await redeemLoyaltyVoucher();
  if (result.success) {
    revalidatePath("/rewards");
    revalidatePath("/checkout");
  }
  return result;
}

/**
 * Server Action: Tải dữ liệu tổng quan Kapi Rewards & Streak.
 */
export async function getRewardsSummaryAction(): Promise<{
  data: RewardsSummary;
  error: string | null;
}> {
  return getRewardsSummary();
}

/**
 * Server Action: Lấy danh sách món ăn đang active từ thực đơn quà tặng.
 */
export async function getActiveRewardMenuItemsAction(): Promise<{
  data: RewardMenuItem[];
  error: string | null;
}> {
  return getActiveRewardMenuItems();
}

/**
 * Server Action: Áp dụng phần thưởng (giảm giá hoặc hiện vật/ẩm thực) vào checkout session.
 */
export async function reserveRewardEntitlementAction(
  sessionId: string,
  entitlementId: string,
  menuItemId?: string
): Promise<{
  success: boolean;
  discountAmountVnd?: number;
  selectionData?: Record<string, unknown>;
  error?: string;
}> {
  const result = await reserveRewardEntitlement(sessionId, entitlementId, menuItemId);
  if (result.success) {
    revalidatePath(`/checkout?session_id=${sessionId}`);
  }
  return result;
}

/**
 * Server Action: Hủy áp dụng phần thưởng khỏi checkout session.
 */
export async function releaseRewardEntitlementAction(
  sessionId: string,
  entitlementId?: string
): Promise<{ success: boolean; error?: string }> {
  const result = await releaseRewardEntitlement(sessionId, entitlementId);
  if (result.success) {
    revalidatePath(`/checkout?session_id=${sessionId}`);
  }
  return result;
}
