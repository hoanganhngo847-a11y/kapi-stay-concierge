"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Clock, AlertTriangle } from "lucide-react";
import { releaseCheckoutHoldAction } from "@/app/checkout/actions";

export interface CheckoutHoldTimerProps {
  expiresAt: string;
  sessionId: string;
  roomId?: string;
}

export function CheckoutHoldTimer({
  expiresAt,
  sessionId,
  roomId,
}: CheckoutHoldTimerProps) {
  const router = useRouter();
  const [timeLeftSec, setTimeLeftSec] = React.useState<number>(() => {
    if (!expiresAt) return 0;
    const diff = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
    return Math.max(0, diff);
  });
  const [isReleasing, setIsReleasing] = React.useState(false);

  React.useEffect(() => {
    if (!expiresAt) return;
    const targetMs = new Date(expiresAt).getTime();

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((targetMs - Date.now()) / 1000));
      setTimeLeftSec(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  const handleRelease = async () => {
    if (isReleasing) return;
    setIsReleasing(true);
    try {
      await releaseCheckoutHoldAction(sessionId);
    } catch (err) {
      console.error("[CheckoutHoldTimer] error releasing hold:", err);
    } finally {
      const destination = roomId ? `/rooms/${roomId}` : "/rooms";
      router.push(destination);
    }
  };

  const minutes = Math.floor(timeLeftSec / 60);
  const seconds = timeLeftSec % 60;
  const formattedTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  const isExpired = timeLeftSec <= 0;
  const isUrgent = timeLeftSec <= 300 && !isExpired; // <= 5 mins

  return (
    <div
      role="note"
      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 mb-6 border transition-colors ${
        isExpired
          ? "bg-[#FEF2F2] border-[#FCA5A5] text-[#991B1B]"
          : isUrgent
          ? "bg-[#FFFBEB] border-[#FCD34D] text-[#92400E]"
          : "bg-[#F9FAFB] border-[#E5E7EB] text-[#111111]"
      }`}
    >
      <div className="flex items-center gap-2.5">
        {isExpired ? (
          <AlertTriangle className="w-4 h-4 text-[#DC2626] shrink-0" />
        ) : (
          <Clock
            className={`w-4 h-4 shrink-0 ${
              isUrgent ? "text-[#D97706] animate-pulse" : "text-[#111111]"
            }`}
          />
        )}
        <div className="text-xs">
          {isExpired ? (
            <p className="font-medium">
              Phiên giữ phòng đã hết hạn. Vui lòng quay lại trang phòng để chọn lại giờ.
            </p>
          ) : (
            <p>
              Đang giữ phòng cho bạn trong{" "}
              <strong className="font-mono text-sm font-semibold tracking-wide">
                {formattedTime}
              </strong>
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-auto">
        <button
          type="button"
          onClick={handleRelease}
          disabled={isReleasing}
          className="text-xs text-[#707072] hover:text-[#111111] underline transition-colors disabled:opacity-50"
        >
          {isReleasing
            ? "Đang hủy giữ phòng..."
            : isExpired
            ? "Quay lại chọn phòng"
            : "Hủy & Chọn lại phòng"}
        </button>
      </div>
    </div>
  );
}
