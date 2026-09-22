"use client";

import React, { useState } from "react";
import { KeyCard, type StayStatus } from "@/components/my-stay/KeyCard";
import WifiWidget from "@/components/my-stay/WifiWidget"; import { QuickActions } from "@/components/my-stay/QuickActions";
import { getMyStayBookingDetails } from "@/lib/data/my-stay";

const SUPPORT_HOTLINE = "0901 234 567";

interface StayData {
  bookingId: string;
  roomName?: string;
  passcode?: string | null;
  propertyAddress?: string | null;
  propertyMapsUrl?: string | null;
  wifiSsid?: string | null;
  wifiPass?: string | null;
  hasActiveCredential?: boolean;
  activationNotice?: string;
  stayStatus?: StayStatus;
  isActiveStay?: boolean;
}

export default function MyStayClient() {
  const [bookingInput, setBookingInput] = useState("");
  const [stayData, setStayData] = useState<StayData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingInput.trim()) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const data = await getMyStayBookingDetails(bookingInput.trim());
      if (!data) {
        setErrorMessage("Không tìm thấy thông tin đặt phòng hoặc bạn không có quyền truy cập.");
        setStayData(null);
      } else {
        setStayData(data as StayData);
      }
    } catch (err: unknown) {
      const errorObj = err as { code?: string; status?: number } | null | undefined;
      if (errorObj?.code === "PGRST116" || errorObj?.status === 404) {
        setErrorMessage("Mã đặt phòng không tồn tại hoặc không khớp với tài khoản của bạn.");
      } else if (errorObj?.status === 401 || errorObj?.status === 403) {
        setErrorMessage("Bạn cần đăng nhập để xem thông tin lưu trú này.");
      } else {
        setErrorMessage("Hệ thống tạm thời không khả dụng. Vui lòng thử lại sau.");
      }
      setStayData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const canRevealAccess = Boolean(stayData?.hasActiveCredential && stayData?.isActiveStay);
  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <form onSubmit={handleSubmit} className="space-y-3">
        <label htmlFor="bookingCode" className="block text-sm font-medium">
          Mã đặt phòng (Booking ID)
        </label>
        <div className="flex gap-2">
          <input
            id="bookingCode"
            type="text"
            value={bookingInput}
            onChange={(e) => setBookingInput(e.target.value)}
            placeholder="Nhập UUID đơn hàng (VD: 123e4567-e89b-12d3-a456-426614174000)"
            className="flex-1 px-3 py-2 border rounded-lg text-sm"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {isLoading ? "Đang tra cứu..." : "Tra cứu"}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Vui lòng nhập mã định danh đơn hàng được cung cấp trong xác nhận đặt phòng.
        </p>
      </form>

      {errorMessage && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-lg">
          {errorMessage}
        </div>
      )}

      {stayData && (
        <div className="space-y-6 border-t pt-6">
          {canRevealAccess && stayData.passcode ? (
            <KeyCard
              roomName={stayData.roomName}
              passcode={stayData.passcode}
              address={stayData.propertyAddress ?? undefined}
              mapUrl={stayData.propertyMapsUrl ?? undefined}
              stayStatus={stayData.stayStatus}
            />
          ) : (
            <div className="p-4 rounded-xl border bg-muted/50 text-sm text-muted-foreground text-center">
              {stayData.activationNotice ?? "Thông tin truy cập phòng chưa khả dụng."}
            </div>
          )}

          {canRevealAccess && stayData.wifiSsid && stayData.wifiPass ? (
            <WifiWidget ssid={stayData.wifiSsid} password={stayData.wifiPass} />
          ) : null}

          <QuickActions
            bookingId={stayData.bookingId}
            // Tạm thời disable cho tới khi backend cung cấp trusted guest checkout RPC
            isCheckoutAllowed={false}
          />

          <div className="text-xs text-muted-foreground text-center border-t pt-4">
            Cần hỗ trợ gấp? Liên hệ Hotline:{" "}
            <a href={`tel:${SUPPORT_HOTLINE.replace(/\s+/g, "")}`} className="font-semibold text-primary underline">
              {SUPPORT_HOTLINE}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}