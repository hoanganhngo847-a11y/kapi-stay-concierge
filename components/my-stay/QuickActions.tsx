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
    <div className="flex flex-col gap-3 p-5 bg-white rounded-2xl border border-dark/10 shadow-sm">
      <h4 className="font-semibold text-sm text-dark">Thao tác nhanh</h4>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={!canReportIssue}
          onClick={onReportIssue}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-primary text-white hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Wrench className="w-4 h-4" />
          <span>Báo sự cố / Yêu cầu hỗ trợ</span>
        </button>

        <button
          type="button"
          disabled={!isCheckoutAllowed}
          className="px-4 py-2 text-sm font-medium rounded-xl bg-dark/5 text-dark/70 hover:bg-dark/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Trả phòng 1-Click
        </button>
      </div>

      <div className="space-y-1 text-xs text-dark/60">
        {!canReportIssue && (
          <p>
            Chức năng gửi yêu cầu hỗ trợ chỉ khả dụng khi kỳ nghỉ đang hoạt động và mã khóa đã được kích hoạt.
          </p>
        )}
        <p>
          Chức năng trả phòng trực tuyến chưa khả dụng. Vui lòng liên hệ lễ tân để hoàn tất trả phòng.
        </p>
      </div>
    </div>
  );
}

export default QuickActions;