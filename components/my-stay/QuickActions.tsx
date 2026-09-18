"use client";

import React, { useState } from "react";

interface QuickActionsProps {
    _bookingId?: string;
    onCheckoutSuccess?: () => void;
}

export default function QuickActions({ onCheckoutSuccess }: QuickActionsProps) {
    const [isCheckingOut, setIsCheckingOut] = useState(false);

    const handleCheckout = async () => {
        const confirm = window.confirm("Bạn có chắc chắn muốn trả phòng và rời đi không?");
        if (!confirm) return;

        setIsCheckingOut(true);
        try {
            alert("Đã xác nhận trả phòng thành công! Cảm ơn bạn đã lưu trú.");
            if (onCheckoutSuccess) onCheckoutSuccess();
        } catch {
            alert("Có lỗi xảy ra, vui lòng thử lại.");
        } finally {
            setIsCheckingOut(false);
        }
    };

    return (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-4">
            <h3 className="font-semibold text-gray-800 mb-3">Thao tác nhanh</h3>
            <button
                onClick={handleCheckout}
                disabled={isCheckingOut}
                className="w-full py-3 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl font-medium text-sm transition"
            >
                {isCheckingOut ? "Đang xử lý..." : "🚪 Trả phòng nhanh (1-Click Checkout)"}
            </button>
        </div>
    );
}