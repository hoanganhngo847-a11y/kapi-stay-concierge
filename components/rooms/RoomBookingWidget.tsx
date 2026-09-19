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
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatVND } from "@/lib/utils/format";
import type { PublicRoom } from "@/lib/data/rooms";
import { checkRoomAvailability } from "@/lib/api";

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
}

/**
 * Returns today's date in local YYYY-MM-DD format.
 */
function getLocalTodayStr(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Timezone-safe helper returning the calendar date immediately following the given date.
 */
function getNextDayStr(dateStr: string): string {
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return "";
  const [year, month, day] = parts;
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, "0");
  const d = String(next.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Computes calendar nights between two YYYY-MM-DD dates strictly via UTC days.
 */
function calcCalendarNights(inDate: string, outDate: string): number {
  if (!inDate || !outDate) return 0;
  const partsIn = inDate.split("-").map(Number);
  const partsOut = outDate.split("-").map(Number);
  if (partsIn.length !== 3 || partsOut.length !== 3) return 0;

  const [y1, m1, d1] = partsIn;
  const [y2, m2, d2] = partsOut;
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return 0;

  const utc1 = Date.UTC(y1, m1 - 1, d1);
  const utc2 = Date.UTC(y2, m2 - 1, d2);
  const diffDays = Math.round((utc2 - utc1) / 86_400_000);
  return diffDays > 0 ? diffDays : 0;
}

export function RoomBookingWidget({ room }: RoomBookingWidgetProps) {
  const router = useRouter();
  const todayStr = React.useMemo(() => getLocalTodayStr(), []);
  const maxCapacity = Math.max(1, Number(room.capacity) || 1);

  // Form State
  const [checkIn, setCheckIn] = React.useState("");
  const [checkOut, setCheckOut] = React.useState("");
  const [guests, setGuests] = React.useState(1);
  const [validationError, setValidationError] = React.useState<string | null>(null);

  // Availability State Machine (Initialized to IDLE)
  const [availability, setAvailability] = React.useState<AvailabilityState>({
    status: "IDLE",
  });

  // Request counter ref for stale response / race condition protection
  const requestIdRef = React.useRef(0);

  // Calculate calendar nights and pricing
  const nights = React.useMemo(() => {
    return calcCalendarNights(checkIn, checkOut);
  }, [checkIn, checkOut]);

  const estimatedTotal = nights * room.nightly_price_vnd;

  // Minimum selectable check-out date
  const minCheckOutStr = React.useMemo(() => {
    return checkIn ? getNextDayStr(checkIn) : getNextDayStr(todayStr);
  }, [checkIn, todayStr]);

  // Handle Check-in change
  const handleCheckInChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setCheckIn(newVal);
    setValidationError(null);

    // Invalidate in-flight requests and immediately reset availability to IDLE
    requestIdRef.current += 1;
    setAvailability({ status: "IDLE" });

    // If existing checkOut is before or on the new checkIn, reset checkOut
    if (checkOut && newVal >= checkOut) {
      setCheckOut("");
    }
  };

  // Handle Check-out change
  const handleCheckOutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setCheckOut(newVal);
    setValidationError(null);

    // Invalidate in-flight requests and immediately reset availability to IDLE
    requestIdRef.current += 1;
    setAvailability({ status: "IDLE" });
  };

  // Real Availability check triggered when valid date range is selected
  React.useEffect(() => {
    // Only proceed when both dates are present and form a strictly valid range
    const hasBothDates = Boolean(checkIn && checkOut);
    const isChronologicallyValid = checkIn >= todayStr && checkOut > checkIn;

    if (!hasBothDates || !isChronologicallyValid) {
      requestIdRef.current += 1;
      setAvailability((prev) => (prev.status === "IDLE" ? prev : { status: "IDLE" }));
      return;
    }

    // Increment request ID to invalidate any prior in-flight request
    const currentRequestId = ++requestIdRef.current;
    setAvailability({ status: "CHECKING" });

    let isMounted = true;

    async function verifyAvailability() {
      try {
        const isAvailable = await checkRoomAvailability(
          room.id,
          checkIn,
          checkOut
        );

        // Guard: drop stale response if user changed dates or component unmounted
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
            reason: "Phòng đã có khách đặt trong khoảng thời gian này.",
          });
        }
      } catch (err) {
        // Guard: drop stale response if user changed dates or component unmounted
        if (!isMounted || currentRequestId !== requestIdRef.current) {
          return;
        }

        console.error("[RoomBookingWidget] checkRoomAvailability error:", err);
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
  }, [room.id, checkIn, checkOut, todayStr]);

  // Guest increment/decrement handlers bounded by [1, maxCapacity]
  const handleDecrementGuests = () => {
    setGuests((prev) => (prev > 1 ? prev - 1 : 1));
  };

  const handleIncrementGuests = () => {
    setGuests((prev) => (prev < maxCapacity ? prev + 1 : maxCapacity));
  };

  // Form submit handler (strictly guards against unconfirmed availability and navigates to checkout)
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!checkIn || !checkOut) {
      setValidationError("Vui lòng chọn đầy đủ ngày nhận và trả phòng.");
      return;
    }

    if (checkIn < todayStr) {
      setValidationError("Ngày nhận phòng không được ở trong quá khứ.");
      return;
    }

    if (checkOut <= checkIn) {
      setValidationError("Ngày trả phòng phải sau ngày nhận phòng ít nhất 1 đêm.");
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

    // Checkout handoff: use the confirmed date snapshot from availability state
    const params = new URLSearchParams({
      roomId: room.id,
      checkIn: availability.checkIn,
      checkOut: availability.checkOut,
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
            {formatVND(room.nightly_price_vnd)}
          </span>
          <span className="text-sm text-dark/60"> / đêm</span>
        </div>
        <span className="text-xs text-dark/50 font-medium">Tối đa {room.capacity} khách</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
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
              <input
                id="checkin-date"
                type="date"
                min={todayStr}
                value={checkIn}
                onChange={handleCheckInChange}
                className="w-full bg-transparent text-sm font-medium text-dark focus:outline-none cursor-pointer"
              />
            </div>

            {/* Check-out */}
            <div className="p-3 bg-light/30">
              <label
                htmlFor="checkout-date"
                className="block text-[11px] font-semibold text-dark/60 uppercase tracking-wider mb-1"
              >
                Trả phòng
              </label>
              <input
                id="checkout-date"
                type="date"
                min={minCheckOutStr}
                value={checkOut}
                onChange={handleCheckOutChange}
                className="w-full bg-transparent text-sm font-medium text-dark focus:outline-none cursor-pointer"
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
              <span>Chọn ngày nhận và trả phòng để kiểm tra tình trạng phòng.</span>
            </div>
          )}

          {availability.status === "CHECKING" && (
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 flex items-center gap-2.5">
              <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" aria-hidden="true" />
              <span>Đang kiểm tra phòng trống...</span>
            </div>
          )}

          {availability.status === "AVAILABLE" && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
              <span className="font-medium">Phòng còn trống trong khoảng thời gian bạn chọn.</span>
            </div>
          )}

          {availability.status === "UNAVAILABLE" && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <span className="font-medium block">Phòng không còn trống trong khoảng thời gian này.</span>
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
        {nights > 0 && (
          <div className="pt-2 pb-1 text-xs space-y-2 text-dark/70 border-t border-dark/10">
            <div className="flex justify-between items-center">
              <span>
                {formatVND(room.nightly_price_vnd)} × {nights} đêm
              </span>
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
            : "Chọn ngày để đặt phòng"}
        </Button>

        <div className="pt-4 border-t border-dark/10 flex items-center justify-center gap-2 text-xs text-dark/50">
          <ShieldCheck className="w-4 h-4 text-secondary shrink-0" aria-hidden="true" />
          <span>Tự check-in 24/7 • Không cần đặt cọc</span>
        </div>
      </form>
    </div>
  );
}
