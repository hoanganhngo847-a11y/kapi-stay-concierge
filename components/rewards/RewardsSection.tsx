"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, Sparkles, Calendar, Gift } from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";

export function RewardsSection() {
  return (
    <section
      id="rewards"
      className="relative w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24 border-t border-[#E5E5E5]/60 bg-transparent scroll-mt-20"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16 items-center">
        {/* ── CỘT TRÁI: GIỚI THIỆU CHƯƠNG TRÌNH KAPI REWARDS ── */}
        <div className="lg:col-span-7 space-y-6">
          <Reveal variant="fade-up" distance={20} duration={600}>
            <div className="inline-block bg-white/85 backdrop-blur-[4px] px-3.5 py-1.5 border border-[#E5E5E5]">
              <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#707072]">
                Chương trình thành viên
              </span>
            </div>
          </Reveal>

          <Reveal variant="fade-up" delay={80} distance={24} duration={700}>
            <div className="space-y-3 bg-white/85 backdrop-blur-[4px] p-6 sm:p-8 border border-[#E5E5E5]">
              <h2 className="text-3xl sm:text-5xl font-normal tracking-tight text-[#111111] leading-[1.12]">
                KAPI REWARDS
              </h2>
              <div className="text-base sm:text-lg text-[#555555] font-normal leading-relaxed pt-1 space-y-1">
                <p>Tích điểm mỗi lần lưu trú.</p>
                <p>Điểm danh mỗi ngày.</p>
                <p>Duy trì chuỗi để mở khóa quà.</p>
              </div>

              <div className="pt-6">
                <Link
                  href="/rewards"
                  className="group inline-flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-full bg-[#111111] text-white hover:bg-[#2A2A2A] font-medium text-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                >
                  <span>Khám phá Kapi Rewards</span>
                  <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                </Link>
              </div>
            </div>
          </Reveal>
        </div>

        {/* ── CỘT PHẢI: 3 ĐIỂM NỔI BẬT TỐI GIẢN (MONOCHROME EDITORIAL) ── */}
        <div className="lg:col-span-5">
          <Reveal variant="fade-left" delay={160} distance={24} duration={700}>
            <div className="bg-white/85 backdrop-blur-[4px] border border-[#E5E5E5] divide-y divide-[#E5E5E5]">
              {/* Feature 1 */}
              <div className="p-6 sm:p-7 space-y-1.5 flex items-start gap-4">
                <div className="w-9 h-9 rounded-full border border-[#111111] flex items-center justify-center shrink-0 mt-0.5 bg-[#FAFAFA]">
                  <Calendar className="w-4 h-4 text-[#111111]" />
                </div>
                <div>
                  <h3 className="text-base font-medium text-[#111111]">
                    +5 điểm mỗi ngày
                  </h3>
                  <p className="text-xs sm:text-sm text-[#707072] leading-relaxed mt-1">
                    Điểm danh một chạm hằng ngày theo giờ Việt Nam. Bắt đầu tích lũy điểm ngay cả khi chưa phát sinh kỳ nghỉ.
                  </p>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="p-6 sm:p-7 space-y-1.5 flex items-start gap-4">
                <div className="w-9 h-9 rounded-full border border-[#111111] flex items-center justify-center shrink-0 mt-0.5 bg-[#FAFAFA]">
                  <Sparkles className="w-4 h-4 text-[#111111]" />
                </div>
                <div>
                  <h3 className="text-base font-medium text-[#111111]">
                    500 điểm đổi Voucher 40%
                  </h3>
                  <p className="text-xs sm:text-sm text-[#707072] leading-relaxed mt-1">
                    Quy đổi điểm thưởng lấy voucher giảm 40% (tối đa 400.000đ) áp dụng trực tiếp khi đặt phòng, có hiệu lực 24 giờ.
                  </p>
                </div>
              </div>

              {/* Feature 3 */}
              <div className="p-6 sm:p-7 space-y-1.5 flex items-start gap-4">
                <div className="w-9 h-9 rounded-full border border-[#111111] flex items-center justify-center shrink-0 mt-0.5 bg-[#FAFAFA]">
                  <Gift className="w-4 h-4 text-[#111111]" />
                </div>
                <div>
                  <h3 className="text-base font-medium text-[#111111]">
                    Chuỗi điểm danh nhận quà đặc biệt
                  </h3>
                  <p className="text-xs sm:text-sm text-[#707072] leading-relaxed mt-1">
                    Mở khóa các mốc 10, 20, 40, 80, 150 và 365 ngày nhận snack, bữa ăn tự chọn và voucher giảm giá đến 40%.
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
