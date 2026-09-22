"use client";

import React, { useState } from "react";

interface QuickActionsProps {
  bookingId?: string;
  onCheckoutSuccess?: () => void;
}

export default function QuickActions({
  bookingId,
  onCheckoutSuccess,
}: QuickActionsProps) {
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const handleCheckout = async () => {
    if (!bookingId) {
      alert("Không tìm thấy mã đặt phòng hợp lệ!");
      return;
    }

    const confirm = window.confirm("Xác nhận trả phòng sớm và yêu cầu dọn dẹp?");
    if (!confirm) return;

    setIsCheckingOut(true);
    try {
      // Khi TV8 push API, sẽ mở comment dòng này để ghi nhận xuống DB:
      // await updateBookingStatus(bookingId, "checkout_requested");

      alert(`Đã gửi yêu cầu trả phòng cho mã đơn: ${bookingId}`);
      if (onCheckoutSuccess) {
        onCheckoutSuccess();
      }
    } catch (error) {
      alert("Gửi yêu cầu thất bại, vui lòng thử lại.");
    } finally {
      setIsCheckingOut(false);
    }
  };

  return (
    <div className="w-full mt-4">
      <button
        onClick={handleCheckout}
        disabled={isCheckingOut}
        className="w-full py-3 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
      >
        {isCheckingOut ? "Đang xử lý..." : "Trả phòng nhanh (1-Click Checkout)"}
      </button>
    </div>
  );
}