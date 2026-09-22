"use client";

import React, { useState } from "react";

interface QuickActionsProps {
  bookingId: string;
  isCheckoutAllowed?: boolean;
}

export function QuickActions({
  bookingId,
  isCheckoutAllowed = false,
}: QuickActionsProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleCheckout = async () => {
    if (!isCheckoutAllowed || !bookingId) return;

    setIsLoading(true);
    try {
      // TODO: Gọi Guest Checkout Server Action/RPC khi backend ready
      alert("Yêu cầu trả phòng đã được gửi thành công.");
    } catch {
      alert("Không thể thực hiện trả phòng lúc này. Vui lòng liên hệ lễ tân.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <h4 className="font-medium text-sm text-muted-foreground">Thao tác nhanh</h4>
      <div className="flex gap-2">
        <button
          onClick={handleCheckout}
          disabled={!isCheckoutAllowed || isLoading}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "Đang xử lý..." : "Trả phòng 1-Click"}
        </button>
      </div>
      {!isCheckoutAllowed && (
        <p className="text-xs text-muted-foreground">
          Chức năng trả phòng trực tuyến chưa khả dụng. Vui lòng liên hệ lễ tân để hoàn tất trả phòng.
        </p>
      )}
    </div>
  );
}

export default QuickActions;