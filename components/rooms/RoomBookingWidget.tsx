"use client";

import * as React from "react";
import { Info, ShieldCheck, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatVND } from "@/lib/utils/format";
import type { PublicRoom } from "@/lib/data/rooms";

interface RoomBookingWidgetProps {
  room: PublicRoom;
}

export function RoomBookingWidget({ room }: RoomBookingWidgetProps) {
  // Today's date string YYYY-MM-DD
  const todayStr = React.useMemo(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }, []);

  const [checkIn, setCheckIn] = React.useState("");
  const [checkOut, setCheckOut] = React.useState("");
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [infoMessage, setInfoMessage] = React.useState<string | null>(null);

  // Compute number of nights
  const nights = React.useMemo(() => {
    if (!checkIn || !checkOut) return 0;
    const d1 = new Date(checkIn);
    const d2 = new Date(checkOut);
    const diffTime = d2.getTime() - d1.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  }, [checkIn, checkOut]);

  const estimatedTotal = nights * room.nightly_price_vnd;

  const handleCheckInChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCheckIn(val);
    setValidationError(null);
    setInfoMessage(null);
    if (checkOut && val >= checkOut) {
      setCheckOut("");
    }
  };

  const handleCheckOutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCheckOut(val);
    setValidationError(null);
    setInfoMessage(null);
  };

  const handleContinueBooking = (e: React.FormEvent) => {
    e.preventDefault();

    if (!checkIn) {
      setValidationError("Vui lòng chọn ngày nhận phòng (Check-in).");
      return;
    }
    if (!checkOut) {
      setValidationError("Vui lòng chọn ngày trả phòng (Check-out).");
      return;
    }
    if (checkOut <= checkIn) {
      setValidationError("Ngày trả phòng phải sau ngày nhận phòng ít nhất 1 đêm.");
      return;
    }

    setValidationError(null);
    setInfoMessage(
      "Giai đoạn tạo đơn thanh toán (Checkout) sẽ được kích hoạt ở Phase tiếp theo. Kapi House yêu cầu thanh toán đủ 100% trước khi xác nhận đặt phòng."
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-dark/10 shadow-sm p-6 lg:p-7 sticky top-24">
      {/* Price header */}
      <div className="flex items-baseline justify-between pb-5 border-b border-dark/10 mb-6">
        <div>
          <span className="text-2xl sm:text-3xl font-bold text-primary">
            {formatVND(room.nightly_price_vnd)}
          </span>
          <span className="text-sm text-dark/60"> / đêm</span>
        </div>
        <span className="text-xs text-dark/50 font-medium">Tối đa {room.capacity} khách</span>
      </div>

      <form onSubmit={handleContinueBooking} className="space-y-4">
        {/* Date Selection Box */}
        <div className="rounded-xl border border-dark/15 overflow-hidden">
          <div className="grid grid-cols-2 divide-x divide-dark/15">
            {/* Check-in */}
            <div className="p-3 bg-light/30">
              <label
                htmlFor="checkin-date"
                className="block text-[11px] font-semibold text-dark/60 uppercase tracking-wider mb-1"
              >
                Nhận phòng
              </label>
              <div className="relative">
                <input
                  id="checkin-date"
                  type="date"
                  min={todayStr}
                  value={checkIn}
                  onChange={handleCheckInChange}
                  className="w-full bg-transparent text-sm font-medium text-dark focus:outline-none cursor-pointer"
                />
              </div>
            </div>

            {/* Check-out */}
            <div className="p-3 bg-light/30">
              <label
                htmlFor="checkout-date"
                className="block text-[11px] font-semibold text-dark/60 uppercase tracking-wider mb-1"
              >
                Trả phòng
              </label>
              <div className="relative">
                <input
                  id="checkout-date"
                  type="date"
                  min={checkIn || todayStr}
                  value={checkOut}
                  onChange={handleCheckOutChange}
                  className="w-full bg-transparent text-sm font-medium text-dark focus:outline-none cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Validation Error */}
        {validationError && (
          <p className="text-xs text-red-600 font-medium" role="alert">
            {validationError}
          </p>
        )}

        {/* Price Estimation Preview */}
        {nights > 0 && (
          <div className="pt-2 pb-1 text-xs space-y-2 text-dark/70">
            <div className="flex justify-between items-center">
              <span>
                {formatVND(room.nightly_price_vnd)} × {nights} đêm
              </span>
              <span className="font-semibold text-dark">{formatVND(estimatedTotal)}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-dark/10 text-sm font-bold text-dark">
              <span>Tạm tính</span>
              <span className="text-primary">{formatVND(estimatedTotal)}</span>
            </div>
          </div>
        )}

        {/* CTA Button */}
        <Button
          type="submit"
          className="w-full h-12 text-base font-semibold shadow-sm justify-center"
          rightIcon={<ArrowRight className="w-4 h-4" />}
        >
          Tiếp tục đặt phòng
        </Button>

        {/* Informative Note */}
        {infoMessage && (
          <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 text-xs text-primary leading-relaxed flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{infoMessage}</span>
          </div>
        )}

        <div className="pt-4 border-t border-dark/10 flex items-center justify-center gap-2 text-xs text-dark/50">
          <ShieldCheck className="w-4 h-4 text-secondary shrink-0" />
          <span>Tự check-in 24/7 • Không cần đặt cọc</span>
        </div>
      </form>
    </div>
  );
}
