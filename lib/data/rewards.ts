/**
 * @file lib/data/rewards.ts
 * @owner Kapi Rewards Module
 *
 * Data access layer cho Kapi Rewards, Loyalty, & Streak Milestones.
 * Cung cấp các thao tác đọc và ghi điểm thưởng, điểm danh chuỗi, đổi voucher,
 * nhận thưởng hiện vật / ẩm thực qua trusted SECURITY DEFINER RPCs từ Supabase.
 *
 * NGHIỆP VỤ CỐT LÕI (theo docs/PROJECT_GUIDE.md & AGENTS.md & Specification):
 * - Kapi Rewards chỉ dành cho user đã đăng nhập.
 * - Điểm danh hằng ngày: +5 điểm, tính theo múi giờ Việt Nam (Asia/Ho_Chi_Minh).
 * - Chuỗi điểm danh:
 *     - Liên tiếp: current_streak += 1
 *     - Đứt chuỗi (bỏ ít nhất 1 ngày): reset current_streak = 1 (bắt đầu cycle mới)
 * - Mốc phần thưởng chuỗi:
 *     - 10 ngày: 1 gói bim bim bất kỳ (SNACK_X1), hạn 7 ngày
 *     - 20 ngày: 2 gói bim bim bất kỳ (SNACK_X2), hạn 7 ngày
 *     - 40 ngày: Combo 1 nước + 2 gói bim bim (SNACK_COMBO), hạn 7 ngày
 *     - 80 ngày: 1 món ăn bất kỳ từ menu (MEAL_CHOICE), hạn 7 ngày
 *     - 150 ngày: Voucher giảm 30% tối đa 300.000đ (DISCOUNT_30), hạn 7 ngày
 *     - 365 ngày: Voucher giảm 40% tối đa 400.000đ (DISCOUNT_40), hạn 7 ngày
 * - Nguồn chân lý cho số dư điểm: SUM(points_delta) từ public.loyalty_transactions.
 * - Đổi voucher 500 điểm: 1 Voucher giảm 40% (tối đa 400.000đ), hạn 24 giờ.
 * - Tối đa 1 discount voucher / booking. Phần thưởng hiện vật có thể dùng cùng.
 */

import { createClient } from "@/lib/supabase/server";
import {
  type RewardsSummary,
  type RewardsVoucher,
  type RewardsTransaction,
  type ClaimRewardResult,
  type RedeemVoucherResult,
  type StreakRewardDefinition,
  type UserRewardEntitlement,
  type RewardMenuItem,
  type NextMilestoneInfo,
  type VoucherStatus,
  getVietnamDateString,
} from "@/lib/types/rewards";

export * from "@/lib/types/rewards";

// ---------------------------------------------------------------------------
// Canonical Fallback Roadmap Definitions
// ---------------------------------------------------------------------------
const DEFAULT_ROADMAP: StreakRewardDefinition[] = [
  {
    milestone_day: 10,
    reward_type: "SNACK_X1",
    title: "1 gói bim bim bất kỳ",
    description: "Phần thưởng chuỗi 10 ngày. Nhận khi nhận phòng.",
    expiry_days: 7,
    status: "LOCKED",
  },
  {
    milestone_day: 20,
    reward_type: "SNACK_X2",
    title: "2 gói bim bim bất kỳ",
    description: "Phần thưởng chuỗi 20 ngày. Nhận khi nhận phòng.",
    expiry_days: 7,
    status: "LOCKED",
  },
  {
    milestone_day: 40,
    reward_type: "SNACK_COMBO",
    title: "Combo 1 nước + 2 gói bim bim",
    description: "Phần thưởng chuỗi 40 ngày. Combo giải khát trọn vẹn.",
    expiry_days: 7,
    status: "LOCKED",
  },
  {
    milestone_day: 80,
    reward_type: "MEAL_CHOICE",
    title: "1 món ăn bất kỳ",
    description: "Phần thưởng chuỗi 80 ngày. Tự chọn từ menu Kapi.",
    expiry_days: 7,
    status: "LOCKED",
  },
  {
    milestone_day: 150,
    reward_type: "DISCOUNT_30",
    title: "Voucher giảm 30%",
    description: "Phần thưởng chuỗi 150 ngày. Giảm tối đa 300.000đ.",
    expiry_days: 7,
    discount_percentage: 30,
    max_discount_vnd: 300000,
    status: "LOCKED",
  },
  {
    milestone_day: 365,
    reward_type: "DISCOUNT_40",
    title: "Voucher giảm 40%",
    description: "Phần thưởng chuỗi 365 ngày. Giảm tối đa 400.000đ.",
    expiry_days: 7,
    discount_percentage: 40,
    max_discount_vnd: 400000,
    status: "LOCKED",
  },
];

