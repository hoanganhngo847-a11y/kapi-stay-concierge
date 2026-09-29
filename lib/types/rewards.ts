/**
 * @file lib/types/rewards.ts
 *
 * Types và pure utility functions cho Kapi Rewards & Streak Milestone Program.
 * File này không phụ thuộc vào server headers hay database client,
 * an toàn để import trong cả Server và Client Components.
 */

export type VoucherStatus = "AVAILABLE" | "RESERVED" | "USED" | "EXPIRED" | "REVOKED";

export type VoucherSource = "500_POINTS" | "150_DAY_STREAK" | "365_DAY_STREAK";

export type StreakRewardType =
  | "SNACK_X1"
  | "SNACK_X2"
  | "SNACK_COMBO"
  | "MEAL_CHOICE"
  | "DISCOUNT_30"
  | "DISCOUNT_40";

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
  source?: VoucherSource;
  source_title?: string;
}

export interface RewardsTransaction {
  id: string;
  type: string;
  points_delta: number;
  description: string | null;
  created_at: string;
}

export interface StreakRewardDefinition {
  milestone_day: number;
  reward_type: StreakRewardType;
  title: string;
  description: string;
  expiry_days: number;
  discount_percentage?: number | null;
  max_discount_vnd?: number | null;
  status?: "LOCKED" | "TARGET" | "ACHIEVED";
}

export interface RewardMenuItem {
  id: string;
  name: string;
  category: string;
  sort_order: number;
}

export interface UserRewardEntitlement {
  id: string;
  reward_definition_id: string;
  milestone_day: number;
  reward_type: StreakRewardType;
  title: string;
  description: string;
  status: VoucherStatus;
  issued_at: string;
  expires_at: string;
  used_at?: string | null;
  selection_data?: {
    menu_item_id?: string;
    menu_item_name?: string;
    [key: string]: unknown;
  } | null;
}

export interface NextMilestoneInfo {
  day: number;
  days_left: number;
  title: string;
}

export interface RewardsSummary {
  isAuthenticated: boolean;
  userId?: string;
  pointsBalance: number;
  hasCheckedInToday: boolean;
  checkinDate: string; // YYYY-MM-DD (Asia/Ho_Chi_Minh)
  currentStreak: number;
  longestStreak: number;
  nextMilestone: NextMilestoneInfo | null;
  pointsNeededForNextVoucher: number;
  availableVouchersCount: number;
  availableEntitlementsCount: number;
  redeemableVouchersCount: number;
  streakRoadmap: StreakRewardDefinition[];
  vouchers: RewardsVoucher[];
  entitlements: UserRewardEntitlement[];
  recentTransactions?: RewardsTransaction[];
}

export interface ClaimRewardResult {
  success: boolean;
  alreadyClaimed?: boolean;
  pointsAdded?: number;
  pointsBalance?: number;
  currentStreak?: number;
  longestStreak?: number;
  milestoneReached?: number | null;
  rewardIssued?: {
    id?: string;
    reward_type: string;
    title: string;
    description?: string;
    expires_at: string;
  } | null;
  nextMilestone?: NextMilestoneInfo | null;
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

/**
 * Format ngày theo giờ Việt Nam ngắn gọn: "05/10" hoặc "05/10/2026"
 */
export function formatVietnamDate(isoString: string, includeYear = false): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;

    const options: Intl.DateTimeFormatOptions = {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit",
      month: "2-digit",
    };
    if (includeYear) {
      options.year = "numeric";
    }

    return new Intl.DateTimeFormat("vi-VN", options).format(d);
  } catch {
    return isoString;
  }
}
