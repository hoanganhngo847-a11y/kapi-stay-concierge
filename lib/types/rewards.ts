/**
 * @file lib/types/rewards.ts
 *
 * Types và pure utility functions cho Kapi Rewards.
 * File này không phụ thuộc vào server headers hay database client,
 * an toàn để import trong cả Server và Client Components.
 */

export type VoucherStatus = "AVAILABLE" | "RESERVED" | "USED" | "EXPIRED" | "REVOKED";

export interface RewardsVoucher {
  id: string;
  voucher_id: string;
  status: VoucherStatus;
  issued_at: string;
  expires_at: string;
  used_at: string | null;
  name: string;
  voucher_type: string;
  discount_percentage: number;
  max_eligible_base_vnd: number;
  max_discount_vnd: number;
}

export interface RewardsTransaction {
  id: string;
  type: string;
  points_delta: number;
  description: string | null;
  created_at: string;
}

export interface RewardsSummary {
  isAuthenticated: boolean;
  userId?: string;
  pointsBalance: number;
  hasCheckedInToday: boolean;
  checkinDate: string; // YYYY-MM-DD (Asia/Ho_Chi_Minh)
  pointsNeededForNextVoucher: number;
  availableVouchersCount: number;
  redeemableVouchersCount: number;
  vouchers: RewardsVoucher[];
  recentTransactions?: RewardsTransaction[];
}

export interface ClaimRewardResult {
  success: boolean;
  alreadyClaimed?: boolean;
  pointsAdded?: number;
  pointsBalance?: number;
  error?: string;
  message?: string;
}

export interface RedeemVoucherResult {
  success: boolean;
  redemptionId?: string;
  pointsDeducted?: number;
  pointsBalance?: number;
  expiresAt?: string;
  error?: string;
  message?: string;
}

/**
 * Trả về ngày hiện tại theo timezone Asia/Ho_Chi_Minh dưới dạng YYYY-MM-DD
 */
export function getVietnamDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

/**
 * Format thời gian theo giờ Việt Nam: "14:35, 30/09/2026"
 */
export function formatVietnamDateTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;

    const timeFormatter = new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    return `${timeFormatter.format(d)}, ${dateFormatter.format(d)}`;
  } catch {
    return isoString;
  }
}
