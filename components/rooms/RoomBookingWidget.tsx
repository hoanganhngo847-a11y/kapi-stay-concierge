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

  // Handle Check-in change
  const handleCheckInChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setCheckIn(newVal);
    setValidationError(null);

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

  // Form submit handler
  const handleSubmit = (e: React.FormEvent) => {
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

    if (durationHours > 24) {
      setValidationError("Thời lượng đặt phòng tối đa là 24 giờ cho mỗi lượt.");
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

    const params = new URLSearchParams({
      roomId: room.id,
      checkIn,
      checkOut,
      checkInAt: checkIn,
      checkOutAt: checkOut,
      guests: String(guests),
    });

    router.push(`/checkout?${params.toString()}`);
  };

  return (
    <div className="bg-white border border-[#E5E5E5] p-6 lg:p-7 sticky top-24">
      {/* Price header */}
      <div className="flex items-baseline justify-between pb-5 border-b border-[#E5E5E5] mb-6">
        <div>
          <span className="text-3xl font-medium text-[#111111]">
            {formatVND(hourlyPrice)}
          </span>
          <span className="text-sm text-[#707072]"> / giờ</span>
        </div>
        <span className="text-xs text-[#707072]">Tối đa {room.capacity} khách</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* DateTime Selection Box */}
        <div className="border border-[#E5E5E5] overflow-hidden">
          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[#E5E5E5]">
            {/* Check-in */}
            <div className="p-3 bg-[#F5F5F5]/60">
              <label
                htmlFor="checkin-datetime"
                className="block text-[11px] font-medium text-[#707072] uppercase tracking-wider mb-1"
              >
                Nhận phòng
              </label>
              <input
                id="checkin-datetime"
                type="datetime-local"
                min={minNowStr}
                value={checkIn}
                onChange={handleCheckInChange}
                className="w-full bg-transparent text-sm font-medium text-[#111111] focus:outline-none cursor-pointer"
              />
            </div>

            {/* Check-out */}
            <div className="p-3 bg-[#F5F5F5]/60">
              <label
                htmlFor="checkout-datetime"
                className="block text-[11px] font-medium text-[#707072] uppercase tracking-wider mb-1"
              >
                Trả phòng (Tối thiểu 2h)
              </label>
              <input
                id="checkout-datetime"
                type="datetime-local"
                disabled={!checkIn}
                min={minCheckOutStr}
                value={checkOut}
                onChange={handleCheckOutChange}
                className="w-full bg-transparent text-sm font-medium text-[#111111] focus:outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              />
            </div>
          </div>
        </div>

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
        <div className="text-xs leading-relaxed py-1">
          {availability.status === "IDLE" && (
            <div className="flex items-center gap-2 text-[#707072]">
              <Info className="w-3.5 h-3.5 text-[#707072] shrink-0" aria-hidden="true" />
              <span>Chọn giờ nhận và trả phòng (tối thiểu 2 giờ).</span>
            </div>
          )}

          {availability.status === "CHECKING" && (
            <div className="flex items-center gap-2 text-[#707072]">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-[#111111]" aria-hidden="true" />
              <span>Đang kiểm tra tình trạng phòng...</span>
            </div>
          )}

          {availability.status === "AVAILABLE" && (
            <div className="flex items-center gap-2 text-[#111111]">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#111111] shrink-0" aria-hidden="true" />
              <span className="font-normal">Phòng còn trống trong khung giờ này.</span>
            </div>
          )}

          {availability.status === "UNAVAILABLE" && (
            <div className="flex items-start gap-2 text-rose-600">
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
            <div className="flex items-start gap-2 text-[#707072]">
              <AlertTriangle className="w-3.5 h-3.5 text-[#707072] shrink-0 mt-0.5" aria-hidden="true" />
              <span>{availability.message || "Không thể kiểm tra tình trạng phòng lúc này."}</span>
            </div>
          )}
        </div>

        {/* Price Estimation Preview */}
        {hours > 0 && (
          <div className="pt-3 pb-1 text-xs space-y-2 text-[#707072] border-t border-[#E5E5E5]">
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
          disabled={availability.status !== "AVAILABLE"}
          isLoading={availability.status === "CHECKING"}
          className="w-full h-12 text-sm font-medium justify-center rounded-full"
          rightIcon={<ArrowRight className="w-4 h-4" aria-hidden="true" />}
        >
          {availability.status === "AVAILABLE"
            ? "Tiếp tục đặt phòng"
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
