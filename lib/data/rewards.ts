/**
 * @file lib/data/rewards.ts
 * @owner Kapi Rewards Module
 *
 * Data access layer cho Kapi Rewards & Loyalty.
 * Cung cấp các thao tác đọc và ghi điểm thưởng, điểm danh, đổi voucher
 * thông qua trusted SECURITY DEFINER RPCs từ Supabase.
 *
 * NGHIỆP VỤ CỐT LÕI (theo docs/PROJECT_GUIDE.md & AGENTS.md):
 * - Kapi Rewards chỉ dành cho user đã đăng nhập.
 * - Điểm danh hằng ngày: +5 điểm, tối đa 1 lần/ngày theo giờ Việt Nam (Asia/Ho_Chi_Minh).
 * - Nguồn chân lý cho số dư điểm: SUM(points_delta) từ public.loyalty_transactions.
 * - Đổi voucher: 500 điểm = 1 Voucher giảm 40% (tối đa 400.000đ), hạn 24 giờ.
 * - Tối đa 1 voucher / booking.
 */

import { createClient } from "@/lib/supabase/server";
import {
  type RewardsSummary,
  type RewardsVoucher,
  type RewardsTransaction,
  type ClaimRewardResult,
  type RedeemVoucherResult,
  type VoucherStatus,
  getVietnamDateString,
} from "@/lib/types/rewards";

export * from "@/lib/types/rewards";

// ---------------------------------------------------------------------------
// Core Data Fetcher: getRewardsSummary
// ---------------------------------------------------------------------------

/**
 * Lấy toàn bộ tổng quan Rewards của user hiện tại.
 * Nếu user chưa đăng nhập -> trả về trạng thái unauthenticated an toàn.
 * Nếu user đã đăng nhập -> ưu tiên gọi RPC get_my_rewards_summary.
 * Nếu RPC chưa được nạp -> fallback tính toán qua RLS SELECT có sẵn.
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
    pointsNeededForNextVoucher: 500,
    availableVouchersCount: 0,
    redeemableVouchersCount: 0,
    vouchers: [],
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
        const recentTx = Array.isArray(res.recent_transactions)
          ? (res.recent_transactions as RewardsTransaction[])
          : [];

        return {
          data: {
            isAuthenticated: true,
            userId,
            pointsBalance: balance,
            hasCheckedInToday: Boolean(res.has_checked_in_today),
            checkinDate: (res.checkin_date as string) || todayVn,
            pointsNeededForNextVoucher: Number(res.points_needed_for_next_voucher ?? Math.max(0, 500 - balance)),
            availableVouchersCount: Number(res.available_vouchers_count ?? 0),
            redeemableVouchersCount: Number(res.redeemable_vouchers_count ?? Math.floor(balance / 500)),
            vouchers: vouchersList,
            recentTransactions: recentTx,
          },
          error: null,
        };
      }
    }

    // 2. Fallback resilient query (nếu RPC chưa được apply trên database)
    // Tận dụng chính sách RLS SELECT có sẵn cho authenticated user
    const [txRes, checkinRes, vouchersRes] = await Promise.all([
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
    ]);

    // Tính tổng số dư từ ledger
    let balance = 0;
    const recentTx: RewardsTransaction[] = [];
    if (txRes.data) {
      for (const row of txRes.data) {
        balance += Number(row.points_delta ?? 0);
      }
      for (const row of txRes.data.slice(0, 5)) {
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

    // Map vouchers
    const vouchersList: RewardsVoucher[] = [];
    let availableCount = 0;

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
          availableCount++;
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
        });
      }
    }

    return {
      data: {
        isAuthenticated: true,
        userId,
        pointsBalance: Math.round(balance * 100000) / 100000,
        hasCheckedInToday: hasCheckedIn,
        checkinDate: todayVn,
        pointsNeededForNextVoucher: Math.max(0, 500 - balance),
        availableVouchersCount: availableCount,
        redeemableVouchersCount: Math.floor(balance / 500),
        vouchers: vouchersList,
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

    return {
      success: true,
      pointsAdded: Number(res.points_added ?? 5),
      pointsBalance: Number(res.points_balance ?? 0),
      message: "Điểm danh thành công! +5 điểm.",
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
// Redeem Voucher Action
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
