"use client";

import * as React from "react";
import {
  Clock,
  RefreshCw,
  AlertCircle,
  Calendar,
  RotateCcw,
  Check,
} from "lucide-react";
import {
  getPublicRoomAvailabilityTimeline,
  type PublicTimelineInterval,
} from "@/lib/data/bookings";

export interface RoomAvailabilityTimelineProps {
  roomId: string;
  selectedCheckIn?: string;
  selectedCheckOut?: string;
  onSelectInterval?: (checkInAt: string, checkOutAt: string) => void;
  onSelectCheckIn?: (checkInAt: string) => void;
  holdConflictMessage?: string | null;
  onClearConflictMessage?: () => void;
}

/**
 * Returns current YYYY-MM-DD in Asia/Ho_Chi_Minh timezone.
 */
function getTodayVietnamDateStr(): string {
  const now = new Date();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Adds N days to YYYY-MM-DD string in Asia/Ho_Chi_Minh.
 */
function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1, d + days));
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(target);
}

/**
 * Formats YYYY-MM-DD to human label: "Hôm nay — 30/09", "Ngày mai — 01/10", or "Thứ X — DD/MM".
 */
function formatDisplayDateLabel(dateStr: string, todayStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const targetDate = new Date(Date.UTC(y, m - 1, d));

  const [ty, tm, td] = todayStr.split("-").map(Number);
  const todayDate = new Date(Date.UTC(ty, tm - 1, td));

  const diffDays = Math.round((targetDate.getTime() - todayDate.getTime()) / 86400000);
  const dayMonth = `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;

  if (diffDays === 0) return `Hôm nay — ${dayMonth}`;
  if (diffDays === 1) return `Ngày mai — ${dayMonth}`;
  if (diffDays === 2) return `Ngày kia — ${dayMonth}`;

  const weekdayFormatter = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "short",
  });
  const weekday = weekdayFormatter.format(targetDate);
  return `${weekday} — ${dayMonth}`;
}

/**
 * Short date pill label: "Hôm nay 30/09", "Ngày mai 01/10", "02/10".
 */
function formatShortChipLabel(dateStr: string, todayStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const targetDate = new Date(Date.UTC(y, m - 1, d));

  const [ty, tm, td] = todayStr.split("-").map(Number);
  const todayDate = new Date(Date.UTC(ty, tm - 1, td));

  const diffDays = Math.round((targetDate.getTime() - todayDate.getTime()) / 86400000);
  const dayMonth = `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;

  if (diffDays === 0) return `Hôm nay ${dayMonth}`;
  if (diffDays === 1) return `Ngày mai ${dayMonth}`;
  return dayMonth;
}

/**
 * Formats YYYY-MM-DDTHH:mm to friendly string "HH:mm, DD/MM/YYYY".
 */
function formatFriendlyDateTime(isoStr: string): string {
  if (!isoStr) return "";
  const [datePart, timePart] = isoStr.split("T");
  if (!datePart) return isoStr;
  const [y, m, d] = datePart.split("-");
  const time = timePart ? timePart.slice(0, 5) : "00:00";
  return `${time} · ${d}/${m}/${y}`;
}

/**
 * Safely maps raw backend / RPC availability error codes to customer-friendly Vietnamese messages.
 * Never exposes raw internal error strings like RANGE_TOO_LARGE directly to users.
 */
export function mapAvailabilityError(errorCode?: string | null): string {
  if (!errorCode) {
    return "Không thể tải lịch trống của phòng lúc này. Vui lòng thử lại.";
  }
  switch (errorCode.trim()) {
    case "RANGE_TOO_LARGE":
      return "Không thể tải lịch phòng cho khoảng ngày này. Vui lòng thử lại.";
    case "ROOM_NOT_FOUND":
      return "Không tìm thấy thông tin phòng. Vui lòng thử lại.";
    case "INVALID_PARAMETERS":
      return "Khoảng thời gian không hợp lệ. Vui lòng thử lại.";
    default:
      if (/^[A-Z0-9_]+$/.test(errorCode) || /error|exception|rpc|postgres|database/i.test(errorCode)) {
        return "Không thể tải lịch trống của phòng lúc này. Vui lòng thử lại.";
      }
      return errorCode;
  }
}

