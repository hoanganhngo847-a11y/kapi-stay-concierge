"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Sparkles, Ticket, AlertCircle, RefreshCw } from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";
import {
  type RewardsSummary,
  type RewardsVoucher,
  formatVietnamDateTime,
} from "@/lib/types/rewards";
import {
  claimDailyRewardAction,
  redeemLoyaltyVoucherAction,
  getRewardsSummaryAction,
} from "@/app/rewards/actions";

export interface RewardsSectionProps {
  initialSummary: RewardsSummary;
  initialError?: string | null;
}

export function RewardsSection({
  initialSummary,
  initialError = null,
}: RewardsSectionProps) {
  const [summary, setSummary] = useState<RewardsSummary>(initialSummary);
  const [errorMsg, setErrorMsg] = useState<string | null>(initialError);
  const [feedbackMsg, setFeedbackMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

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
        setErrorMsg("Chưa thể tải Kapi Rewards. Vui lòng thử lại.");
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
        setSummary((prev) => {
          const newBalance = res.pointsBalance ?? prev.pointsBalance + 5;
          return {
            ...prev,
            hasCheckedInToday: true,
            pointsBalance: newBalance,
            pointsNeededForNextVoucher: Math.max(0, 500 - newBalance),
            redeemableVouchersCount: Math.floor(newBalance / 500),
          };
        });
      } else {
        if (res.alreadyClaimed) {
          setSummary((prev) => ({
            ...prev,
            hasCheckedInToday: true,
            pointsBalance: res.pointsBalance ?? prev.pointsBalance,
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
        // Tải lại summary toàn vẹn để nạp voucher mới và số dư chính xác
        const { data: updated } = await getRewardsSummaryAction();
        if (updated) {
          setSummary(updated);
        } else {
          setSummary((prev) => {
            const newBalance = res.pointsBalance ?? prev.pointsBalance - 500;
            return {
              ...prev,
              pointsBalance: newBalance,
              pointsNeededForNextVoucher: Math.max(0, 500 - newBalance),
              redeemableVouchersCount: Math.floor(newBalance / 500),
              availableVouchersCount: prev.availableVouchersCount + 1,
            };
          });
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

  // Tính toán thanh tiến trình từ dữ liệu thực tế
  const progressRatio = Math.min(
    100,
    Math.max(0, (summary.pointsBalance / 500) * 100)
  );
  const isEligibleForVoucher = summary.pointsBalance >= 500;

  // Lọc danh sách voucher còn giá trị hoặc hiển thị ưu tiên AVAILABLE / RESERVED
  const activeVouchers = summary.vouchers.filter(
    (v) => v.status === "AVAILABLE" || v.status === "RESERVED"
  );
  const pastVouchers = summary.vouchers.filter(
    (v) => v.status !== "AVAILABLE" && v.status !== "RESERVED"
  );

  return (
    <section
      id="rewards"
      className="relative w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 border-t border-[#E5E5E5]/60 bg-transparent scroll-mt-20"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
        {/* ── CỘT TRÁI: GIỚI THIỆU CHÍNH SÁCH KAPI REWARDS ── */}
        <div className="lg:col-span-6">
          <Reveal variant="fade-right" distance={20} duration={750}>
            <div className="p-6 sm:p-8 bg-white/85 backdrop-blur-[4px] border border-[#E5E5E5] space-y-4">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#707072]">
                Kapi Rewards
              </p>
              <h2 className="text-3xl sm:text-4xl font-normal tracking-tight text-[#111111] mt-2">
                Tích lũy điểm.<br />Nhận ưu đãi kỳ nghỉ.
              </h2>
              <p className="text-sm sm:text-base text-[#707072] leading-relaxed max-w-lg mt-3">
                Mỗi lần thanh toán thành công tại Kapi đều được tích lũy điểm thưởng.
                Sử dụng điểm để quy đổi voucher giảm giá 40% trực tiếp khi đặt phòng.
              </p>

              <div className="pt-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full border border-[#111111] flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-[#111111]" />
                  </div>
                  <div className="text-sm">
                    <strong className="font-medium text-[#111111]">500 điểm = 1 Voucher 40%</strong>
                    <p className="text-xs text-[#707072]">
                      Giảm tối đa 400.000đ, áp dụng cho mọi phòng và có hiệu lực 24 giờ.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full border border-[#111111] flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-[#111111]" />
                  </div>
                  <div className="text-sm">
                    <strong className="font-medium text-[#111111]">Điểm danh mỗi ngày +5 điểm</strong>
                    <p className="text-xs text-[#707072]">
                      Chỉ cần đăng nhập và xác nhận một chạm theo giờ Việt Nam.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full border border-[#111111] flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-[#111111]" />
                  </div>
                  <div className="text-sm">
                    <strong className="font-medium text-[#111111]">1 VND = 0.00025 điểm</strong>
                    <p className="text-xs text-[#707072]">
                      Tích điểm tự động vào tài khoản ngay sau khi thanh toán thành công.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>

        {/* ── CỘT PHẢI: TRẠNG THÁI THÀNH VIÊN & THAO TÁC ── */}
        <div className="lg:col-span-6">
          <Reveal variant="fade-left" distance={20} delay={120} duration={750}>
            {errorMsg ? (
              /* Trạng thái lỗi tải dữ liệu nhẹ */
              <div className="border border-[#E5E5E5] bg-white p-6 sm:p-8 space-y-4">
                <div className="flex items-center gap-2 text-[#111111]">
                  <AlertCircle className="w-5 h-5 text-[#707072]" />
                  <p className="text-sm font-medium">{errorMsg}</p>
                </div>
                <button
                  type="button"
                  onClick={refreshSummary}
                  disabled={isPending}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#111111] text-white text-xs sm:text-sm font-medium hover:bg-[#2A2A2A] transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isPending ? "animate-spin" : ""}`} />
                  <span>Thử lại</span>
                </button>
              </div>
            ) : !summary.isAuthenticated ? (
              /* ── STATE 1: USER CHƯA ĐĂNG NHẬP ── */
              <div className="border border-[#E5E5E5] bg-white p-6 sm:p-8 space-y-6">
                <div>
                  <span className="text-xs uppercase tracking-widest text-[#707072]">
                    Điểm thành viên
                  </span>
                  <h3 className="text-2xl sm:text-3xl font-normal text-[#111111] mt-2">
                    Đăng nhập để bắt đầu tích điểm
                  </h3>
                  <p className="text-xs sm:text-sm text-[#707072] leading-relaxed mt-3">
                    Đăng nhập để xem điểm số thực tế, điểm danh nhận +5 điểm mỗi ngày và đổi
                    voucher giảm giá 40% cho kỳ nghỉ của bạn.
                  </p>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                  <Link
                    href="/login"
                    className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3 rounded-full bg-[#111111] text-white text-xs sm:text-sm font-medium hover:bg-[#2A2A2A] transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    Đăng nhập
                  </Link>
                  <Link
                    href="/rooms"
                    className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 rounded-full border border-[#E5E5E5] text-[#111111] text-xs sm:text-sm font-medium hover:bg-[#F5F5F5] transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    Khám phá phòng ngay
                  </Link>
                </div>
              </div>
            ) : (
              /* ── STATE 2: USER ĐÃ ĐĂNG NHẬP ── */
              <div className="border border-[#E5E5E5] bg-white p-6 sm:p-8 space-y-6">
                {/* 1. Header điểm số & tiến trình */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-[#E5E5E5] gap-4">
                  <div>
                    <span className="text-xs uppercase tracking-widest text-[#707072]">
                      Điểm thành viên
                    </span>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-4xl sm:text-5xl font-normal text-[#111111]">
                        {summary.pointsBalance.toLocaleString("vi-VN")}
                      </span>
                      <span className="text-xs uppercase tracking-widest text-[#707072]">
                        POINTS
                      </span>
                    </div>
                  </div>

                  <div className="sm:text-right">
                    {isEligibleForVoucher ? (
                      <div>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#111111] text-white text-xs font-medium">
                          <Sparkles className="w-3.5 h-3.5 text-white" />
                          <span>Đủ điểm đổi voucher</span>
                        </span>
                        <div className="w-36 h-1.5 bg-[#F5F5F5] rounded-full overflow-hidden mt-2">
                          <div className="w-full h-full bg-[#111111]" />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <span className="text-xs font-mono text-[#707072]">
                          {summary.pointsBalance.toLocaleString("vi-VN")} / 500
                        </span>
                        <div className="w-36 h-1.5 bg-[#F5F5F5] rounded-full overflow-hidden mt-2">
                          <div
                            className="h-full bg-[#111111] transition-all duration-500"
                            style={{ width: `${progressRatio}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Diễn giải mục tiêu */}
                <div className="py-1">
                  {isEligibleForVoucher ? (
                    <p className="text-xs sm:text-sm text-[#111111]">
                      Bạn có thể đổi tối đa <strong>{summary.redeemableVouchersCount} voucher</strong> giảm giá 40%. Mỗi voucher có giá trị trong 24 giờ.
                    </p>
                  ) : (
                    <p className="text-xs sm:text-sm text-[#707072]">
                      Còn <strong>{summary.pointsNeededForNextVoucher.toLocaleString("vi-VN")} điểm</strong> để nhận voucher giảm giá 40% tiếp theo
                    </p>
                  )}
                </div>

                {/* 3. Inline Feedback */}
                {feedbackMsg && (
                  <div
                    className={`p-3 rounded-lg text-xs flex items-center justify-between gap-2 ${
                      feedbackMsg.type === "success"
                        ? "bg-[#F5F5F5] text-[#111111] border border-[#E5E5E5]"
                        : "bg-[#FFF5F5] text-[#D32F2F] border border-[#FFCDD2]"
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

                {/* 4. Hàng nút tương tác */}
                <div className="pt-2 flex flex-col sm:flex-row flex-wrap items-center gap-3">
                  {/* Nút điểm danh */}
                  {summary.hasCheckedInToday ? (
                    <button
                      type="button"
                      disabled
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-[#F5F5F5] text-[#707072] border border-[#E5E5E5] text-xs sm:text-sm font-medium cursor-default"
                    >
                      <Check className="w-3.5 h-3.5 text-[#111111]" />
                      <span>Đã điểm danh hôm nay +5</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleDailyCheckin}
                      disabled={isClaiming}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-white border border-[#111111] text-[#111111] hover:bg-[#111111] hover:text-white text-xs sm:text-sm font-medium transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{isClaiming ? "Đang điểm danh..." : "Điểm danh hôm nay +5"}</span>
                    </button>
                  )}

                  {/* Nút đổi voucher */}
                  {isEligibleForVoucher && (
                    <button
                      type="button"
                      onClick={handleRedeemVoucher}
                      disabled={isRedeeming}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[#111111] text-white text-xs sm:text-sm font-medium hover:bg-[#2A2A2A] transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                    >
                      <Ticket className="w-3.5 h-3.5 text-white" />
                      <span>
                        {isRedeeming ? "Đang đổi..." : "Đổi 500 điểm lấy Voucher 40%"}
                      </span>
                    </button>
                  )}

                  <Link
                    href="/rooms"
                    className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 rounded-full border border-[#E5E5E5] text-[#111111] text-xs sm:text-sm font-medium hover:bg-[#F5F5F5] transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    Khám phá phòng ngay
                  </Link>
                </div>

                {/* 5. Danh sách voucher của user */}
                <div className="pt-4 border-t border-[#E5E5E5] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-widest text-[#707072]">
                      Voucher của bạn ({activeVouchers.length} khả dụng)
                    </span>
                    <button
                      type="button"
                      onClick={refreshSummary}
                      disabled={isPending}
                      title="Làm mới voucher"
                      className="text-xs text-[#707072] hover:text-[#111111] inline-flex items-center gap-1 transition-colors"
                    >
                      <RefreshCw className={`w-3 h-3 ${isPending ? "animate-spin" : ""}`} />
                      <span>Làm mới</span>
                    </button>
                  </div>

                  {activeVouchers.length > 0 ? (
                    <div className="space-y-2.5">
                      {activeVouchers.map((v) => (
                        <VoucherItem key={v.id} voucher={v} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#9E9EA0] py-1">
                      Bạn chưa có voucher nào khả dụng. Hãy điểm danh mỗi ngày hoặc đặt phòng để tích lũy 500 điểm đổi voucher.
                    </p>
                  )}

                  {/* Lịch sử voucher cũ (nếu có, hiển thị rút gọn) */}
                  {pastVouchers.length > 0 && (
                    <details className="pt-2 text-xs text-[#9E9EA0] group">
                      <summary className="cursor-pointer hover:text-[#111111] select-none py-1">
                        Xem {pastVouchers.length} voucher đã dùng hoặc hết hạn
                      </summary>
                      <div className="space-y-2 mt-2 pt-2 border-t border-[#F5F5F5]">
                        {pastVouchers.slice(0, 3).map((v) => (
                          <VoucherItem key={v.id} voucher={v} isPast />
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            )}
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: Thẻ hiển thị Voucher
// ---------------------------------------------------------------------------

function VoucherItem({
  voucher,
  isPast = false,
}: {
  voucher: RewardsVoucher;
  isPast?: boolean;
}) {
  const isAvailable = voucher.status === "AVAILABLE";
  const isReserved = voucher.status === "RESERVED";

  return (
    <div
      className={`border p-3.5 rounded flex items-center justify-between gap-3 ${
        isPast
          ? "border-[#E5E5E5] bg-[#FAFAFA] opacity-60"
          : "border-[#E5E5E5] bg-[#FFFFFF] hover:border-[#111111] transition-colors"
      }`}
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Ticket className="w-3.5 h-3.5 text-[#111111]" />
          <span className="text-xs sm:text-sm font-medium text-[#111111]">
            Voucher {voucher.discount_percentage}%
          </span>
        </div>
        <p className="text-[11px] sm:text-xs text-[#707072]">
          Giảm tối đa {voucher.max_discount_vnd.toLocaleString("vi-VN")}đ • Hết hạn:{" "}
          <span className="font-mono text-[#111111]">
            {formatVietnamDateTime(voucher.expires_at)}
          </span>
        </p>
      </div>

      <div className="shrink-0">
        {isAvailable && (
          <span className="inline-block px-2.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded-full bg-[#111111] text-white">
            AVAILABLE
          </span>
        )}
        {isReserved && (
          <span className="inline-block px-2.5 py-0.5 text-[10px] uppercase tracking-wider font-medium rounded-full bg-[#F5F5F5] text-[#707072] border border-[#E5E5E5]">
            RESERVED
          </span>
        )}
        {!isAvailable && !isReserved && (
          <span className="inline-block px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#9E9EA0]">
            {voucher.status}
          </span>
        )}
      </div>
    </div>
  );
}