// ---------------------------------------------------------------------------
// Core Data Fetcher: getRewardsSummary
// ---------------------------------------------------------------------------

/**
 * Lấy toàn bộ tổng quan Rewards của user hiện tại.
 * Nếu user chưa đăng nhập -> trả về trạng thái unauthenticated an toàn.
 * Nếu user đã đăng nhập -> ưu tiên gọi RPC get_my_rewards_summary.
 * Nếu RPC chưa được nạp -> fallback tính toán qua RLS SELECT.
 */
export async function getRewardsSummary(): Promise<{
  data: RewardsSummary;
  error: string | null;
}> {
  const todayVn = getVietnamDateString();

  const emptyUnauthSummary: RewardsSummary = {
    isAuthenticated: false,
    pointsBalance: 0,
    hasCheckedInToday: false,
    checkinDate: todayVn,
    currentStreak: 0,
    longestStreak: 0,
    nextMilestone: {
      day: 10,
      days_left: 10,
      title: "1 gói bim bim bất kỳ",
    },
    pointsNeededForNextVoucher: 500,
    availableVouchersCount: 0,
    availableEntitlementsCount: 0,
    redeemableVouchersCount: 0,
    streakRoadmap: DEFAULT_ROADMAP,
    vouchers: [],
    entitlements: [],
    recentTransactions: [],
  };

  try {
    const supabase = await createClient();
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

    const userId = claimsData?.claims?.sub;
    if (claimsError || !userId) {
      return { data: emptyUnauthSummary, error: null };
    }

    // 1. Thử gọi RPC trusted server-side
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rpcRaw, error: rpcError } = await (supabase.rpc as any)(
      "get_my_rewards_summary"
    );

    if (!rpcError && rpcRaw && typeof rpcRaw === "object") {
      const res = rpcRaw as Record<string, unknown>;
      if (res.success) {
        const balance = Math.round(Number(res.points_balance ?? 0) * 100000) / 100000;
        const vouchersList = Array.isArray(res.vouchers)
          ? (res.vouchers as RewardsVoucher[])
          : [];
        const entitlementsList = Array.isArray(res.entitlements)
          ? (res.entitlements as UserRewardEntitlement[])
          : [];
        const recentTx = Array.isArray(res.recent_transactions)
          ? (res.recent_transactions as RewardsTransaction[])
          : [];
        const roadmap = Array.isArray(res.streak_roadmap)
          ? (res.streak_roadmap as StreakRewardDefinition[])
          : DEFAULT_ROADMAP;

        const currentStreak = Number(res.current_streak ?? 0);
        const longestStreak = Number(res.longest_streak ?? currentStreak);

        return {
          data: {
            isAuthenticated: true,
            userId,
            pointsBalance: balance,
            hasCheckedInToday: Boolean(res.has_checked_in_today),
            checkinDate: (res.checkin_date as string) || todayVn,
            currentStreak,
            longestStreak,
            isStreakBroken: Boolean(res.is_streak_broken),
            nextMilestone: (res.next_milestone as NextMilestoneInfo) || null,
            pointsNeededForNextVoucher: Number(
              res.points_needed_for_next_voucher ?? Math.max(0, 500 - balance)
            ),
            availableVouchersCount: Number(res.available_vouchers_count ?? 0),
            availableEntitlementsCount: Number(res.available_entitlements_count ?? 0),
            redeemableVouchersCount: Number(
              res.redeemable_vouchers_count ?? Math.floor(balance / 500)
            ),
            streakRoadmap: roadmap,
            vouchers: vouchersList,
            entitlements: entitlementsList,
            recentTransactions: recentTx,
          },
          error: null,
        };
      }
    }

    // 2. Fallback resilient query (nếu RPC chưa được apply trên database)
    const [txRes, checkinRes, vouchersRes, streaksRes, entitlementsRes] = await Promise.all([
      supabase
        .from("loyalty_transactions")
        .select("id, type, points_delta, description, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("daily_checkins")
        .select("id, checkin_date")
        .eq("checkin_date", todayVn)
        .limit(1),
      supabase
        .from("voucher_redemptions")
        .select(`
          id,
          voucher_id,
          status,
          issued_at,
          expires_at,
          used_at,
          vouchers (
            id,
            name,
            voucher_type,
            discount_percentage,
            max_eligible_base_vnd
          )
        `)
        .order("issued_at", { ascending: false }),
      supabase
        .from("user_reward_streaks")
        .select("current_streak, longest_streak, last_checkin_date")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("user_reward_entitlements")
        .select(`
          id,
          reward_definition_id,
          milestone_day,
          status,
          issued_at,
          expires_at,
          used_at,
          selection_data,
          streak_reward_definitions (
            id,
            milestone_day,
            reward_type,
            title,
            description,
            discount_percentage,
            max_discount_vnd
          )
        `)
        .order("issued_at", { ascending: false }),
    ]);

    // Ledger balance
    let balance = 0;
    const recentTx: RewardsTransaction[] = [];
    if (txRes.data) {
      for (const row of txRes.data) {
        balance += Number(row.points_delta ?? 0);
      }
      for (const row of txRes.data.slice(0, 10)) {
        recentTx.push({
          id: row.id,
          type: row.type,
          points_delta: Number(row.points_delta ?? 0),
          description: row.description,
          created_at: row.created_at,
        });
      }
    }

    const hasCheckedIn = Boolean(checkinRes.data && checkinRes.data.length > 0);
    const nowTime = new Date().getTime();

    // Streak calculation
    let currentStreak = 0;
    let longestStreak = 0;
    if (streaksRes.data) {
      longestStreak = Number(streaksRes.data.longest_streak ?? 0);
      const lastDate = streaksRes.data.last_checkin_date;
      if (lastDate === todayVn) {
        currentStreak = Number(streaksRes.data.current_streak ?? 0);
      } else {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayVn = getVietnamDateString(yesterday);
        if (lastDate === yesterdayVn) {
          currentStreak = Number(streaksRes.data.current_streak ?? 0);
        } else {
          currentStreak = 0;
        }
      }
    }

    // Map vouchers
    const vouchersList: RewardsVoucher[] = [];
    let availableVoucherCount = 0;

    if (vouchersRes.data) {
      for (const vr of vouchersRes.data) {
        const vRaw = vr.vouchers as unknown;
        const v = Array.isArray(vRaw) ? vRaw[0] : vRaw;

        const isExpired = new Date(vr.expires_at).getTime() <= nowTime;
        let effectiveStatus = vr.status as VoucherStatus;
        if (effectiveStatus === "AVAILABLE" && isExpired) {
          effectiveStatus = "EXPIRED";
        }

        if (effectiveStatus === "AVAILABLE") {
          availableVoucherCount++;
        }

        vouchersList.push({
          id: vr.id,
          voucher_id: vr.voucher_id,
          status: effectiveStatus,
          issued_at: vr.issued_at,
          expires_at: vr.expires_at,
          used_at: vr.used_at,
          name: v?.name || "Voucher Giảm 40% (Tối đa 400.000đ)",
          voucher_type: v?.voucher_type || "percentage_discount",
          discount_percentage: Number(v?.discount_percentage ?? 40),
          max_eligible_base_vnd: Number(v?.max_eligible_base_vnd ?? 1000000),
          max_discount_vnd: 400000,
          source: "500_POINTS",
          source_title: "Đổi từ 500 Points",
        });
      }
    }

    // Map entitlements
    const entitlementsList: UserRewardEntitlement[] = [];
    let availableEntitlementsCount = 0;

    if (entitlementsRes.data) {
      for (const ue of entitlementsRes.data) {
        const sdRaw = ue.streak_reward_definitions as unknown;
        const sd = Array.isArray(sdRaw) ? sdRaw[0] : sdRaw;

        const isExpired = new Date(ue.expires_at).getTime() <= nowTime;
        let effectiveStatus = ue.status as VoucherStatus;
        if (effectiveStatus === "AVAILABLE" && isExpired) {
          effectiveStatus = "EXPIRED";
        }

        const isDiscount =
          sd?.reward_type === "DISCOUNT_30" || sd?.reward_type === "DISCOUNT_40";

        if (isDiscount) {
          if (effectiveStatus === "AVAILABLE") {
            availableVoucherCount++;
          }
          vouchersList.push({
            id: ue.id,
            voucher_id: sd?.id || ue.reward_definition_id,
            status: effectiveStatus,
            issued_at: ue.issued_at,
            expires_at: ue.expires_at,
            used_at: ue.used_at,
            name: sd?.title || "Voucher Chuỗi Điểm Danh",
            voucher_type: "percentage_discount",
            discount_percentage: Number(sd?.discount_percentage ?? (ue.milestone_day === 150 ? 30 : 40)),
            max_eligible_base_vnd: 1000000,
            max_discount_vnd: Number(sd?.max_discount_vnd ?? (ue.milestone_day === 150 ? 300000 : 400000)),
            source: ue.milestone_day === 150 ? "150_DAY_STREAK" : "365_DAY_STREAK",
            source_title: `Phần thưởng chuỗi ${ue.milestone_day} ngày`,
          });
        } else {
          if (effectiveStatus === "AVAILABLE") {
            availableEntitlementsCount++;
          }
          entitlementsList.push({
            id: ue.id,
            reward_definition_id: ue.reward_definition_id,
            milestone_day: ue.milestone_day,
            reward_type: sd?.reward_type || "SNACK_X1",
            title: sd?.title || "Phần thưởng",
            description: sd?.description || "",
            status: effectiveStatus,
            issued_at: ue.issued_at,
            expires_at: ue.expires_at,
            used_at: ue.used_at,
            selection_data: ue.selection_data as UserRewardEntitlement["selection_data"],
          });
        }
      }
    }

    // Next milestone & roadmap status
    const milestoneDays = [10, 20, 40, 80, 150, 365];
    const nextDay = milestoneDays.find((d) => d > currentStreak) ?? null;
    let nextMilestone: NextMilestoneInfo | null = null;
    if (nextDay) {
      const matchedDef = DEFAULT_ROADMAP.find((m) => m.milestone_day === nextDay);
      nextMilestone = {
        day: nextDay,
        days_left: nextDay - currentStreak,
        title: matchedDef?.title || `${nextDay} ngày liên tiếp`,
      };
    }

    const updatedRoadmap = DEFAULT_ROADMAP.map((m) => {
      let status: "LOCKED" | "TARGET" | "ACHIEVED" = "LOCKED";
      if (currentStreak >= m.milestone_day) {
        status = "ACHIEVED";
      } else if (m.milestone_day === nextDay) {
        status = "TARGET";
      }
      return { ...m, status };
    });

    return {
      data: {
        isAuthenticated: true,
        userId,
        pointsBalance: Math.round(balance * 100000) / 100000,
        hasCheckedInToday: hasCheckedIn,
        checkinDate: todayVn,
        currentStreak,
        longestStreak,
        nextMilestone,
        pointsNeededForNextVoucher: Math.max(0, 500 - balance),
        availableVouchersCount: availableVoucherCount,
        availableEntitlementsCount: availableEntitlementsCount,
        redeemableVouchersCount: Math.floor(balance / 500),
        streakRoadmap: updatedRoadmap,
        vouchers: vouchersList,
        entitlements: entitlementsList,
        recentTransactions: recentTx,
      },
      error: null,
    };
  } catch (err: unknown) {
    console.error("[getRewardsSummary] Lỗi:", err);
    return {
      data: emptyUnauthSummary,
      error: "Chưa thể tải Kapi Rewards. Vui lòng thử lại.",
    };
  }
}

