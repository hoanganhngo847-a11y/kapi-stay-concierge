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
    <div className="bg-white rounded-2xl border border-dark/10 shadow-sm p-6 lg:p-7 sticky top-24">
      {/* Price header */}
      <div className="flex items-baseline justify-between pb-5 border-b border-dark/10 mb-6">
        <div>
          <span className="text-2xl sm:text-3xl font-bold text-primary">
            {formatVND(hourlyPrice)}
          </span>
          <span className="text-sm text-dark/60"> / giờ</span>
        </div>
        <span className="text-xs text-dark/50 font-medium">Tối đa {room.capacity} khách</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* DateTime Selection Box */}
        <div className="rounded-xl border border-dark/15 overflow-hidden">
          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-dark/15">
            {/* Check-in */}
            <div className="p-3 bg-light/30">
              <label
                htmlFor="checkin-datetime"
                className="block text-[11px] font-semibold text-dark/60 uppercase tracking-wider mb-1"
              >
                Nhận phòng
              </label>
              <input
                id="checkin-datetime"
                type="datetime-local"
                min={minNowStr}
                value={checkIn}
                onChange={handleCheckInChange}
                className="w-full bg-transparent text-sm font-medium text-dark focus:outline-none cursor-pointer"
              />
            </div>

            {/* Check-out */}
            <div className="p-3 bg-light/30">
              <label
                htmlFor="checkout-datetime"
                className="block text-[11px] font-semibold text-dark/60 uppercase tracking-wider mb-1"
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
                className="w-full bg-transparent text-sm font-medium text-dark focus:outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        {/* Guest Selection Stepper */}
        <div className="p-3 rounded-xl border border-dark/15 bg-light/30 flex items-center justify-between">
          <div>
            <label
              htmlFor="guests-control"
              className="block text-[11px] font-semibold text-dark/60 uppercase tracking-wider mb-0.5"
            >
              Số lượng khách
            </label>
            <div className="flex items-center gap-1.5 text-xs text-dark/70 font-medium">
              <Users className="w-3.5 h-3.5 text-primary shrink-0" aria-hidden="true" />
              <span>
                {guests} khách <span className="text-dark/40 font-normal">(tối đa {maxCapacity})</span>
              </span>
            </div>
          </div>

          <div id="guests-control" className="flex items-center gap-2 bg-white px-2 py-1 rounded-lg border border-dark/10 shadow-2xs">
            <button
              type="button"
              onClick={handleDecrementGuests}
              disabled={guests <= 1}
              aria-label="Giảm số lượng khách"
              className="w-7 h-7 flex items-center justify-center rounded-md text-dark/70 hover:bg-light disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Minus className="w-3.5 h-3.5" aria-hidden="true" />
            </button>

            <span className="w-5 text-center text-sm font-bold text-dark select-none" aria-live="polite">
              {guests}
            </span>

            <button
              type="button"
              onClick={handleIncrementGuests}
              disabled={guests >= maxCapacity}
              aria-label="Tăng số lượng khách"
              className="w-7 h-7 flex items-center justify-center rounded-md text-dark/70 hover:bg-light disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Validation Error Message */}
        {validationError && (
          <p className="text-xs text-rose-600 font-medium" role="alert">
            {validationError}
          </p>
        )}

        {/* Availability UI (5 States) */}
        <div className="text-xs leading-relaxed">
          {availability.status === "IDLE" && (
            <div className="p-3 rounded-xl bg-light/50 border border-dark/10 text-dark/70 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />
              <span>Chọn thời gian nhận và trả phòng (tối thiểu 2 giờ) để kiểm tra phòng trống.</span>
            </div>
          )}

          {availability.status === "CHECKING" && (
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 flex items-center gap-2.5">
              <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" aria-hidden="true" />
              <span>Đang kiểm tra tình trạng phòng...</span>
            </div>
          )}

          {availability.status === "AVAILABLE" && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
              <span className="font-medium">Phòng còn trống trong khung giờ bạn chọn.</span>
            </div>
          )}

          {availability.status === "UNAVAILABLE" && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <span className="font-medium block">Phòng không còn trống trong khung giờ này.</span>
                {availability.reason && (
                  <span className="text-rose-700 text-[11px] block mt-0.5">{availability.reason}</span>
                )}
              </div>
            </div>
          )}

          {availability.status === "ERROR" && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{availability.message || "Không thể kiểm tra tình trạng phòng lúc này."}</span>
            </div>
          )}
        </div>

        {/* Price Estimation Preview */}
        {hours > 0 && (
          <div className="pt-2 pb-1 text-xs space-y-2 text-dark/70 border-t border-dark/10">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-primary" />
                <span>
                  {formatVND(hourlyPrice)} × {hours} giờ
                </span>
              </div>
              <span className="font-semibold text-dark">{formatVND(estimatedTotal)}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-dark/5 text-sm font-bold text-dark">
              <span>Tạm tính</span>
              <span className="text-primary">{formatVND(estimatedTotal)}</span>
            </div>
          </div>
        )}

        {/* CTA Button (Strictly disabled unless AVAILABLE) */}
        <Button
          type="submit"
          disabled={availability.status !== "AVAILABLE"}
          isLoading={availability.status === "CHECKING"}
          className="w-full h-12 text-base font-semibold shadow-sm justify-center"
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

        <div className="pt-4 border-t border-dark/10 flex items-center justify-center gap-2 text-xs text-dark/50">
          <ShieldCheck className="w-4 h-4 text-secondary shrink-0" aria-hidden="true" />
          <span>Tự check-in 24/7 • Đặt phòng theo giờ linh hoạt</span>
        </div>
      </form>
    </div>
  );
}
