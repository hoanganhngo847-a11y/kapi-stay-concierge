"use client";

import React from "react";

interface QuickActionsProps {
  bookingId?: string;
  isCheckoutAllowed?: boolean;
}

export function QuickActions({
  isCheckoutAllowed = false,
}: QuickActionsProps) {
  return (
    <div className="flex flex-col gap-3">
      <h4 className="font-medium text-sm text-muted-foreground">Thao tác nhanh</h4>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!isCheckoutAllowed}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Trả phòng 1-Click
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Chức năng trả phòng trực tuyến chưa khả dụng. Vui lòng liên hệ lễ tân để hoàn tất trả phòng.
      </p>
    </div>
  );
}

export default QuickActions;