// ---------------------------------------------------------------------------
// Daily Check-in Action
// ---------------------------------------------------------------------------

export async function claimDailyReward(): Promise<ClaimRewardResult> {
  try {
    const supabase = await createClient();
    const { data: claimsData } = await supabase.auth.getClaims();

    if (!claimsData?.claims?.sub) {
      return {
        success: false,
        error: "Vui lòng đăng nhập để điểm danh nhận thưởng.",
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rpcRaw, error: rpcError } = await (supabase.rpc as any)(
      "claim_daily_reward"
    );

    if (rpcError) {
      console.error("[claimDailyReward] RPC Error:", rpcError);
      return {
        success: false,
        error: "Chưa thể điểm danh lúc này. Vui lòng thử lại sau.",
      };
    }

    const res = rpcRaw as Record<string, unknown> | null;
    if (!res) {
      return {
        success: false,
        error: "Chưa thể điểm danh lúc này. Vui lòng thử lại sau.",
      };
    }

    if (res.error === "ALREADY_CLAIMED_TODAY") {
      return {
        success: false,
        alreadyClaimed: true,
        pointsBalance: Number(res.points_balance ?? 0),
        currentStreak: Number(res.current_streak ?? 1),
        longestStreak: Number(res.longest_streak ?? 1),
        error: "Hôm nay bạn đã điểm danh rồi. Hãy quay lại vào ngày mai nhé!",
      };
    }

    if (res.error === "UNAUTHORIZED") {
      return {
        success: false,
        error: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
      };
    }

    if (!res.success) {
      return {
        success: false,
        error: "Chưa thể điểm danh lúc này. Vui lòng thử lại sau.",
      };
    }

    const pointsAdded = Number(res.points_added ?? 5);
    const currentStreak = Number(res.current_streak ?? 1);
    const longestStreak = Number(res.longest_streak ?? currentStreak);
    const milestoneReached = res.milestone_reached ? Number(res.milestone_reached) : null;
    const rewardIssued = (res.reward_issued as ClaimRewardResult["rewardIssued"]) || null;
    const nextMilestone = (res.next_milestone as NextMilestoneInfo) || null;

    let message = `Điểm danh thành công! +${pointsAdded} điểm. Chuỗi hiện tại: ${currentStreak} ngày.`;
    if (milestoneReached && rewardIssued) {
      message = `🎉 Chúc mừng! Bạn đạt chuỗi ${milestoneReached} ngày và nhận được: ${rewardIssued.title}!`;
    }

    return {
      success: true,
      pointsAdded,
      pointsBalance: Number(res.points_balance ?? 0),
      currentStreak,
      longestStreak,
      milestoneReached,
      rewardIssued,
      nextMilestone,
      message,
    };
  } catch (err) {
    console.error("[claimDailyReward] Exception:", err);
    return {
      success: false,
      error: "Chưa thể điểm danh lúc này. Vui lòng thử lại sau.",
    };
  }
}

// ---------------------------------------------------------------------------
// Redeem Voucher Action (500 pts)
// ---------------------------------------------------------------------------

export async function redeemLoyaltyVoucher(): Promise<RedeemVoucherResult> {
  try {
    const supabase = await createClient();
    const { data: claimsData } = await supabase.auth.getClaims();

    if (!claimsData?.claims?.sub) {
      return {
        success: false,
        error: "Vui lòng đăng nhập để đổi voucher.",
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rpcRaw, error: rpcError } = await (supabase.rpc as any)(
      "redeem_loyalty_voucher"
    );

    if (rpcError) {
      console.error("[redeemLoyaltyVoucher] RPC Error:", rpcError);
      return {
        success: false,
        error: "Chưa thể đổi voucher lúc này. Vui lòng thử lại sau.",
      };
    }

    const res = rpcRaw as Record<string, unknown> | null;
    if (!res) {
      return {
        success: false,
        error: "Chưa thể đổi voucher lúc này. Vui lòng thử lại sau.",
      };
    }

    if (res.error === "INSUFFICIENT_POINTS") {
      const balance = Number(res.points_balance ?? 0);
      const needed = Number(res.points_needed ?? Math.max(0, 500 - balance));
      return {
        success: false,
        pointsBalance: balance,
        error: `Bạn cần thêm ${needed} điểm nữa để đủ 500 điểm đổi voucher.`,
      };
    }

    if (res.error === "VOUCHER_TEMPLATE_NOT_FOUND") {
      return {
        success: false,
        error: "Hệ thống ưu đãi tạm thời bảo trì mẫu voucher. Vui lòng liên hệ hỗ trợ.",
      };
    }

    if (res.error === "UNAUTHORIZED") {
      return {
        success: false,
        error: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
      };
    }

    if (!res.success) {
      return {
        success: false,
        error: "Chưa thể đổi voucher lúc này. Vui lòng thử lại sau.",
      };
    }

    return {
      success: true,
      redemptionId: res.redemption_id as string,
      pointsDeducted: Number(res.points_deducted ?? 500),
      pointsBalance: Number(res.points_balance ?? 0),
      expiresAt: res.expires_at as string,
      message: "Đổi Voucher 40% thành công! Voucher có hiệu lực trong 24 giờ.",
    };
  } catch (err) {
    console.error("[redeemLoyaltyVoucher] Exception:", err);
    return {
      success: false,
      error: "Chưa thể đổi voucher lúc này. Vui lòng thử lại sau.",
    };
  }
}

// ---------------------------------------------------------------------------
// Food Menu Catalog Action
// ---------------------------------------------------------------------------

export async function getActiveRewardMenuItems(): Promise<{
  data: RewardMenuItem[];
  error: string | null;
}> {
  try {
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rpcRaw, error: rpcError } = await (supabase.rpc as any)(
      "get_active_reward_menu_items"
    );

    if (!rpcError && rpcRaw && typeof rpcRaw === "object") {
      const res = rpcRaw as { success: boolean; items: RewardMenuItem[] };
      if (res.success && Array.isArray(res.items)) {
        return { data: res.items, error: null };
      }
    }

    // Fallback direct select
    const { data, error } = await supabase
      .from("reward_menu_items")
      .select("id, name, category, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("[getActiveRewardMenuItems] Error:", error.message);
      return { data: [], error: "Không thể tải thực đơn phần thưởng." };
    }

    return { data: (data as RewardMenuItem[]) ?? [], error: null };
  } catch (err) {
    console.error("[getActiveRewardMenuItems] Exception:", err);
    return { data: [], error: "Lỗi kết nối cơ sở dữ liệu." };
  }
}

// ---------------------------------------------------------------------------
// Reward Entitlement Checkout Reservation & Release
// ---------------------------------------------------------------------------

export async function reserveRewardEntitlement(
  sessionId: string,
  entitlementId: string,
  menuItemId?: string
): Promise<{
  success: boolean;
  discountAmountVnd?: number;
  selectionData?: Record<string, unknown>;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rpcRaw, error: rpcError } = await (supabase.rpc as any)(
      "reserve_checkout_reward_entitlement_atomic",
      {
        p_checkout_session_id: sessionId,
        p_entitlement_id: entitlementId,
        p_menu_item_id: menuItemId || null,
      }
    );

    if (rpcError) {
      console.error("[reserveRewardEntitlement] RPC Error:", rpcError);
      return { success: false, error: "Không thể áp dụng phần thưởng. Vui lòng thử lại." };
    }

    const res = rpcRaw as Record<string, unknown> | null;
    if (!res || !res.success) {
      const err = (res?.error as string) || "Không thể áp dụng phần thưởng.";
      const msgMap: Record<string, string> = {
        DISCOUNT_ALREADY_RESERVED: "Phiên đặt phòng đã có một voucher giảm giá. Tối đa 1 voucher giảm giá cho mỗi đơn.",
        PHYSICAL_REWARD_ALREADY_RESERVED: "Phiên đặt phòng đã áp dụng 1 phần thưởng hiện vật/ẩm thực.",
        MEAL_SELECTION_REQUIRED: "Vui lòng chọn 1 món ăn từ thực đơn.",
        INVALID_OR_INACTIVE_MEAL_ITEM: "Món ăn đã chọn hiện không khả dụng. Vui lòng chọn món khác.",
        ENTITLEMENT_EXPIRED: "Phần thưởng này đã hết hạn sử dụng.",
        ENTITLEMENT_NOT_AVAILABLE: "Phần thưởng không ở trạng thái khả dụng.",
        CHECKOUT_SESSION_EXPIRED: "Phiên đặt phòng đã hết hạn.",
      };
      return { success: false, error: msgMap[err] || err };
    }

    const cs = res.checkout_session as { discount_amount_vnd: number } | undefined;
    return {
      success: true,
      discountAmountVnd: cs?.discount_amount_vnd ?? 0,
      selectionData: res.selection_data as Record<string, unknown>,
    };
  } catch (err) {
    console.error("[reserveRewardEntitlement] Exception:", err);
    return { success: false, error: "Lỗi kết nối cơ sở dữ liệu." };
  }
}

export async function releaseRewardEntitlement(
  sessionId: string,
  entitlementId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rpcRaw, error: rpcError } = await (supabase.rpc as any)(
      "release_checkout_reward_entitlement_atomic",
      {
        p_checkout_session_id: sessionId,
        p_entitlement_id: entitlementId || null,
      }
    );

    if (rpcError) {
      console.error("[releaseRewardEntitlement] RPC Error:", rpcError);
      return { success: false, error: "Không thể hủy phần thưởng." };
    }

    const res = rpcRaw as Record<string, unknown> | null;
    if (!res || !res.success) {
      return { success: false, error: (res?.error as string) || "Không thể hủy phần thưởng." };
    }

    return { success: true };
  } catch (err) {
    console.error("[releaseRewardEntitlement] Exception:", err);
    return { success: false, error: "Lỗi kết nối cơ sở dữ liệu." };
  }
}
