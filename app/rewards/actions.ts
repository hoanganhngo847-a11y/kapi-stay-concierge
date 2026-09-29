"use server";

import { revalidatePath } from "next/cache";
import {
  claimDailyReward,
  redeemLoyaltyVoucher,
  getRewardsSummary,
  type ClaimRewardResult,
  type RedeemVoucherResult,
  type RewardsSummary,
} from "@/lib/data/rewards";

/**
 * Server Action: Điểm danh nhận thưởng +5 điểm.
 */
export async function claimDailyRewardAction(): Promise<ClaimRewardResult> {
  const result = await claimDailyReward();
  if (result.success) {
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
    revalidatePath("/");
    revalidatePath("/checkout");
  }
  return result;
}

/**
 * Server Action: Tải dữ liệu tổng quan Kapi Rewards.
 */
export async function getRewardsSummaryAction(): Promise<{
  data: RewardsSummary;
  error: string | null;
}> {
  return getRewardsSummary();
}
