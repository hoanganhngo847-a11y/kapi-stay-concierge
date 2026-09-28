"use client";

import React from "react";
import { Wrench } from "lucide-react";

export interface QuickActionsProps {
  bookingId?: string;
  isCheckoutAllowed?: boolean;
  canReportIssue?: boolean;
  onReportIssue?: () => void;
}

export function QuickActions({
  isCheckoutAllowed = false,
  canReportIssue = false,
  onReportIssue,
}: QuickActionsProps) {
  return (
    <div className="flex flex-col gap-4 p-6 bg-white border border-[#E5E5E5]">
      <div>
        <span className="text-[11px] font-medium uppercase tracking-wider text-[#707072] block mb-1">
          Hỗ trợ & Thao tác
        </span>
        <h4 className="font-medium text-lg text-[#111111]">Thao tác kỳ nghỉ</h4>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          disabled={!canReportIssue}
          onClick={onReportIssue}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 text-xs sm:text-sm font-medium rounded-full bg-[#111111] text-white hover:bg-black disabled:bg-[#9E9EA0] disabled:cursor-not-allowed transition-colors"
        >
          <Wrench className="w-4 h-4" />
          <span>Báo sự cố / Yêu cầu hỗ trợ</span>
        </button>

        <button
          type="button"
          disabled={!isCheckoutAllowed}
          className="inline-flex items-center justify-center px-5 py-3 text-xs sm:text-sm font-medium rounded-full border border-[#E5E5E5] text-[#111111] hover:bg-[#F5F5F5] disabled:text-[#9E9EA0] disabled:cursor-not-allowed transition-colors"
        >
          Trả phòng 1-Click
        </button>
      </div>

      <div className="space-y-1 text-xs text-[#707072] pt-2 border-t border-[#E5E5E5]">
        {!canReportIssue && (
          <p>
            Chức năng gửi yêu cầu hỗ trợ chỉ khả dụng khi kỳ nghỉ đang hoạt động và mã khóa đã được kích hoạt.
          </p>
        )}
        <p>
          Chức năng trả phòng trực tuyến chưa khả dụng. Quý khách vui lòng liên hệ lễ tân để hoàn tất trả phòng.
        </p>
      </div>
    </div>
  );
}

export default QuickActions;