export function RoomAvailabilityTimeline({
  roomId,
  selectedCheckIn,
  selectedCheckOut,
  onSelectInterval,
  onSelectCheckIn,
  holdConflictMessage,
  onClearConflictMessage,
}: RoomAvailabilityTimelineProps) {
  const todayStr = React.useMemo(() => getTodayVietnamDateStr(), []);
  const maxHorizonDateStr = React.useMemo(() => addDaysToDateStr(todayStr, 14), [todayStr]);

  // 4-step state
  const [checkInDate, setCheckInDate] = React.useState<string>(() => {
    if (selectedCheckIn) return selectedCheckIn.slice(0, 10);
    return todayStr;
  });

  const [checkInTime, setCheckInTime] = React.useState<string | null>(() => {
    if (selectedCheckIn && selectedCheckIn.includes("T")) {
      return selectedCheckIn.slice(11, 16);
    }
    return null;
  });

  const [checkOutDate, setCheckOutDate] = React.useState<string>(() => {
    if (selectedCheckOut) return selectedCheckOut.slice(0, 10);
    return todayStr;
  });

  const [checkOutTime, setCheckOutTime] = React.useState<string | null>(() => {
    if (selectedCheckOut && selectedCheckOut.includes("T")) {
      return selectedCheckOut.slice(11, 16);
    }
    return null;
  });

  // Track external prop changes cleanly during render
  const [prevCheckInProp, setPrevCheckInProp] = React.useState(selectedCheckIn);
  const [prevCheckOutProp, setPrevCheckOutProp] = React.useState(selectedCheckOut);

  if (selectedCheckIn !== prevCheckInProp || selectedCheckOut !== prevCheckOutProp) {
    setPrevCheckInProp(selectedCheckIn);
    setPrevCheckOutProp(selectedCheckOut);

    if (selectedCheckIn) {
      setCheckInDate(selectedCheckIn.slice(0, 10));
      setCheckInTime(selectedCheckIn.includes("T") ? selectedCheckIn.slice(11, 16) : null);
    } else {
      setCheckInTime(null);
    }

    if (selectedCheckOut) {
      setCheckOutDate(selectedCheckOut.slice(0, 10));
      setCheckOutTime(selectedCheckOut.includes("T") ? selectedCheckOut.slice(11, 16) : null);
    } else {
      setCheckOutTime(null);
    }
  }

  // Active step in 4-step wizard
  // Step 1: Chọn ngày nhận
  // Step 2: Chọn giờ nhận
  // Step 3: Chọn ngày trả
  // Step 4: Chọn giờ trả
  const activeStep = React.useMemo(() => {
    if (!checkInTime) return 2; // Date is chosen (defaults to today), picking check-in time
    if (!checkOutTime) return 4; // Check-in time chosen, picking check-out
    return 5; // Complete selection
  }, [checkInTime, checkOutTime]);

  // Intervals data fetched from server across full 14-day booking horizon
  const [intervals, setIntervals] = React.useState<PublicTimelineInterval[]>([]);
  const [isLoading, setIsLoading] = React.useState<boolean>(true);
  const [fetchError, setFetchError] = React.useState<string | null>(null);

  // Fetch full 14-day horizon so multi-day collision checks are instantaneous and zero-waterfall
  const fetchTimeline = React.useCallback(async () => {
    if (!roomId) return;
    try {
      const rangeStart = `${todayStr}T00:00:00+07:00`;
      const rangeEnd = `${addDaysToDateStr(todayStr, 15)}T00:00:00+07:00`;

      const res = await getPublicRoomAvailabilityTimeline(roomId, rangeStart, rangeEnd);
      if (res.success) {
        setIntervals(res.intervals || []);
        setFetchError(null);
      } else {
        if (res.error) {
          console.warn("[RoomAvailabilityTimeline] RPC returned error code:", res.error);
        }
        setFetchError(mapAvailabilityError(res.error));
      }
    } catch (err) {
      console.error("[RoomAvailabilityTimeline] Fetch timeline failed:", err);
      setFetchError("Không thể tải lịch trống của phòng lúc này. Vui lòng thử lại.");
    } finally {
      setIsLoading(false);
    }
  }, [roomId, todayStr]);

  // Fetch on mount
  React.useEffect(() => {
    let isMounted = true;
    async function run() {
      await fetchTimeline();
      if (!isMounted) return;
    }
    void run();
    return () => {
      isMounted = false;
    };
  }, [fetchTimeline]);

  // Real-time polling every 4 seconds when page is visible
  React.useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        fetchTimeline();
      }
    };

    timer = setInterval(tick, 4000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchTimeline();
      }
    };

    window.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onVisibilityChange);

    return () => {
      if (timer) clearInterval(timer);
      window.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onVisibilityChange);
    };
  }, [fetchTimeline]);

  // Helper: check raw interval collision for a single hour [slotStartMs, slotEndMs)
  const getRawHourState = React.useCallback(
    (slotStartMs: number, slotEndMs: number): "PAST" | "BOOKED" | "HELD" | "BLOCKED" | "AVAILABLE" => {
      const nowMs = Date.now();
      if (slotEndMs <= nowMs) {
        return "PAST";
      }

      for (const item of intervals) {
        const intStart = new Date(item.start_at).getTime();
        const intEnd = new Date(item.end_at).getTime();
        if (intStart < slotEndMs && intEnd > slotStartMs) {
          if (item.state === "BOOKED") return "BOOKED";
          if (item.state === "HELD") return "HELD";
          if (item.state === "BLOCKED") return "BLOCKED";
        }
      }
      return "AVAILABLE";
    },
    [intervals]
  );

  // Check-In Datetime in ms
  const checkInMs = React.useMemo(() => {
    if (!checkInDate || !checkInTime) return null;
    return new Date(`${checkInDate}T${checkInTime}:00+07:00`).getTime();
  }, [checkInDate, checkInTime]);

  /**
   * Evaluates check-in hour slot (00:00 to 23:00) on checkInDate.
   */
  const evaluateCheckInSlot = React.useCallback(
    (hour: number) => {
      const slotTimeStr = `${String(hour).padStart(2, "0")}:00`;
      const slotStartMs = new Date(`${checkInDate}T${slotTimeStr}:00+07:00`).getTime();
      const slotEndMs = slotStartMs + 3600 * 1000;

      const isSelected = checkInTime === slotTimeStr;
      const raw = getRawHourState(slotStartMs, slotEndMs);

      if (raw !== "AVAILABLE") {
        return {
          state: raw,
          label:
            raw === "BOOKED"
              ? "Đã đặt"
              : raw === "HELD"
              ? "Đang giữ"
              : raw === "BLOCKED"
              ? "Khóa"
              : "Đã qua",
          clickable: false,
          isSelected,
        };
      }

      // Check if room has at least 2 consecutive free hours starting at slotStartMs
      const twoHoursEndMs = slotStartMs + 2 * 3600 * 1000;
      let has2hRoom = true;
      for (const item of intervals) {
        const intStart = new Date(item.start_at).getTime();
        const intEnd = new Date(item.end_at).getTime();
        if (intStart < twoHoursEndMs && intEnd > slotStartMs) {
          has2hRoom = false;
          break;
        }
      }

      if (!has2hRoom) {
        return {
          state: "UNDER_MIN",
          label: "Cần 2h",
          clickable: false,
          isSelected,
        };
      }

      return {
        state: "AVAILABLE",
        label: isSelected ? "Đã chọn" : null,
        clickable: true,
        isSelected,
      };
    },
    [checkInDate, checkInTime, getRawHourState, intervals]
  );

  /**
   * Evaluates check-out hour slot on checkOutDate.
   * Full interval check across entire multi-day span [checkInMs, slotStartMs).
   */
  const evaluateCheckOutSlot = React.useCallback(
    (hour: number) => {
      if (checkInMs === null) {
        return { state: "DISABLED", label: "—", clickable: false, isSelected: false };
      }

      const slotTimeStr = `${String(hour).padStart(2, "0")}:00`;
      const slotStartMs = new Date(`${checkOutDate}T${slotTimeStr}:00+07:00`).getTime();
      const isSelected = checkOutTime === slotTimeStr;

      const durationMinutes = (slotStartMs - checkInMs) / 60000;

      // 1. Must be chronologically after check-in
      if (durationMinutes <= 0) {
        return {
          state: "BEFORE_CHECKIN",
          label: "—",
          clickable: false,
          isSelected: false,
        };
      }

      // 2. Minimum 2 hours
      if (durationMinutes < 120) {
        return {
          state: "UNDER_MIN",
          label: "< 2h",
          clickable: false,
          isSelected: false,
        };
      }

      // 3. Full interval check: Any overlap in [checkInMs, slotStartMs)
      let hasOverlap = false;
      for (const item of intervals) {
        const intStart = new Date(item.start_at).getTime();
        const intEnd = new Date(item.end_at).getTime();
        // Half-open interval overlap
        if (intStart < slotStartMs && intEnd > checkInMs) {
          hasOverlap = true;
          break;
        }
      }

      if (hasOverlap) {
        return {
          state: "CONFLICT",
          label: "Bị trùng",
          clickable: false,
          isSelected: false,
        };
      }

      // Valid multi-day checkout slot!
      const totalHours = Math.ceil(durationMinutes / 60);
      return {
        state: "AVAILABLE",
        label: isSelected ? "Đã chọn" : null,
        durationHours: totalHours,
        clickable: true,
        isSelected,
      };
    },
    [checkInMs, checkOutDate, checkOutTime, intervals]
  );

  // Check-In Date chips (First 4 days from today)
  const checkInDateChips = React.useMemo(() => {
    return Array.from({ length: 4 }, (_, i) => addDaysToDateStr(todayStr, i));
  }, [todayStr]);

  // Check-Out Date chips (4 days starting from checkInDate)
  const checkOutDateChips = React.useMemo(() => {
    const baseDate = checkInDate >= todayStr ? checkInDate : todayStr;
    return Array.from({ length: 4 }, (_, i) => addDaysToDateStr(baseDate, i));
  }, [checkInDate, todayStr]);

  // Handle Check-In Date Selection
  const handleSelectCheckInDate = (dStr: string) => {
    onClearConflictMessage?.();
    setCheckInDate(dStr);
    setCheckInTime(null);
    setCheckOutTime(null);
    // If checkout date is before new check-in date, move it to check-in date
    if (checkOutDate < dStr) {
      setCheckOutDate(dStr);
    }
  };

  // Handle Check-In Time Selection
  const handleSelectCheckInTime = (hStr: string) => {
    onClearConflictMessage?.();
    setCheckInTime(hStr);
    setCheckOutTime(null);

    const fullCheckInIso = `${checkInDate}T${hStr}`;
    onSelectCheckIn?.(fullCheckInIso);

    // If check-in is late in the day (>= 23:00), same-day checkout (min 2h) is impossible,
    // so automatically advance check-out date to next day
    const hourNum = parseInt(hStr.slice(0, 2), 10);
    if (hourNum >= 23 && checkOutDate <= checkInDate) {
      setCheckOutDate(addDaysToDateStr(checkInDate, 1));
    }
  };

  // Handle Check-Out Date Selection
  const handleSelectCheckOutDate = (dStr: string) => {
    onClearConflictMessage?.();
    setCheckOutDate(dStr);
    setCheckOutTime(null);
  };

  // Handle Check-Out Time Selection
  const handleSelectCheckOutTime = (hStr: string) => {
    onClearConflictMessage?.();
    setCheckOutTime(hStr);

    const inIso = `${checkInDate}T${checkInTime}`;
    const outIso = `${checkOutDate}T${hStr}`;
    onSelectInterval?.(inIso, outIso);
  };

  // Reset flow
  const handleResetAll = () => {
    onClearConflictMessage?.();
    setCheckInTime(null);
    setCheckOutTime(null);
  };

  return (
    <div className="border border-[#E5E5E5] bg-white p-4 sm:p-5 mb-5 rounded-2xl shadow-xs">
      {/* Header */}
      <div className="pb-3 border-b border-[#E5E5E5]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#111111]">
              Lịch trống của phòng
            </h3>
            <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              <Clock className="w-2.5 h-2.5" />
              Thời gian thực
            </span>
          </div>

          <span className="text-[10px] font-semibold text-[#707072] bg-[#F5F5F5] px-2 py-0.5 rounded">
            Tối thiểu 2 giờ
          </span>
        </div>

        {/* Selected Summary Card Preview or Reset */}
        {checkInTime && (
          <div className="mt-3 p-3 bg-[#F9FAFB] border border-[#E5E5E5] rounded-xl text-xs flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-[11px] text-[#707072]">Nhận phòng:</span>
                <strong className="text-[#111111] font-semibold">
                  {formatFriendlyDateTime(`${checkInDate}T${checkInTime}`)}
                </strong>
              </div>
              {checkOutTime && (
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-neutral-900 shrink-0" />
                  <span className="text-[11px] text-[#707072]">Trả phòng:</span>
                  <strong className="text-[#111111] font-semibold">
                    {formatFriendlyDateTime(`${checkOutDate}T${checkOutTime}`)}
                  </strong>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleResetAll}
              className="text-[11px] font-medium text-[#707072] hover:text-[#111111] flex items-center gap-1 underline underline-offset-2 transition-colors ml-2 shrink-0"
            >
              <RotateCcw className="w-3 h-3" />
              Chọn lại
            </button>
          </div>
        )}
      </div>

      {/* Conflict Alert */}
      {holdConflictMessage && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl flex items-start gap-2 animate-fadeIn">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
          <div className="flex-1">
            <p className="font-semibold">{holdConflictMessage}</p>
            <p className="text-[11px] text-red-600 mt-0.5">
              Lịch trống đã được tự động làm mới theo thời gian thực.
            </p>
          </div>
        </div>
      )}

      {/* Main 4-Step Booking Container */}
      <div className="mt-4 space-y-5">
        {/* ============================================================== */}
        {/* STEP 1: NGÀY NHẬN                                             */}
        {/* ============================================================== */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#111111] flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-[#111111] text-white text-[10px] flex items-center justify-center font-bold">
                1
              </span>
              Ngày nhận
            </span>
            <span className="text-[11px] text-[#707072]">
              {formatDisplayDateLabel(checkInDate, todayStr)}
            </span>
          </div>

          {/* Quick Date Chips + Custom Date Picker */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {checkInDateChips.map((dStr) => {
              const isSelected = checkInDate === dStr;
              return (
                <button
                  key={dStr}
                  type="button"
                  onClick={() => handleSelectCheckInDate(dStr)}
                  className={`py-2 px-2 text-xs font-semibold rounded-lg border transition-all text-center ${
                    isSelected
                      ? "bg-[#111111] text-white border-[#111111] shadow-xs"
                      : "bg-white text-[#111111] border-[#E5E5E5] hover:border-black hover:bg-neutral-50"
                  }`}
                >
                  {formatShortChipLabel(dStr, todayStr)}
                </button>
              );
            })}
          </div>

          {/* Calendar Picker label */}
          <div className="mt-1.5 flex items-center justify-end">
            <label className="cursor-pointer text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              <span>Chọn ngày khác</span>
              <input
                type="date"
                min={todayStr}
                max={maxHorizonDateStr}
                value={checkInDate}
                onChange={(e) => {
                  if (e.target.value) {
                    handleSelectCheckInDate(e.target.value);
                  }
                }}
                className="sr-only"
              />
            </label>
          </div>
        </div>

        {/* ============================================================== */}
        {/* STEP 2: GIỜ NHẬN                                             */}
        {/* ============================================================== */}
        {activeStep >= 2 && (
          <div className="pt-3 border-t border-[#E5E5E5] animate-fadeIn">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#111111] flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-[#111111] text-white text-[10px] flex items-center justify-center font-bold">
                  2
                </span>
                Giờ nhận
              </span>
              <span className="text-[11px] text-[#707072]">
                {checkInTime ? `Đã chọn: ${checkInTime}` : "Chọn khung giờ bắt đầu"}
              </span>
            </div>

            {isLoading && intervals.length === 0 ? (
              <div className="py-8 flex flex-col items-center justify-center text-xs text-[#707072]">
                <RefreshCw className="w-4 h-4 animate-spin mb-2 text-[#111111]" />
                <span>Đang tải tình trạng phòng...</span>
              </div>
            ) : fetchError ? (
              <div className="py-4 text-center text-xs text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-200">
                {mapAvailabilityError(fetchError)}
              </div>
            ) : (
              /* Maximum 4 columns on desktop sidebar & mobile (Section 6 & 27) */
              <div className="grid grid-cols-4 gap-2 select-none">
                {Array.from({ length: 24 }, (_, i) => {
                  const hourStr = `${String(i).padStart(2, "0")}:00`;
                  const { state, label, clickable, isSelected } = evaluateCheckInSlot(i);

                  let btnStyle = "bg-white border-[#E5E5E5] text-[#111111] hover:border-black";

                  if (isSelected) {
                    btnStyle = "bg-[#111111] border-[#111111] text-white font-bold shadow-xs";
                  } else if (!clickable) {
                    if (state === "BOOKED") {
                      btnStyle = "bg-neutral-100 border-neutral-200 text-neutral-400 cursor-not-allowed";
                    } else if (state === "HELD") {
                      btnStyle = "bg-amber-50 border-amber-200 text-amber-800 cursor-not-allowed";
                    } else if (state === "BLOCKED") {
                      btnStyle = "bg-rose-50 border-rose-200 text-rose-700 cursor-not-allowed";
                    } else {
                      btnStyle = "bg-neutral-50/70 border-neutral-100 text-neutral-300 cursor-not-allowed";
                    }
                  }

                  return (
                    <button
                      key={hourStr}
                      type="button"
                      onClick={() => clickable && handleSelectCheckInTime(hourStr)}
                      disabled={!clickable}
                      className={`h-12 min-w-[72px] rounded-lg border flex flex-col items-center justify-center transition-all p-1 text-center ${btnStyle}`}
                    >
                      <span className="text-sm font-semibold tracking-tight font-mono">
                        {hourStr}
                      </span>
                      {label && (
                        <span className="text-[10px] leading-tight font-medium mt-0.5">
                          {label}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* STEP 3: NGÀY TRẢ                                             */}
        {/* ============================================================== */}
        {checkInTime && (
          <div className="pt-3 border-t border-[#E5E5E5] animate-fadeIn">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#111111] flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-[#111111] text-white text-[10px] flex items-center justify-center font-bold">
                  3
                </span>
                Ngày trả
              </span>
              <span className="text-[11px] text-[#707072]">
                {formatDisplayDateLabel(checkOutDate, todayStr)}
              </span>
            </div>

            {/* Quick Date Chips for Check-Out */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {checkOutDateChips.map((dStr) => {
                const isSelected = checkOutDate === dStr;
                return (
                  <button
                    key={dStr}
                    type="button"
                    onClick={() => handleSelectCheckOutDate(dStr)}
                    className={`py-2 px-2 text-xs font-semibold rounded-lg border transition-all text-center ${
                      isSelected
                        ? "bg-[#111111] text-white border-[#111111] shadow-xs"
                        : "bg-white text-[#111111] border-[#E5E5E5] hover:border-black hover:bg-neutral-50"
                    }`}
                  >
                    {formatShortChipLabel(dStr, todayStr)}
                  </button>
                );
              })}
            </div>

            {/* Calendar Picker for Check-out */}
            <div className="mt-1.5 flex items-center justify-end">
              <label className="cursor-pointer text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                <span>Chọn ngày trả khác</span>
                <input
                  type="date"
                  min={checkInDate}
                  max={maxHorizonDateStr}
                  value={checkOutDate}
                  onChange={(e) => {
                    if (e.target.value) {
                      handleSelectCheckOutDate(e.target.value);
                    }
                  }}
                  className="sr-only"
                />
              </label>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* STEP 4: GIỜ TRẢ                                             */}
        {/* ============================================================== */}
        {checkInTime && checkOutDate && (
          <div className="pt-3 border-t border-[#E5E5E5] animate-fadeIn">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#111111] flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-[#111111] text-white text-[10px] flex items-center justify-center font-bold">
                  4
                </span>
                Giờ trả
              </span>
              <span className="text-[11px] text-[#707072]">
                {checkOutTime ? `Đã chọn: ${checkOutTime}` : "Chọn khung giờ kết thúc"}
              </span>
            </div>

            {/* Maximum 4 columns on desktop sidebar & mobile (Section 6 & 27) */}
            <div className="grid grid-cols-4 gap-2 select-none">
              {Array.from({ length: 24 }, (_, i) => {
                const hourStr = `${String(i).padStart(2, "0")}:00`;
                const { state, label, clickable, isSelected } = evaluateCheckOutSlot(i);

                let btnStyle = "bg-white border-[#E5E5E5] text-[#111111] hover:border-black";

                if (isSelected) {
                  btnStyle = "bg-[#111111] border-[#111111] text-white font-bold shadow-xs";
                } else if (!clickable) {
                  if (state === "CONFLICT") {
                    btnStyle = "bg-neutral-100 border-neutral-200 text-neutral-400 cursor-not-allowed";
                  } else {
                    btnStyle = "bg-neutral-50/70 border-neutral-100 text-neutral-300 cursor-not-allowed";
                  }
                }

                return (
                  <button
                    key={hourStr}
                    type="button"
                    onClick={() => clickable && handleSelectCheckOutTime(hourStr)}
                    disabled={!clickable}
                    className={`h-12 min-w-[72px] rounded-lg border flex flex-col items-center justify-center transition-all p-1 text-center ${btnStyle}`}
                  >
                    <span className="text-sm font-semibold tracking-tight font-mono">
                      {hourStr}
                    </span>
                    {label && (
                      <span className="text-[10px] leading-tight font-medium mt-0.5">
                        {label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Same-day Midnight (24:00) Option */}
            {checkInDate === checkOutDate && (
              <div className="mt-3 pt-2.5 border-t border-[#E5E5E5] flex items-center justify-between">
                <span className="text-xs text-[#707072]">Trả phòng hết ngày?</span>
                <button
                  type="button"
                  onClick={() => {
                    const nextDateStr = addDaysToDateStr(checkInDate, 1);
                    setCheckOutDate(nextDateStr);
                    handleSelectCheckOutTime("00:00");
                  }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#E5E5E5] bg-white text-[#111111] hover:border-black hover:bg-neutral-50 transition-colors"
                >
                  24:00 (00:00 ngày mai)
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Selection Complete confirmation badge */}
      {activeStep === 5 && (
        <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Đã hoàn tất chọn khung giờ. Xem chi tiết tạm tính bên dưới.</span>
        </div>
      )}

      {/* Compact Clean Legend */}
      <div className="mt-4 pt-3 border-t border-[#E5E5E5] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#707072]">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-white border border-[#111111] inline-block" />
          <span>Trống</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-neutral-300 inline-block" />
          <span>Đã đặt</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
          <span>Đang giữ</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-400 inline-block" />
          <span>Khóa</span>
        </div>
      </div>
    </div>
  );
}
