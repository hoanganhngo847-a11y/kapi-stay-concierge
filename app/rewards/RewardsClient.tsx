"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import {
  Flame,
  Sparkles,
  Ticket,
  Gift,
  Utensils,
  Check,
  Lock,
  RefreshCw,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";
import {
  type RewardsSummary,
  type RewardsVoucher,
  type UserRewardEntitlement,
  formatVietnamDateTime,
  formatVietnamDate,
} from "@/lib/types/rewards";
import {
  claimDailyRewardAction,
  redeemLoyaltyVoucherAction,
  getRewardsSummaryAction,
} from "./actions";

export interface RewardsClientProps {
  initialSummary: RewardsSummary;
  initialError?: string | null;
}

export function RewardsClient({
  initialSummary,
  initialError = null,
}: RewardsClientProps) {
  const [summary, setSummary] = useState<RewardsSummary>(initialSummary);
  const [errorMsg, setErrorMsg] = useState<string | null>(initialError);
  const [feedbackMsg, setFeedbackMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [activeRewardsTab, setActiveRewardsTab] = useState<
    "all" | "physical" | "vouchers" | "past"
  >("all");

  const [isPending, startTransition] = useTransition();
  const [isClaiming, setIsClaiming] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);

  const refreshSummary = () => {
    startTransition(async () => {
      try {
        const { data, error } = await getRewardsSummaryAction();
        if (error) {
          setErrorMsg(error);
        } else {
          setSummary(data);
          setErrorMsg(null);
        }
      } catch {
        setErrorMsg("Chưa thể cập nhật Kapi Rewards. Vui lòng thử lại.");
      }
    });
  };

  const handleDailyCheckin = async () => {
    if (isClaiming || summary.hasCheckedInToday) return;

    setIsClaiming(true);
    setFeedbackMsg(null);

    try {
      const res = await claimDailyRewardAction();
      if (res.success) {
        setFeedbackMsg({
          type: "success",
          text: res.message || "Điểm danh thành công! +5 điểm.",
        });

        // Tải lại summary toàn vẹn để nạp milestone mới & streak cập nhật chính xác
        const { data: updated } = await getRewardsSummaryAction();
        if (updated) {
          setSummary(updated);
        } else {
          setSummary((prev) => {
            const newBalance = res.pointsBalance ?? prev.pointsBalance + 5;
            const newStreak = res.currentStreak ?? prev.currentStreak + 1;
            return {
              ...prev,
              hasCheckedInToday: true,
              pointsBalance: newBalance,
              currentStreak: newStreak,
              longestStreak: Math.max(prev.longestStreak, newStreak),
              pointsNeededForNextVoucher: Math.max(0, 500 - newBalance),
              redeemableVouchersCount: Math.floor(newBalance / 500),
            };
          });
        }
      } else {
        if (res.alreadyClaimed) {
          setSummary((prev) => ({
            ...prev,
            hasCheckedInToday: true,
            pointsBalance: res.pointsBalance ?? prev.pointsBalance,
            currentStreak: res.currentStreak ?? prev.currentStreak,
            longestStreak: res.longestStreak ?? prev.longestStreak,
          }));
        }
        setFeedbackMsg({
          type: "error",
          text: res.error || "Không thể điểm danh lúc này.",
        });
      }
    } catch {
      setFeedbackMsg({
        type: "error",
        text: "Chưa thể kết nối tới máy chủ. Vui lòng thử lại.",
      });
    } finally {
      setIsClaiming(false);
    }
  };

  const handleRedeemVoucher = async () => {
    if (isRedeeming || summary.pointsBalance < 500) return;

    setIsRedeeming(true);
    setFeedbackMsg(null);

    try {
      const res = await redeemLoyaltyVoucherAction();
      if (res.success) {
        setFeedbackMsg({
          type: "success",
          text:
            res.message ||
            "Đổi Voucher 40% thành công! Voucher có hiệu lực trong 24 giờ.",
        });
        const { data: updated } = await getRewardsSummaryAction();
        if (updated) {
          setSummary(updated);
        }
      } else {
        setFeedbackMsg({
          type: "error",
          text: res.error || "Không thể đổi voucher lúc này.",
        });
      }
    } catch {
      setFeedbackMsg({
        type: "error",
        text: "Chưa thể kết nối tới máy chủ. Vui lòng thử lại.",
      });
    } finally {
      setIsRedeeming(false);
    }
  };

  // Helper tính tỷ lệ tiến độ điểm 500
  const progressRatio = Math.min(
    100,
    Math.max(0, (summary.pointsBalance / 500) * 100)
  );
  const isEligibleForVoucher = summary.pointsBalance >= 500;

  // Lọc voucher & quà tặng
  const activeVouchers = summary.vouchers.filter(
    (v) => v.status === "AVAILABLE" || v.status === "RESERVED"
  );
  const pastVouchers = summary.vouchers.filter(
    (v) => v.status !== "AVAILABLE" && v.status !== "RESERVED"
  );

  const activeEntitlements = summary.entitlements.filter(
    (e) => e.status === "AVAILABLE" || e.status === "RESERVED"
  );
  const pastEntitlements = summary.entitlements.filter(
    (e) => e.status !== "AVAILABLE" && e.status !== "RESERVED"
  );

  // Tạo các ngày trong tuần mẫu cho strip T2 -> CN
  const weekDays = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
  const todayDayOfWeek = new Date().getDay(); // 0 is Sunday, 1 is Monday...
  const todayIndexInWeek = todayDayOfWeek === 0 ? 6 : todayDayOfWeek - 1;

  return (
    <div className="w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16 space-y-12">
      {/* ── HEADER PHẦN: TIÊU ĐỀ & MEMBER SUMMARY ── */}
      <section className="space-y-6">
        <Reveal variant="fade-up" duration={600}>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#E5E5E5] pb-6">
            <div className="space-y-1.5">
              <span className="text-xs font-mono tracking-[0.2em] uppercase text-[#707072]">
                Kapi Stay Loyalty
              </span>
              <h1 className="text-3xl sm:text-5xl font-normal tracking-tight text-[#111111]">
                KAPI REWARDS
              </h1>
              <p className="text-sm text-[#707072] max-w-xl">
                Duy trì chuỗi điểm danh hằng ngày và tích lũy điểm thưởng qua mỗi lượt lưu trú để mở khóa các đặc quyền ẩm thực và voucher giảm giá.
              </p>
            </div>

            {summary.isAuthenticated && (
              <button
                type="button"
                onClick={refreshSummary}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 text-xs text-[#707072] hover:text-[#111111] transition-colors py-1 px-2.5 rounded border border-[#E5E5E5] bg-white w-fit"
              >
                <RefreshCw className={`w-3 h-3 ${isPending ? "animate-spin" : ""}`} />
                <span>Cập nhật</span>
              </button>
            )}
          </div>
        </Reveal>

        {/* ── ERROR ALERT NẾU CÓ ── */}
        {errorMsg && (
          <div className="p-4 rounded border border-[#E5E5E5] bg-white text-xs text-[#111111] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[#707072]" />
              <span>{errorMsg}</span>
            </div>
            <button
              onClick={refreshSummary}
              className="font-medium underline underline-offset-2"
            >
              Thử lại
            </button>
          </div>
        )}

        {/* ── INLINE FEEDBACK ── */}
        {feedbackMsg && (
          <div
            className={`p-4 rounded text-xs flex items-center justify-between gap-2 border ${
              feedbackMsg.type === "success"
                ? "bg-white text-[#111111] border-[#111111]"
                : "bg-white text-[#D32F2F] border-[#FFCDD2]"
            }`}
          >
            <span>{feedbackMsg.text}</span>
            <button
              type="button"
              onClick={() => setFeedbackMsg(null)}
              className="text-xs opacity-60 hover:opacity-100 p-0.5"
            >
              ✕
            </button>
          </div>
        )}

        {/* ── STATE 1: GIAO DIỆN KHI CHƯA ĐĂNG NHẬP ── */}
        {!summary.isAuthenticated ? (
          <Reveal variant="fade-up" delay={80} duration={700}>
            <div className="border border-[#E5E5E5] bg-white p-8 sm:p-12 space-y-6">
              <div className="max-w-2xl space-y-3">
                <span className="text-xs uppercase tracking-widest text-[#707072]">
                  Đặc quyền thành viên
                </span>
                <h2 className="text-2xl sm:text-3xl font-normal text-[#111111]">
                  Đăng nhập để bắt đầu duy trì chuỗi
                </h2>
                <p className="text-sm text-[#707072] leading-relaxed">
                  Tài khoản Kapi của bạn được liên kết tự động qua Google Login. Điểm danh mỗi ngày để tích lũy +5 điểm và nhận quà mốc 10, 20, 40, 80, 150 và 365 ngày.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                <Link
                  href="/login"
                  className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3.5 rounded-full bg-[#111111] text-white hover:bg-[#2A2A2A] text-sm font-medium transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                >
                  Đăng nhập bằng Google
                </Link>
                <Link
                  href="/rooms"
                  className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3.5 rounded-full border border-[#E5E5E5] text-[#111111] hover:bg-[#F5F5F5] text-sm font-medium transition-all"
                >
                  Xem danh sách phòng
                </Link>
              </div>
            </div>
          </Reveal>
        ) : (
          /* ── STATE 2: THÔNG TIN THÀNH VIÊN ĐÃ ĐĂNG NHẬP (A. MEMBER SUMMARY) ── */
          <Reveal variant="fade-up" delay={60} duration={600}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Box 1: Chuỗi hiện tại */}
              <div className="border border-[#E5E5E5] bg-white p-6 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-widest text-[#707072]">
                    Chuỗi hiện tại
                  </span>
                  <Flame className="w-4 h-4 text-[#111111]" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl sm:text-5xl font-light text-[#111111]">
                    {summary.currentStreak}
                  </span>
                  <span className="text-xs uppercase tracking-widest text-[#707072]">
                    NGÀY LIÊN TIẾP
                  </span>
                </div>
                <p className="text-xs text-[#707072]">
                  {summary.hasCheckedInToday
                    ? `Đã duy trì ${summary.currentStreak} ngày liên tiếp. Hãy tiếp tục vào ngày mai!`
                    : summary.isStreakBroken || summary.currentStreak === 0
                    ? `Chuỗi đã bị gián đoạn. Điểm danh hôm nay để bắt đầu lại từ Ngày 1!`
                    : `Duy trì liên tục hôm nay để giữ chuỗi ${summary.currentStreak} ngày!`}
                </p>
              </div>

              {/* Box 2: Kỷ lục chuỗi */}
              <div className="border border-[#E5E5E5] bg-white p-6 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-widest text-[#707072]">
                    Chuỗi dài nhất
                  </span>
                  <span className="text-xs font-mono text-[#707072]">KỶ LỤC</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl sm:text-5xl font-light text-[#111111]">
                    {summary.longestStreak}
                  </span>
                  <span className="text-xs uppercase tracking-widest text-[#707072]">
                    NGÀY
                  </span>
                </div>
                <p className="text-xs text-[#707072]">
                  Kỷ lục cao nhất bạn từng đạt được trong toàn bộ lịch sử lưu trú.
                </p>
              </div>

              {/* Box 3: Số dư Kapi Points */}
              <div className="border border-[#E5E5E5] bg-white p-6 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-widest text-[#707072]">
                    Điểm tích lũy
                  </span>
                  <Sparkles className="w-4 h-4 text-[#111111]" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl sm:text-5xl font-light text-[#111111]">
                    {summary.pointsBalance.toLocaleString("vi-VN")}
                  </span>
                  <span className="text-xs uppercase tracking-widest text-[#707072]">
                    POINTS
                  </span>
                </div>
                <p className="text-xs text-[#707072]">
                  {summary.pointsBalance >= 500
                    ? `Bạn có thể quy đổi ngay 1 Voucher giảm giá 40%.`
                    : `Cần thêm ${summary.pointsNeededForNextVoucher} điểm để đổi Voucher 40%.`}
                </p>
              </div>
            </div>
          </Reveal>
        )}
      </section>

      {/* ── B. DAILY CHECK-IN STREAK & C. NEXT REWARD ── */}
      {summary.isAuthenticated && (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Cột trái: Khối Điểm Danh Hằng Ngày */}
          <div className="lg:col-span-7">
            <Reveal variant="fade-right" duration={650}>
              <div className="border border-[#E5E5E5] bg-white p-6 sm:p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-xs uppercase tracking-widest text-[#707072]">
                      Điểm danh hằng ngày
                    </span>
                    <h2 className="text-2xl font-normal text-[#111111]">
                      {summary.hasCheckedInToday
                        ? `Chuỗi hiện tại: ${summary.currentStreak} ngày`
                        : summary.isStreakBroken || summary.currentStreak === 0
                        ? `Chuỗi đã bị gián đoạn`
                        : `Chuỗi hiện tại: ${summary.currentStreak} ngày`}
                    </h2>
                  </div>
                  <span className="text-xs font-mono text-[#707072]">
                    {summary.checkinDate}
                  </span>
                </div>

                {/* Strip các ngày trong tuần (T2 .. CN) */}
                <div className="space-y-2">
                  <div className="grid grid-cols-7 gap-1.5 sm:gap-2 text-center">
                    {weekDays.map((dayLabel, idx) => {
                      const isToday = idx === todayIndexInWeek;
                      const isPastOrToday = idx <= todayIndexInWeek;
                      const hasChecked =
                        isPastOrToday && (idx < todayIndexInWeek || summary.hasCheckedInToday);

                      return (
                        <div
                          key={dayLabel}
                          className={`p-3 rounded border text-center transition-colors ${
                            isToday
                              ? "border-[#111111] bg-[#FAFAFA]"
                              : "border-[#E5E5E5] bg-white"
                          }`}
                        >
                          <span className="block text-[11px] font-mono text-[#707072] mb-1.5">
                            {dayLabel}
                          </span>
                          <div className="w-6 h-6 mx-auto rounded-full flex items-center justify-center text-xs">
                            {hasChecked ? (
                              <Check className="w-4 h-4 text-[#111111]" />
                            ) : (
                              <span className="w-1.5 h-1.5 rounded-full bg-[#D1D1D6]" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-[#707072] text-right">
                    Chu kỳ điểm danh tính theo 00:00 - 23:59 (Asia/Ho_Chi_Minh)
                  </p>
                </div>

                {/* Nút điểm danh */}
                <div className="pt-2">
                  {summary.hasCheckedInToday ? (
                    <button
                      type="button"
                      disabled
                      className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-[#F5F5F5] text-[#707072] border border-[#E5E5E5] text-sm font-medium cursor-default"
                    >
                      <Check className="w-4 h-4 text-[#111111]" />
                      <span>Đã điểm danh hôm nay +5 điểm</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleDailyCheckin}
                      disabled={isClaiming}
                      className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-[#111111] text-white hover:bg-[#2A2A2A] text-sm font-medium transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>
                        {isClaiming
                          ? "Đang ghi nhận..."
                          : summary.isStreakBroken || summary.currentStreak === 0
                          ? "Điểm danh lại từ đầu (+5 điểm)"
                          : "Điểm danh hôm nay (+5 điểm)"}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </Reveal>
          </div>

          {/* Cột phải: C. NEXT REWARD & E. POINTS VOUCHER */}
          <div className="lg:col-span-5 space-y-6">
            {/* Box Mục tiêu kế tiếp */}
            <Reveal variant="fade-left" delay={100} duration={650}>
              <div className="border border-[#E5E5E5] bg-white p-6 sm:p-7 space-y-4">
                <span className="text-xs uppercase tracking-widest text-[#707072]">
                  Mục tiêu mốc chuỗi tiếp theo
                </span>

                {summary.nextMilestone ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-medium text-[#111111]">
                        {summary.nextMilestone.title}
                      </h3>
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#FAFAFA] border border-[#E5E5E5]">
                        Mốc {summary.nextMilestone.day} ngày
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-[#707072]">
                      Còn <strong>{summary.nextMilestone.days_left} ngày</strong> điểm danh liên tiếp để mở khóa phần thưởng này.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <h3 className="text-lg font-medium text-[#111111]">
                      🎉 Đã chinh phục toàn bộ mốc chuỗi!
                    </h3>
                    <p className="text-xs sm:text-sm text-[#707072]">
                      Bạn đã đạt mốc cao nhất 365 ngày. Hãy tiếp tục duy trì để bảo toàn chuỗi thành tích.
                    </p>
                  </div>
                )}
              </div>
            </Reveal>

            {/* Box Đổi điểm lấy Voucher 40% (E. POINTS) */}
            <Reveal variant="fade-left" delay={180} duration={650}>
              <div className="border border-[#E5E5E5] bg-white p-6 sm:p-7 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-widest text-[#707072]">
                    Đổi Voucher 40%
                  </span>
                  <span className="text-xs font-mono text-[#707072]">
                    {summary.pointsBalance} / 500
                  </span>
                </div>

                <div className="w-full h-1.5 bg-[#F5F5F5] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#111111] transition-all duration-500"
                    style={{ width: `${progressRatio}%` }}
                  />
                </div>

                <p className="text-xs text-[#707072] leading-relaxed">
                  {isEligibleForVoucher
                    ? `Bạn có đủ 500 điểm để quy đổi 1 Voucher giảm giá 40% (tối đa 400.000đ, hạn 24 giờ).`
                    : `Còn ${summary.pointsNeededForNextVoucher} điểm nữa để đổi Voucher giảm giá 40%.`}
                </p>

                {isEligibleForVoucher && (
                  <button
                    type="button"
                    onClick={handleRedeemVoucher}
                    disabled={isRedeeming}
                    className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-[#111111] text-white hover:bg-[#2A2A2A] text-xs sm:text-sm font-medium transition-all"
                  >
                    <Ticket className="w-3.5 h-3.5 text-white" />
                    <span>
                      {isRedeeming ? "Đang đổi..." : "Đổi 500 điểm lấy Voucher 40%"}
                    </span>
                  </button>
                )}
              </div>
            </Reveal>
          </div>
        </section>
      )}

      {/* ── D. STREAK REWARD ROADMAP (Lộ Trình Phần Thưởng Chuỗi) ── */}
      <section className="space-y-6">
        <Reveal variant="fade-up" duration={600}>
          <div className="space-y-1">
            <span className="text-xs uppercase tracking-widest text-[#707072]">
              Lộ trình chuỗi
            </span>
            <h2 className="text-2xl sm:text-3xl font-normal text-[#111111]">
              CÁC MỐC PHẦN THƯỞNG
            </h2>
            <p className="text-xs sm:text-sm text-[#707072]">
              Phần thưởng tự động được phát hành vào kho quà ngay khi đạt mốc liên tiếp. Hạn dùng 7 ngày kể từ lúc cấp.
            </p>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {summary.streakRoadmap.map((milestone, idx) => {
            const isAchieved = milestone.status === "ACHIEVED";
            const isTarget = milestone.status === "TARGET";

            return (
              <Reveal key={milestone.milestone_day} delay={idx * 60} duration={600}>
                <div
                  className={`border p-6 rounded relative flex flex-col justify-between h-full transition-all ${
                    isAchieved
                      ? "border-[#111111] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
                      : isTarget
                      ? "border-[#111111] border-dashed bg-white"
                      : "border-[#E5E5E5] bg-white opacity-70"
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-2xl font-light text-[#111111]">
                        {milestone.milestone_day}{" "}
                        <span className="text-xs font-normal tracking-wider text-[#707072]">
                          NGÀY
                        </span>
                      </span>

                      {isAchieved ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium uppercase px-2.5 py-0.5 rounded-full bg-[#111111] text-white">
                          <Check className="w-3 h-3" />
                          <span>Đã đạt</span>
                        </span>
                      ) : isTarget ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium uppercase px-2 py-0.5 rounded-full bg-[#FAFAFA] border border-[#111111] text-[#111111]">
                          <span>Mục tiêu kế</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium uppercase px-2 py-0.5 rounded-full bg-[#F5F5F5] text-[#9E9EA0]">
                          <Lock className="w-3 h-3" />
                          <span>Khóa</span>
                        </span>
                      )}
                    </div>

                    <div>
                      <h4 className="text-base font-medium text-[#111111]">
                        {milestone.title}
                      </h4>
                      <p className="text-xs text-[#707072] mt-1 leading-relaxed">
                        {milestone.description}
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-[#F5F5F5] mt-4 flex items-center justify-between text-[11px] text-[#707072]">
                    <span>Hiệu lực: {milestone.expiry_days} ngày</span>
                    {milestone.discount_percentage && (
                      <span className="font-mono text-[#111111]">
                        Giảm {milestone.discount_percentage}% (Tối đa{" "}
                        {(milestone.max_discount_vnd || 300000).toLocaleString("vi-VN")}
                        đ)
                      </span>
                    )}
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ── F. MY REWARDS & VOUCHERS (Kho Ưu Đãi Của Bạn) ── */}
      {summary.isAuthenticated && (
        <section className="space-y-6">
          <Reveal variant="fade-up" duration={600}>
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#E5E5E5] pb-4">
              <div>
                <span className="text-xs uppercase tracking-widest text-[#707072]">
                  Kho ưu đãi của bạn
                </span>
                <h2 className="text-2xl font-normal text-[#111111]">
                  PHẦN THƯỞNG & VOUCHER
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/menu"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[#111111] bg-white text-[#111111] text-xs font-medium hover:bg-[#111111] hover:text-white transition-colors"
                >
                  Xem Menu Kapi
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>

                {/* Segmented Filter */}
                <div className="flex items-center gap-1 p-1 rounded-full bg-[#F5F5F5] border border-[#E5E5E5] text-xs">
                <button
                  type="button"
                  onClick={() => setActiveRewardsTab("all")}
                  className={`px-3 py-1 rounded-full transition-colors ${
                    activeRewardsTab === "all"
                      ? "bg-[#111111] text-white"
                      : "text-[#707072] hover:text-[#111111]"
                  }`}
                >
                  Tất cả ({activeVouchers.length + activeEntitlements.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveRewardsTab("physical")}
                  className={`px-3 py-1 rounded-full transition-colors ${
                    activeRewardsTab === "physical"
                      ? "bg-[#111111] text-white"
                      : "text-[#707072] hover:text-[#111111]"
                  }`}
                >
                  Quà & Ẩm thực ({activeEntitlements.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveRewardsTab("vouchers")}
                  className={`px-3 py-1 rounded-full transition-colors ${
                    activeRewardsTab === "vouchers"
                      ? "bg-[#111111] text-white"
                      : "text-[#707072] hover:text-[#111111]"
                  }`}
                >
                  Voucher ({activeVouchers.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveRewardsTab("past")}
                  className={`px-3 py-1 rounded-full transition-colors ${
                    activeRewardsTab === "past"
                      ? "bg-[#111111] text-white"
                      : "text-[#707072] hover:text-[#111111]"
                  }`}
                >
                  Lịch sử cũ
                </button>
              </div>
            </div>
            </div>
          </Reveal>

          {/* Nội dung danh sách ưu đãi theo Tab */}
          <div className="space-y-4">
            {activeRewardsTab !== "past" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Physical / Food Entitlements */}
                {(activeRewardsTab === "all" || activeRewardsTab === "physical") &&
                  activeEntitlements.map((e) => (
                    <EntitlementCard key={e.id} entitlement={e} />
                  ))}

                {/* 2. Discount Vouchers */}
                {(activeRewardsTab === "all" || activeRewardsTab === "vouchers") &&
                  activeVouchers.map((v) => (
                    <VoucherCard key={v.id} voucher={v} />
                  ))}

                {activeVouchers.length === 0 && activeEntitlements.length === 0 && (
                  <div className="col-span-full border border-dashed border-[#E5E5E5] p-12 text-center rounded bg-white space-y-3">
                    <p className="text-sm text-[#707072]">
                      Hiện tại bạn chưa có phần thưởng hoặc voucher nào khả dụng.
                    </p>
                    <p className="text-xs text-[#9E9EA0]">
                      Điểm danh mỗi ngày để nhận quà mốc và tích lũy điểm thưởng!
                    </p>
                  </div>
                )}
              </div>
            ) : (
              /* Tab Lịch sử cũ: hiển thị các voucher & quà đã dùng hoặc hết hạn */
              <div className="space-y-3">
                {pastVouchers.length === 0 && pastEntitlements.length === 0 ? (
                  <p className="text-xs text-[#9E9EA0] py-6 text-center">
                    Chưa có lịch sử phần thưởng đã sử dụng hoặc hết hạn.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {pastEntitlements.map((e) => (
                      <EntitlementCard key={e.id} entitlement={e} isPast />
                    ))}
                    {pastVouchers.map((v) => (
                      <VoucherCard key={v.id} voucher={v} isPast />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── G. RECENT REWARDS HISTORY (Lịch Sử Điểm Thưởng Gần Đây) ── */}
      {summary.isAuthenticated && (
        <section className="space-y-4 border-t border-[#E5E5E5] pt-10">
          <div className="space-y-1">
            <span className="text-xs uppercase tracking-widest text-[#707072]">
              Sổ cái điểm thưởng
            </span>
            <h2 className="text-xl font-normal text-[#111111]">
              LỊCH SỬ GIAO DỊCH ĐIỂM
            </h2>
          </div>

          {summary.recentTransactions && summary.recentTransactions.length > 0 ? (
            <div className="border border-[#E5E5E5] bg-white divide-y divide-[#E5E5E5] rounded overflow-hidden">
              {summary.recentTransactions.map((tx) => (
                <div
                  key={tx.id}
                  className="p-4 flex items-center justify-between text-xs sm:text-sm hover:bg-[#FAFAFA] transition-colors"
                >
                  <div className="space-y-0.5">
                    <p className="font-medium text-[#111111]">
                      {tx.description || tx.type}
                    </p>
                    <p className="text-[11px] text-[#707072] font-mono">
                      {formatVietnamDateTime(tx.created_at)}
                    </p>
                  </div>
                  <span
                    className={`font-mono text-sm font-medium ${
                      tx.points_delta > 0 ? "text-[#111111]" : "text-[#707072]"
                    }`}
                  >
                    {tx.points_delta > 0 ? `+${tx.points_delta}` : tx.points_delta} pts
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[#9E9EA0] py-4">Chưa có giao dịch điểm nào.</p>
          )}
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card: Hiển thị Entitlement (Quà hiện vật & món ăn)
// ---------------------------------------------------------------------------
function getEntitlementInstruction(rewardType: string): string {
  switch (rewardType) {
    case "SNACK_X1":
      return "Chọn 1 món ăn vặt miễn phí khi đặt phòng";
    case "SNACK_X2":
      return "Chọn 2 món ăn vặt miễn phí khi đặt phòng";
    case "SNACK_COMBO":
      return "Chọn 2 món ăn vặt + 1 nước uống miễn phí";
    case "MEAL_CHOICE":
      return "Chọn 1 món ăn chính miễn phí khi đặt phòng";
    default:
      return "Phần thưởng chuỗi điểm danh khi đặt phòng";
  }
}

function EntitlementCard({
  entitlement,
  isPast = false,
}: {
  entitlement: UserRewardEntitlement;
  isPast?: boolean;
}) {
  const isAvailable = entitlement.status === "AVAILABLE";
  const isMeal = entitlement.reward_type === "MEAL_CHOICE";

  return (
    <div
      className={`border p-5 rounded flex flex-col justify-between gap-4 ${
        isPast
          ? "border-[#E5E5E5] bg-[#FAFAFA] opacity-60"
          : "border-[#E5E5E5] bg-white hover:border-[#111111] transition-colors"
      }`}
    >
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {isMeal ? (
              <Utensils className="w-4 h-4 text-[#111111]" />
            ) : (
              <Gift className="w-4 h-4 text-[#111111]" />
            )}
            <h4 className="text-sm font-medium text-[#111111]">
              {entitlement.title}
            </h4>
          </div>

          <span
            className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full ${
              isAvailable
                ? "bg-[#111111] text-white"
                : "bg-[#F5F5F5] text-[#707072] border border-[#E5E5E5]"
            }`}
          >
            {entitlement.status}
          </span>
        </div>

        <p className="text-xs text-[#707072] leading-relaxed">
          {isAvailable
            ? getEntitlementInstruction(entitlement.reward_type)
            : entitlement.description || "Phần thưởng chuỗi điểm danh."}
        </p>

        {isAvailable && (
          <div className="pt-1">
            <Link
              href="/menu"
              className="inline-flex items-center gap-1 px-2.5 py-1 border border-[#111111] bg-white hover:bg-[#111111] text-[#111111] hover:text-white text-[11px] font-medium transition-colors"
            >
              Xem Menu Kapi
              <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        )}

        {entitlement.selection_data?.menu_item_name && (
          <p className="text-xs text-[#111111] font-medium bg-[#FAFAFA] px-2.5 py-1 rounded border border-[#E5E5E5] w-fit">
            Món đã chọn: {String(entitlement.selection_data.menu_item_name)}
          </p>
        )}
      </div>

      <div className="pt-3 border-t border-[#F5F5F5] flex items-center justify-between text-[11px] text-[#707072]">
        <span>Hạn dùng: {formatVietnamDate(entitlement.expires_at, true)}</span>
        <span className="font-mono">Chuỗi {entitlement.milestone_day} ngày</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card: Hiển thị Voucher (500 pts vs 150-day vs 365-day)
// ---------------------------------------------------------------------------
function VoucherCard({
  voucher,
  isPast = false,
}: {
  voucher: RewardsVoucher;
  isPast?: boolean;
}) {
  const isAvailable = voucher.status === "AVAILABLE";

  return (
    <div
      className={`border p-5 rounded flex flex-col justify-between gap-4 ${
        isPast
          ? "border-[#E5E5E5] bg-[#FAFAFA] opacity-60"
          : "border-[#E5E5E5] bg-white hover:border-[#111111] transition-colors"
      }`}
    >
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Ticket className="w-4 h-4 text-[#111111]" />
              <h4 className="text-sm font-medium text-[#111111]">
                Voucher {voucher.discount_percentage}%
              </h4>
            </div>
            <span className="text-[11px] font-mono text-[#707072] block">
              {voucher.source_title || "Ưu đãi Kapi"}
            </span>
          </div>

          <span
            className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full ${
              isAvailable
                ? "bg-[#111111] text-white"
                : "bg-[#F5F5F5] text-[#707072] border border-[#E5E5E5]"
            }`}
          >
            {voucher.status}
          </span>
        </div>

        <p className="text-xs text-[#707072]">
          Giảm tối đa {voucher.max_discount_vnd.toLocaleString("vi-VN")}đ khi đặt phòng.
        </p>
      </div>

      <div className="pt-3 border-t border-[#F5F5F5] flex items-center justify-between text-[11px] text-[#707072]">
        <span>Hết hạn: {formatVietnamDateTime(voucher.expires_at)}</span>
        <span className="font-mono text-[#111111]">
          {voucher.source === "150_DAY_STREAK"
            ? "Mốc 150 ngày"
            : voucher.source === "365_DAY_STREAK"
            ? "Mốc 365 ngày"
            : "500 Points"}
        </span>
      </div>
    </div>
  );
}
