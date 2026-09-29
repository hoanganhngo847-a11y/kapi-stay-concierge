"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  RefreshCw,
  Info,
  AlertCircle,
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
  holdConflictMessage?: string | null;
  onClearConflictMessage?: () => void;
}

export type SlotState = "PAST" | "AVAILABLE" | "BOOKED" | "HELD" | "BLOCKED" | "SELECTED";

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
 * Returns current hour (0..23) in Asia/Ho_Chi_Minh.
 */
function getCurrentVietnamHour(): number {
  const now = new Date();
  const hourStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    hour12: false,
  }).format(now);
  return parseInt(hourStr, 10);
}

/**
 * Formats a Date object to YYYY-MM-DD string in Asia/Ho_Chi_Minh.
 */
function formatDateToVietnamString(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Formats YYYY-MM-DD to human-readable label: "Hôm nay — 29/09", "Ngày mai — 30/09", or "Thứ 4 — 01/10".
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

  const weekdayFormatter = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "short",
  });
  const weekday = weekdayFormatter.format(targetDate);
  return `${weekday} — ${dayMonth}`;
}

export function RoomAvailabilityTimeline({
  roomId,
  selectedCheckIn,
  selectedCheckOut,
  onSelectInterval,
  holdConflictMessage,
  onClearConflictMessage,
}: RoomAvailabilityTimelineProps) {
  const todayStr = React.useMemo(() => getTodayVietnamDateStr(), []);
  const [activeDateStr, setActiveDateStr] = React.useState<string>(
    selectedCheckIn ? selectedCheckIn.slice(0, 10) : todayStr
  );

  const [intervals, setIntervals] = React.useState<PublicTimelineInterval[]>([]);
  const [isLoading, setIsLoading] = React.useState<boolean>(true);
  const [fetchError, setFetchError] = React.useState<string | null>(null);

  // Transient selection states for clicking slots: first click sets startHour, second sets endHour
  const [startHourPick, setStartHourPick] = React.useState<number | null>(null);

  // Max 14 days ahead from today
  const maxDateStr = React.useMemo(() => {
    const [y, m, d] = todayStr.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d + 13));
    return formatDateToVietnamString(date);
  }, [todayStr]);

  // Fetch timeline intervals for active date: [activeDateT00:00:00+07:00, nextDateT00:00:00+07:00)
  const fetchTimeline = React.useCallback(async () => {
    if (!roomId) return;
    try {
      const rangeStart = `${activeDateStr}T00:00:00+07:00`;
      const [y, m, d] = activeDateStr.split("-").map(Number);
      const nextDay = new Date(Date.UTC(y, m - 1, d + 1));
      const nextDayStr = formatDateToVietnamString(nextDay);
      const rangeEnd = `${nextDayStr}T00:00:00+07:00`;

      const res = await getPublicRoomAvailabilityTimeline(roomId, rangeStart, rangeEnd);
      if (res.success) {
        setIntervals(res.intervals || []);
        setFetchError(null);
      } else {
        setFetchError(res.error || "Không thể tải lịch phòng.");
      }
    } catch {
      setFetchError("Lỗi kết nối khi tải lịch phòng.");
    } finally {
      setIsLoading(false);
    }
  }, [roomId, activeDateStr]);

  // Initial and on activeDateStr change fetch
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

  // Date navigation handlers
  const canGoPrev = activeDateStr > todayStr;
  const canGoNext = activeDateStr < maxDateStr;

  const handlePrevDay = () => {
    if (!canGoPrev) return;
    setIsLoading(true);
    const [y, m, d] = activeDateStr.split("-").map(Number);
    const prev = new Date(Date.UTC(y, m - 1, d - 1));
    setActiveDateStr(formatDateToVietnamString(prev));
    setStartHourPick(null);
    onClearConflictMessage?.();
  };

  const handleNextDay = () => {
    if (!canGoNext) return;
    setIsLoading(true);
    const [y, m, d] = activeDateStr.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    setActiveDateStr(formatDateToVietnamString(next));
    setStartHourPick(null);
    onClearConflictMessage?.();
  };

  // Determine state of an hour slot [h:00, (h+1):00) on activeDateStr
  const currentVNHour = getCurrentVietnamHour();
  const isToday = activeDateStr === todayStr;

  const getSlotStatus = React.useCallback(
    (hour: number): { state: SlotState; label: string } => {
      // 1. If today and hour is past
      if (isToday && hour < currentVNHour) {
        return { state: "PAST", label: "Đã qua" };
      }

      const slotStart = new Date(`${activeDateStr}T${String(hour).padStart(2, "0")}:00:00+07:00`).getTime();
      const slotEnd = new Date(`${activeDateStr}T${String(hour + 1).padStart(2, "0")}:00:00+07:00`).getTime();

      // Check current user selection
      if (selectedCheckIn && selectedCheckOut) {
        const selStart = new Date(
          selectedCheckIn.includes("T") ? (selectedCheckIn.includes("+") || selectedCheckIn.includes("Z") ? selectedCheckIn : `${selectedCheckIn}:00+07:00`) : `${selectedCheckIn}T14:00:00+07:00`
        ).getTime();
        const selEnd = new Date(
          selectedCheckOut.includes("T") ? (selectedCheckOut.includes("+") || selectedCheckOut.includes("Z") ? selectedCheckOut : `${selectedCheckOut}:00+07:00`) : `${selectedCheckOut}T18:00:00+07:00`
        ).getTime();

        if (slotStart >= selStart && slotEnd <= selEnd) {
          return { state: "SELECTED", label: "Đang chọn" };
        }
      }

      // Check server intervals (half-open overlap: intStart < slotEnd AND intEnd > slotStart)
      for (const item of intervals) {
        const intStart = new Date(item.start_at).getTime();
        const intEnd = new Date(item.end_at).getTime();

        if (intStart < slotEnd && intEnd > slotStart) {
          if (item.state === "BOOKED") {
            return { state: "BOOKED", label: "Đã đặt" };
          }
          if (item.state === "HELD") {
            return { state: "HELD", label: "Đang có người giữ" };
          }
          if (item.state === "BLOCKED") {
            return { state: "BLOCKED", label: "Không khả dụng" };
          }
        }
      }

      return { state: "AVAILABLE", label: "Trống" };
    },
    [activeDateStr, currentVNHour, intervals, isToday, selectedCheckIn, selectedCheckOut]
  );

  // Click handler on slot
  const handleSlotClick = (hour: number) => {
    const { state } = getSlotStatus(hour);
    if (state === "PAST" || state === "BOOKED" || state === "HELD" || state === "BLOCKED") {
      return;
    }

    onClearConflictMessage?.();

    // If no start pick yet, this becomes the start hour
    if (startHourPick === null) {
      setStartHourPick(hour);
      // Automatically propose minimum 2h default if valid
      const targetEndHour = hour + 2;
      let isRangeFree = true;
      for (let h = hour; h < targetEndHour; h++) {
        const s = getSlotStatus(h);
        if (s.state !== "AVAILABLE" && s.state !== "SELECTED") {
          isRangeFree = false;
          break;
        }
      }

      if (isRangeFree && targetEndHour <= 24) {
        const inStr = `${activeDateStr}T${String(hour).padStart(2, "0")}:00`;
        const outStr =
          targetEndHour === 24
            ? (() => {
                const [y, m, d] = activeDateStr.split("-").map(Number);
                const next = new Date(Date.UTC(y, m - 1, d + 1));
                return `${formatDateToVietnamString(next)}T00:00`;
              })()
            : `${activeDateStr}T${String(targetEndHour).padStart(2, "0")}:00`;

        onSelectInterval?.(inStr, outStr);
      }
      return;
    }

    // If user clicked a slot equal to or before current start pick -> reset start pick to new hour
    if (hour <= startHourPick) {
      setStartHourPick(hour);
      return;
    }

    // User selected end hour: slot clicked represents [hour, hour+1), so checkOut hour is hour + 1
    const finalEndHour = hour + 1;
    const duration = finalEndHour - startHourPick;

    if (duration < 2) {
      return;
    }

    // Check all slots between startHourPick and finalEndHour are free
    for (let h = startHourPick; h < finalEndHour; h++) {
      const s = getSlotStatus(h);
      if (s.state !== "AVAILABLE" && s.state !== "SELECTED") {
        // Blocked mid-interval: cannot span across booked/held slot
        setStartHourPick(hour);
        return;
      }
    }

    const inStr = `${activeDateStr}T${String(startHourPick).padStart(2, "0")}:00`;
    const outStr =
      finalEndHour === 24
        ? (() => {
            const [y, m, d] = activeDateStr.split("-").map(Number);
            const next = new Date(Date.UTC(y, m - 1, d + 1));
            return `${formatDateToVietnamString(next)}T00:00`;
          })()
        : `${activeDateStr}T${String(finalEndHour).padStart(2, "0")}:00`;

    onSelectInterval?.(inStr, outStr);
    setStartHourPick(null);
  };

  return (
    <div className="border border-[#E5E5E5] bg-white p-4 sm:p-5 mb-5">
      {/* Header & Date Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-[#E5E5E5]">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#111111]">
              Lịch trống của phòng
            </h3>
            <span className="flex items-center gap-1 text-[10px] text-[#707072]">
              <Clock className="w-3 h-3 text-[#111111]" />
              Thời gian thực
            </span>
          </div>
          <p className="text-[11px] text-[#707072] mt-0.5">
            Nhấp chọn khung giờ để tự động điền thời gian đặt phòng (tối thiểu 2h)
          </p>
        </div>

        {/* Date stepper */}
        <div className="flex items-center gap-1 self-start sm:self-auto bg-[#F5F5F5] border border-[#E5E5E5] p-1">
          <button
            type="button"
            onClick={handlePrevDay}
            disabled={!canGoPrev}
            aria-label="Ngày trước đó"
            className="w-6 h-6 flex items-center justify-center text-[#111111] hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          <span className="px-2 text-xs font-medium text-[#111111] select-none min-w-[125px] text-center">
            {formatDisplayDateLabel(activeDateStr, todayStr)}
          </span>

          <button
            type="button"
            onClick={handleNextDay}
            disabled={!canGoNext}
            aria-label="Ngày tiếp theo"
            className="w-6 h-6 flex items-center justify-center text-[#111111] hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Race Condition / Conflict Alert */}
      {holdConflictMessage && (
        <div className="my-3 p-3 bg-[#FEF2F2] border border-[#FCA5A5] text-[#991B1B] text-xs flex items-start gap-2 animate-fadeIn">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium">{holdConflictMessage}</p>
            <p className="text-[11px] text-[#B91C1C] mt-0.5">
              Lịch trống đã được tự động cập nhật lại thời gian thực.
            </p>
          </div>
        </div>
      )}

      {/* 24-Hour Timeline Grid */}
      <div className="mt-4">
        {isLoading && intervals.length === 0 ? (
          <div className="py-8 flex flex-col items-center justify-center text-xs text-[#707072]">
            <RefreshCw className="w-4 h-4 animate-spin mb-2 text-[#111111]" />
            <span>Đang đồng bộ trạng thái phòng...</span>
          </div>
        ) : fetchError ? (
          <div className="py-6 text-center text-xs text-red-600 bg-red-50 border border-red-200 p-3">
            {fetchError}
          </div>
        ) : (
          <div>
            {/* Visual 24-Hour Blocks Grid (6 cols on mobile, 12 on sm, 24 on desktop) */}
            <div className="grid grid-cols-6 sm:grid-cols-12 md:grid-cols-24 gap-1 select-none">
              {Array.from({ length: 24 }, (_, i) => {
                const { state, label } = getSlotStatus(i);
                const isSelected = state === "SELECTED";
                const isAvailable = state === "AVAILABLE";
                const isBooked = state === "BOOKED";
                const isHeld = state === "HELD";
                const isBlocked = state === "BLOCKED";

                let bgClass = "bg-[#F5F5F5] text-[#A3A3A3] cursor-not-allowed opacity-50";
                if (isSelected) {
                  bgClass = "bg-[#111111] text-white font-semibold ring-2 ring-[#111111] ring-offset-1 z-10";
                } else if (isAvailable) {
                  bgClass = "bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0] hover:bg-[#D1FAE5] cursor-pointer active:scale-95 transition-transform";
                } else if (isHeld) {
                  bgClass = "bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] cursor-not-allowed opacity-90";
                } else if (isBooked) {
                  bgClass = "bg-[#374151] text-white border border-[#1F2937] cursor-not-allowed";
                } else if (isBlocked) {
                  bgClass = "bg-[#FEE2E2] text-[#991B1B] border border-[#FECACA] cursor-not-allowed";
                }

                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSlotClick(i)}
                    disabled={!isAvailable && !isSelected}
                    title={`${String(i).padStart(2, "0")}:00 - ${String(i + 1).padStart(2, "0")}:00: ${label}`}
                    className={`h-11 rounded flex flex-col items-center justify-center transition-colors text-[10px] leading-tight ${bgClass}`}
                  >
                    <span className="font-mono">{String(i).padStart(2, "0")}h</span>
                    <span className="text-[8px] truncate px-0.5 max-w-full">
                      {isSelected ? "Chọn" : isAvailable ? "Trống" : isHeld ? "Giữ" : isBooked ? "Đặt" : isBlocked ? "Khóa" : "—"}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Instruction helper text */}
            <div className="mt-3 flex items-center justify-between text-[11px] text-[#707072]">
              <span className="flex items-center gap-1">
                <Info className="w-3 h-3 text-[#111111]" />
                {startHourPick !== null
                  ? `Đã chọn bắt đầu lúc ${String(startHourPick).padStart(2, "0")}:00. Bấm tiếp vào giờ kết thúc.`
                  : "Nhấp giờ bắt đầu và giờ kết thúc để chọn nhanh."}
              </span>
              {startHourPick !== null && (
                <button
                  type="button"
                  onClick={() => setStartHourPick(null)}
                  className="text-xs text-[#111111] underline hover:opacity-80"
                >
                  Hủy chọn
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-4 pt-3 border-t border-[#E5E5E5] flex flex-wrap items-center justify-between gap-y-2 text-[11px] text-[#707072]">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-[#ECFDF5] border border-[#A7F3D0] inline-block" />
          <span>Trống</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-[#374151] border border-[#1F2937] inline-block" />
          <span>Đã đặt</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-[#FEF3C7] border border-[#FDE68A] inline-block" />
          <span>Đang có người giữ</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-[#FEE2E2] border border-[#FECACA] inline-block" />
          <span>Không khả dụng</span>
        </div>
      </div>
    </div>
  );
}
