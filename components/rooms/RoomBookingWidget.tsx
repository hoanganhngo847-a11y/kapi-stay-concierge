"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Info,
  ShieldCheck,
  ArrowRight,
  Minus,
  Plus,
  Users,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatVND } from "@/lib/utils/format";
import type { PublicRoom } from "@/lib/data/rooms";
import { checkRoomAvailabilityHourly } from "@/lib/data/bookings";
import { RoomAvailabilityTimeline } from "@/components/rooms/RoomAvailabilityTimeline";
import { createHoldSessionAction } from "@/app/rooms/[id]/actions";

export type AvailabilityState =
  | { status: "IDLE" }
  | { status: "CHECKING" }
  | { status: "AVAILABLE"; checkIn: string; checkOut: string }
  | {
      status: "UNAVAILABLE";
      checkIn: string;
      checkOut: string;
      reason?: string;
    }
  | {
      status: "ERROR";
      message: string;
    };

export interface RoomBookingWidgetProps {
  room: PublicRoom;
  initialCheckIn?: string;
  initialCheckOut?: string;
  initialGuests?: number;
  initialConflict?: string;
}

/**
 * Returns current datetime string in Asia/Ho_Chi_Minh as YYYY-MM-DDTHH:mm.
 */
function getCurrentDateTimeInVietnam(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

/**
 * Timezone-safe helper returning check-in + 2 hours in YYYY-MM-DDTHH:mm.
 */
function getMinCheckOutDateTime(checkInStr: string): string {
  if (!checkInStr) return "";
  const d = new Date(
    checkInStr.includes("Z") || checkInStr.includes("+")
      ? checkInStr
      : `${checkInStr}:00+07:00`
  );
  if (isNaN(d.getTime())) return "";

  const minOut = new Date(d.getTime() + 2 * 3600 * 1000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(minOut);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

/**
 * Computes booking hours between two datetime strings: CEIL(durationMinutes / 60).
 */
function calcBookingHours(inAt: string, outAt: string): number {
  if (!inAt || !outAt) return 0;
  const tIn = new Date(
    inAt.includes("Z") || inAt.includes("+") ? inAt : `${inAt}:00+07:00`
  ).getTime();
  const tOut = new Date(
    outAt.includes("Z") || outAt.includes("+") ? outAt : `${outAt}:00+07:00`
  ).getTime();

  if (isNaN(tIn) || isNaN(tOut) || tOut <= tIn) return 0;
  const diffMinutes = (tOut - tIn) / 60000;
  return Math.max(0, Math.ceil(diffMinutes / 60));
}

export function RoomBookingWidget({
  room,
  initialCheckIn,
  initialCheckOut,
  initialGuests,
  initialConflict,
}: RoomBookingWidgetProps) {
  const router = useRouter();
  const minNowStr = React.useMemo(() => getCurrentDateTimeInVietnam(), []);
  const maxCapacity = Math.max(1, Number(room.capacity) || 1);
  const hourlyPrice = Number(room.hourly_price_vnd) || Math.round(Number(room.nightly_price_vnd) / 5) || 120000;

  // Format initial inputs (convert YYYY-MM-DD to YYYY-MM-DDTHH:mm if needed)
  const formatInitialParam = (val?: string, defaultHour: string = "14:00") => {
    if (!val) return "";
    if (val.includes("T")) return val.slice(0, 16);
    return `${val}T${defaultHour}`;
  };

  const formattedInitialIn = formatInitialParam(initialCheckIn, "14:00");
  const formattedInitialOut = formatInitialParam(initialCheckOut, "18:00");

  const normalizedInitialCheckIn =
    formattedInitialIn && formattedInitialIn >= minNowStr ? formattedInitialIn : "";
  const normalizedInitialCheckOut =
    normalizedInitialCheckIn &&
    formattedInitialOut &&
    formattedInitialOut > normalizedInitialCheckIn
      ? formattedInitialOut
      : "";

  const normalizedInitialGuests =
    typeof initialGuests === "number" &&
    Number.isInteger(initialGuests) &&
    initialGuests > 0
      ? Math.min(initialGuests, maxCapacity)
      : 1;

  // Form State
  const [checkIn, setCheckIn] = React.useState(normalizedInitialCheckIn);
  const [checkOut, setCheckOut] = React.useState(normalizedInitialCheckOut);
  const [guests, setGuests] = React.useState(normalizedInitialGuests);
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [isHolding, setIsHolding] = React.useState(false);
  const [holdConflictMessage, setHoldConflictMessage] = React.useState<string | null>(
    initialConflict || null
  );

  // If the catalog handed us a complete valid datetime range, immediately verify it.
  const [availability, setAvailability] = React.useState<AvailabilityState>(
    normalizedInitialCheckIn && normalizedInitialCheckOut
      ? { status: "CHECKING" }
      : { status: "IDLE" }
  );

  // Request counter ref for stale response / race condition protection
  const requestIdRef = React.useRef(0);

  // Calculate booking hours and pricing
  const hours = React.useMemo(() => {
    return calcBookingHours(checkIn, checkOut);
  }, [checkIn, checkOut]);

  const estimatedTotal = hours * hourlyPrice;

  // Minimum selectable check-out datetime
  const minCheckOutStr = React.useMemo(() => {
    return checkIn ? getMinCheckOutDateTime(checkIn) : getMinCheckOutDateTime(minNowStr);
  }, [checkIn, minNowStr]);

  // Handle timeline slot selection
  const handleSelectCheckIn = (inStr: string) => {
    setCheckIn(inStr);
    setCheckOut("");
    setValidationError(null);
    setHoldConflictMessage(null);
    setAvailability({ status: "IDLE" });
  };

  const handleSelectTimelineInterval = (inStr: string, outStr: string) => {
    setCheckIn(inStr);
    setCheckOut(outStr);
    setValidationError(null);
    setHoldConflictMessage(null);
  };

  // Helper formatting for Selected Summary card (Section 10: 30/09/2026 — 08:00)
  const formatDisplayDateTime = (dtStr: string): string => {
    if (!dtStr) return "—";
    const [datePart, timePart] = dtStr.split("T");
    if (!datePart) return dtStr;
    const [y, m, d] = datePart.split("-");
    const time = timePart ? timePart.slice(0, 5) : "00:00";
    return `${d}/${m}/${y} — ${time}`;
  };

  // Handle Check-in change
  const handleCheckInChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setCheckIn(newVal);
    setValidationError(null);
    setHoldConflictMessage(null);

    // Invalidate any in-flight request.
    requestIdRef.current += 1;

    if (
      newVal &&
      checkOut &&
      newVal >= minNowStr &&
      checkOut > newVal &&
      calcBookingHours(newVal, checkOut) >= 2
    ) {
      setAvailability({ status: "CHECKING" });
    } else {
      setAvailability({ status: "IDLE" });
    }

    // If existing checkOut is less than newVal + 2 hours, reset checkOut
    if (checkOut) {
      const tIn = new Date(newVal).getTime();
      const tOut = new Date(checkOut).getTime();
      if (tOut - tIn < 2 * 3600 * 1000) {
        setCheckOut("");
      }
    }
  };

  // Handle Check-out change
  const handleCheckOutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setCheckOut(newVal);
    setValidationError(null);
    setHoldConflictMessage(null);

    // Invalidate any in-flight request.
    requestIdRef.current += 1;

    if (
      checkIn &&
      newVal &&
      checkIn >= minNowStr &&
      newVal > checkIn &&
      calcBookingHours(checkIn, newVal) >= 2
    ) {
      setAvailability({ status: "CHECKING" });
    } else {
      setAvailability({ status: "IDLE" });
    }
  };

  // Real Availability check triggered when valid datetime range is selected
  React.useEffect(() => {
    const hasBothTimes = Boolean(checkIn && checkOut);
    const durationHours = calcBookingHours(checkIn, checkOut);
    const isChronologicallyValid =
      checkIn >= minNowStr && checkOut > checkIn && durationHours >= 2;

    if (!hasBothTimes || !isChronologicallyValid) {
      requestIdRef.current += 1;
      return;
    }

    const currentRequestId = ++requestIdRef.current;
    let isMounted = true;

    async function verifyAvailability() {
      try {
        const isAvailable = await checkRoomAvailabilityHourly(
          room.id,
          checkIn,
          checkOut
        );

        if (!isMounted || currentRequestId !== requestIdRef.current) {
          return;
        }

        if (isAvailable === true) {
          setAvailability({
            status: "AVAILABLE",
            checkIn,
            checkOut,
          });
        } else {
          setAvailability({
            status: "UNAVAILABLE",
            checkIn,
            checkOut,
            reason: "Phòng đã có khách đặt hoặc đang bảo trì trong khung giờ này.",
          });
        }
      } catch (err) {
        if (!isMounted || currentRequestId !== requestIdRef.current) {
          return;
        }

        console.error("[RoomBookingWidget] checkRoomAvailabilityHourly error:", err);
        setAvailability({
          status: "ERROR",
          message: "Không thể kiểm tra tình trạng phòng lúc này.",
        });
      }
    }

    verifyAvailability();

    return () => {
      isMounted = false;
    };
  }, [room.id, checkIn, checkOut, minNowStr]);

  // Guest increment/decrement handlers bounded by [1, maxCapacity]
  const handleDecrementGuests = () => {
    setGuests((prev) => (prev > 1 ? prev - 1 : 1));
  };

  const handleIncrementGuests = () => {
    setGuests((prev) => (prev < maxCapacity ? prev + 1 : maxCapacity));
  };

  // Form submit handler: creates atomic temporary hold
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!checkIn || !checkOut) {
      setValidationError("Vui lòng chọn đầy đủ thời gian nhận và trả phòng.");
      return;
    }

    if (checkIn < minNowStr) {
      setValidationError("Thời gian nhận phòng không được ở trong quá khứ.");
      return;
    }

    const durationHours = calcBookingHours(checkIn, checkOut);
    if (durationHours < 2) {
      setValidationError("Thời lượng đặt phòng tối thiểu là 2 giờ.");
      return;
    }

    if (guests < 1 || guests > maxCapacity) {
      setValidationError("Số lượng khách vượt quá sức chứa của phòng.");
      return;
    }

    // Strictly guard against unconfirmed availability
    if (availability.status !== "AVAILABLE") {
      return;
    }

    setIsHolding(true);
    setHoldConflictMessage(null);
    setValidationError(null);

    try {
      const res = await createHoldSessionAction({
        roomId: room.id,
        checkIn,
        checkOut,
        guests,
      });

      if (res.status === "UNAUTHENTICATED" && res.loginUrl) {
        router.push(res.loginUrl);
        return;
      }

      if (res.status === "SUCCESS" && res.sessionId) {
        router.push(`/checkout?sessionId=${res.sessionId}`);
        return;
      }

      if (res.status === "CONFLICT") {
        const conflictMsg =
          res.message ||
          "Khung giờ này vừa được một khách khác chọn. Vui lòng chọn khung giờ khác.";
        setHoldConflictMessage(conflictMsg);
        setAvailability({
          status: "UNAVAILABLE",
          checkIn,
          checkOut,
          reason: conflictMsg,
        });
        return;
      }

      if (res.status === "ERROR") {
        setValidationError(res.message || "Không thể giữ phòng lúc này. Vui lòng thử lại.");
        return;
      }
    } catch (err) {
      console.error("[RoomBookingWidget] hold error:", err);
      setValidationError("Đã xảy ra lỗi khi giữ phòng. Vui lòng thử lại.");
    } finally {
      setIsHolding(false);
    }
  };

  return (
    <div className="bg-white border border-[#E5E5E5] p-5 sm:p-6 lg:p-7 sticky top-24 rounded-2xl shadow-sm">
      {/* Price header */}
      <div className="flex items-baseline justify-between pb-4 border-b border-[#E5E5E5] mb-5">
        <div>
          <span className="text-2xl sm:text-3xl font-bold text-[#111111] tracking-tight">
            {formatVND(hourlyPrice)}
          </span>
          <span className="text-xs sm:text-sm text-[#707072]"> / giờ</span>
        </div>
        <span className="text-xs font-medium text-[#707072] bg-[#F5F5F5] px-2.5 py-1 rounded-full">
          Tối đa {room.capacity} khách
        </span>
      </div>

      {/* Visual Public Availability Timeline */}
      <RoomAvailabilityTimeline
        roomId={room.id}
        selectedCheckIn={checkIn}
        selectedCheckOut={checkOut}
        onSelectCheckIn={handleSelectCheckIn}
        onSelectInterval={handleSelectTimelineInterval}
        holdConflictMessage={holdConflictMessage}
        onClearConflictMessage={() => setHoldConflictMessage(null)}
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Hidden inputs to preserve DOM contracts, form serialization, and accessibility */}
        <input
          id="checkin-datetime"
          type="datetime-local"
          value={checkIn}
          onChange={handleCheckInChange}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />
        <input
          id="checkout-datetime"
          type="datetime-local"
          min={minCheckOutStr}
          value={checkOut}
          onChange={handleCheckOutChange}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />

        {/* Selected Summary Card (Section 22 & 23) */}
        {checkIn && checkOut && hours >= 2 ? (
          <div className="border border-[#E5E5E5] bg-[#F9FAFB] p-4 rounded-xl space-y-3">
            <div className="text-[11px] font-bold text-[#111111] uppercase tracking-wider pb-2 border-b border-[#E5E5E5] flex items-center justify-between">
              <span>Lựa chọn của bạn</span>
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                Khung giờ hợp lệ
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-white p-2.5 rounded-lg border border-[#E5E5E5]">
                <span className="block text-[10px] text-[#707072] uppercase font-semibold">
                  Nhận phòng
                </span>
                <span className="font-bold text-[#111111] text-xs sm:text-sm mt-0.5 block">
                  {formatDisplayDateTime(checkIn)}
                </span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-[#E5E5E5]">
                <span className="block text-[10px] text-[#707072] uppercase font-semibold">
                  Trả phòng
                </span>
                <span className="font-bold text-[#111111] text-xs sm:text-sm mt-0.5 block">
                  {formatDisplayDateTime(checkOut)}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-[#E5E5E5] flex items-center justify-between text-xs">
              <div>
                <span className="text-[#707072] block text-[11px]">Thời lượng</span>
                <strong className="text-[#111111] font-bold text-sm">{hours} giờ</strong>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-[#707072] block font-medium">
                  {formatVND(hourlyPrice)} × {hours} giờ
                </span>
                <div className="flex items-baseline justify-end gap-1.5 mt-0.5">
                  <span className="text-[11px] text-[#707072]">Tạm tính:</span>
                  <strong className="font-bold text-sm sm:text-base text-[#111111]">
                    {formatVND(estimatedTotal)}
                  </strong>
                </div>
              </div>
            </div>
          </div>
        ) : checkIn ? (
          <div className="border border-[#E5E5E5] bg-[#F9FAFB] p-3.5 rounded-xl space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#707072] uppercase font-semibold">
                Nhận phòng đã chọn
              </span>
              <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                Bước 3 & 4: Chọn ngày & giờ trả
              </span>
            </div>
            <p className="font-bold text-[#111111] text-sm">
              {formatDisplayDateTime(checkIn)}
            </p>
            <p className="text-[11px] text-[#707072]">
              Vui lòng chọn ngày và giờ trả phòng mong muốn trên lịch trống (tối thiểu 2 giờ).
            </p>
          </div>
        ) : (
          <div className="p-3.5 bg-[#F9FAFB] border border-[#E5E5E5] rounded-xl text-xs text-[#707072] flex items-center gap-2.5">
            <Info className="w-4 h-4 text-[#111111] shrink-0" />
            <span className="leading-relaxed">
              Vui lòng chọn ngày và giờ nhận phòng trên bảng lịch trống bên trên.
            </span>
          </div>
        )}

        {/* Guest Selection Stepper */}
        <div className="p-3 border border-[#E5E5E5] bg-[#F5F5F5]/60 flex items-center justify-between">
          <div>
            <label
              htmlFor="guests-control"
              className="block text-[11px] font-medium text-[#707072] uppercase tracking-wider mb-0.5"
            >
              Số lượng khách
            </label>
            <div className="flex items-center gap-1.5 text-xs text-[#111111]">
              <Users className="w-3.5 h-3.5 text-[#707072] shrink-0" aria-hidden="true" />
              <span>
                {guests} khách <span className="text-[#707072]">(tối đa {maxCapacity})</span>
              </span>
            </div>
          </div>

          <div id="guests-control" className="flex items-center gap-2 bg-white px-2.5 py-1 rounded-full border border-[#E5E5E5]">
            <button
              type="button"
              onClick={handleDecrementGuests}
              disabled={guests <= 1}
              aria-label="Giảm số lượng khách"
              className="w-6 h-6 flex items-center justify-center rounded-full text-[#111111] hover:bg-[#F5F5F5] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Minus className="w-3 h-3" aria-hidden="true" />
            </button>

            <span className="w-5 text-center text-xs font-semibold text-[#111111] select-none" aria-live="polite">
              {guests}
            </span>

            <button
              type="button"
              onClick={handleIncrementGuests}
              disabled={guests >= maxCapacity}
              aria-label="Tăng số lượng khách"
              className="w-6 h-6 flex items-center justify-center rounded-full text-[#111111] hover:bg-[#F5F5F5] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="w-3 h-3" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Validation Error Message */}
        {validationError && (
          <p className="text-xs text-rose-600 font-medium" role="alert">
            {validationError}
          </p>
        )}

        {/* Availability UI (Neutral, minimal, no huge green box) */}
        <div className="text-xs leading-relaxed py-1 min-h-[28px] flex items-center">
          {availability.status === "IDLE" && (
            <div className="flex items-center gap-2 text-[#707072] transition-opacity duration-200">
              <Info className="w-3.5 h-3.5 text-[#707072] shrink-0" aria-hidden="true" />
              <span>Chọn giờ nhận và trả phòng (tối thiểu 2 giờ).</span>
            </div>
          )}

          {availability.status === "CHECKING" && (
            <div className="flex items-center gap-2 text-[#707072] transition-opacity duration-200">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-[#111111]" aria-hidden="true" />
              <span>Đang kiểm tra tình trạng phòng...</span>
            </div>
          )}

          {availability.status === "AVAILABLE" && (
            <div className="flex items-center gap-2 text-[#111111] animate-in fade-in slide-in-from-bottom-1 duration-250 ease-out">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#111111] shrink-0" aria-hidden="true" />
              <span className="font-normal">Phòng còn trống trong khung giờ này.</span>
            </div>
          )}

          {availability.status === "UNAVAILABLE" && (
            <div className="flex items-start gap-2 text-rose-600 animate-in fade-in duration-200">
              <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <span className="font-medium block">Phòng không còn trống trong khung giờ này.</span>
                {availability.reason && (
                  <span className="text-[11px] block mt-0.5 text-rose-500">{availability.reason}</span>
                )}
              </div>
            </div>
          )}

          {availability.status === "ERROR" && (
            <div className="flex items-start gap-2 text-[#707072] animate-in fade-in duration-200">
              <AlertTriangle className="w-3.5 h-3.5 text-[#707072] shrink-0 mt-0.5" aria-hidden="true" />
              <span>{availability.message || "Không thể kiểm tra tình trạng phòng lúc này."}</span>
            </div>
          )}
        </div>

        {/* Price Estimation Preview */}
        {hours > 0 && (
          <div className="pt-3 pb-1 text-xs space-y-2 text-[#707072] border-t border-[#E5E5E5] transition-opacity duration-200">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#707072]" />
                <span>
                  {formatVND(hourlyPrice)} × {hours} giờ
                </span>
              </div>
              <span className="font-medium text-[#111111]">{formatVND(estimatedTotal)}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-[#E5E5E5] text-sm font-medium text-[#111111]">
              <span>Tạm tính</span>
              <span>{formatVND(estimatedTotal)}</span>
            </div>
          </div>
        )}

        {/* CTA Button (Black Pill) */}
        <Button
          type="submit"
          disabled={availability.status !== "AVAILABLE" || isHolding}
          isLoading={availability.status === "CHECKING" || isHolding}
          className="w-full h-12 text-sm font-medium justify-center rounded-full transition-all duration-200"
          rightIcon={<ArrowRight className="w-4 h-4" aria-hidden="true" />}
        >
          {isHolding
            ? "Đang giữ phòng..."
            : availability.status === "AVAILABLE"
            ? "Giữ phòng & tiếp tục"
            : availability.status === "CHECKING"
            ? "Đang kiểm tra phòng..."
            : availability.status === "UNAVAILABLE"
            ? "Phòng không khả dụng"
            : "Chọn giờ để đặt phòng"}
        </Button>

        <div className="pt-4 border-t border-[#E5E5E5] flex items-center justify-center gap-2 text-xs text-[#707072]">
          <ShieldCheck className="w-4 h-4 text-[#111111] shrink-0" aria-hidden="true" />
          <span>Tự check-in 24/7 • Đặt phòng theo giờ linh hoạt</span>
        </div>
      </form>
    </div>
  );
}
