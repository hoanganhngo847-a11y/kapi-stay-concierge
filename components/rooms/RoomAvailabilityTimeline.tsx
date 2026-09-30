"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  RefreshCw,
  Info,
  AlertCircle,
  Calendar,
  X,
  RotateCcw,
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

export type SlotState =
  | "PAST"
  | "AVAILABLE"
  | "BOOKED"
  | "HELD"
  | "BLOCKED"
  | "SELECTED_IN"
  | "SELECTED_OUT"
  | "IN_RANGE"
  | "VALID_CHECKOUT"
  | "DISABLED_UNDER_MIN"
  | "DISABLED_OVER_24H"
  | "DISABLED_CONFLICT";

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
 * Adds N days to YYYY-MM-DD string and returns YYYY-MM-DD in Asia/Ho_Chi_Minh.
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
 * Formats YYYY-MM-DD to human-readable label: "Hôm nay — 30/09", "Ngày mai — 01/10", or "Thứ 4 — 01/10".
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

/**
 * Formats YYYY-MM-DDTHH:mm to friendly string "HH:mm ngày DD/MM".
 */
function formatFriendlyDateTime(isoStr: string): string {
  if (!isoStr) return "";
  const [datePart, timePart] = isoStr.split("T");
  if (!datePart) return isoStr;
  const [, m, d] = datePart.split("-");
  const time = timePart ? timePart.slice(0, 5) : "00:00";
  return `${time} (${d}/${m})`;
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

  // Active date displayed in the slot picker
  const [activeDateStr, setActiveDateStr] = React.useState<string>(() => {
    if (selectedCheckIn) return selectedCheckIn.slice(0, 10);
    return todayStr;
  });

  // Track pending check-in selection when user is picking checkout time
  const [pendingCheckIn, setPendingCheckIn] = React.useState<string | null>(
    selectedCheckIn || null
  );

  // Friendly alert/message to explain rules (e.g. max 24h, min 2h, conflict)
  const [userNotice, setUserNotice] = React.useState<string | null>(null);

  // Intervals data fetched from server (48-hour window from activeDateStr)
  const [intervals, setIntervals] = React.useState<PublicTimelineInterval[]>([]);
  const [isLoading, setIsLoading] = React.useState<boolean>(true);
  const [fetchError, setFetchError] = React.useState<string | null>(null);

  // Max 14 days ahead
  const maxDateStr = React.useMemo(() => addDaysToDateStr(todayStr, 14), [todayStr]);

  // Synchronize state from prop adjustments without triggering cascading renders in effects
  const [prevCheckInProp, setPrevCheckInProp] = React.useState(selectedCheckIn);
  if (selectedCheckIn !== prevCheckInProp) {
    setPrevCheckInProp(selectedCheckIn);
    setPendingCheckIn(selectedCheckIn || null);
    if (selectedCheckIn && !selectedCheckOut) {
      const selDate = selectedCheckIn.slice(0, 10);
      if (selDate >= todayStr && selDate <= maxDateStr) {
        setActiveDateStr(selDate);
      }
    }
  }

  // Fetch 48-hour timeline window starting from activeDateStr
  const fetchTimeline = React.useCallback(async () => {
    if (!roomId) return;
    try {
      const rangeStart = `${activeDateStr}T00:00:00+07:00`;
      const twoDaysLaterStr = addDaysToDateStr(activeDateStr, 2);
      const rangeEnd = `${twoDaysLaterStr}T00:00:00+07:00`;

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

  // Fetch on mount or activeDateStr change
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

  // Date Navigation handlers
  const canGoPrev = activeDateStr > todayStr;
  const canGoNext = activeDateStr < maxDateStr;

  const handlePrevDay = () => {
    if (!canGoPrev) return;
    setIsLoading(true);
    setActiveDateStr(addDaysToDateStr(activeDateStr, -1));
    setUserNotice(null);
    onClearConflictMessage?.();
  };

  const handleNextDay = () => {
    if (!canGoNext) return;
    setIsLoading(true);
    setActiveDateStr(addDaysToDateStr(activeDateStr, 1));
    setUserNotice(null);
    onClearConflictMessage?.();
  };

  // Helper: check raw interval collision for a single hour [slotStartMs, slotEndMs)
  const getRawHourIntervalState = React.useCallback(
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

  // Helper: check if check-in is currently being chosen vs check-out
  const isChoosingCheckOut = Boolean(pendingCheckIn && (!selectedCheckOut || pendingCheckIn !== selectedCheckIn));
  const hasFullSelection = Boolean(selectedCheckIn && selectedCheckOut && pendingCheckIn === selectedCheckIn);

  // If pendingCheckIn is set, get its timestamp and date parts
  const pendingCheckInMs = React.useMemo(() => {
    if (!pendingCheckIn) return null;
    return new Date(
      pendingCheckIn.includes("+") || pendingCheckIn.includes("Z")
        ? pendingCheckIn
        : `${pendingCheckIn}:00+07:00`
    ).getTime();
  }, [pendingCheckIn]);

  const checkInDateStr = pendingCheckIn ? pendingCheckIn.slice(0, 10) : null;
  const checkInNextDateStr = checkInDateStr ? addDaysToDateStr(checkInDateStr, 1) : null;

  // Selected timestamps for highlighting confirmed range
  const confirmedInMs = React.useMemo(() => {
    if (!selectedCheckIn) return null;
    return new Date(
      selectedCheckIn.includes("+") || selectedCheckIn.includes("Z")
        ? selectedCheckIn
        : `${selectedCheckIn}:00+07:00`
    ).getTime();
  }, [selectedCheckIn]);

  const confirmedOutMs = React.useMemo(() => {
    if (!selectedCheckOut) return null;
    return new Date(
      selectedCheckOut.includes("+") || selectedCheckOut.includes("Z")
        ? selectedCheckOut
        : `${selectedCheckOut}:00+07:00`
    ).getTime();
  }, [selectedCheckOut]);

  /**
   * Evaluates the presentation state and action for an hour slot on activeDateStr.
   * Hour `h` represents:
   * - In Step 1 (Check-in): Starting check-in at `activeDateStr T h:00`
   * - In Step 2 (Check-out): Ending check-out at `activeDateStr T h:00`
   */
  const evaluateSlot = React.useCallback(
    (hour: number) => {
      const slotTimeStr = `${activeDateStr}T${String(hour).padStart(2, "0")}:00`;
      const slotStartMs = new Date(`${slotTimeStr}:00+07:00`).getTime();
      const slotEndMs = slotStartMs + 3600 * 1000;

      // -------------------------------------------------------------
      // Case A: Confirmed selection range display
      // -------------------------------------------------------------
      if (hasFullSelection && confirmedInMs && confirmedOutMs) {
        if (slotStartMs === confirmedInMs) {
          return {
            state: "SELECTED_IN" as SlotState,
            label: "Nhận",
            subtext: "Giờ nhận",
            clickable: true,
            hint: "Giờ nhận phòng đã chọn",
          };
        }
        if (slotStartMs === confirmedOutMs) {
          return {
            state: "SELECTED_OUT" as SlotState,
            label: "Trả",
            subtext: "Giờ trả",
            clickable: true,
            hint: "Giờ trả phòng đã chọn",
          };
        }
        if (slotStartMs > confirmedInMs && slotStartMs < confirmedOutMs) {
          return {
            state: "IN_RANGE" as SlotState,
            label: "Đang chọn",
            subtext: "Trong đợt",
            clickable: true,
            hint: "Trong thời gian lưu trú",
          };
        }
      }

      // -------------------------------------------------------------
      // Case B: Step 2 — User is choosing Check-Out
      // -------------------------------------------------------------
      if (pendingCheckInMs !== null) {
        // If this slot exactly matches the pending check-in point
        if (slotStartMs === pendingCheckInMs) {
          return {
            state: "SELECTED_IN" as SlotState,
            label: "Nhận",
            subtext: "Đã chọn",
            clickable: true,
            hint: "Bấm để đổi giờ nhận phòng",
          };
        }

        const durationHours = (slotStartMs - pendingCheckInMs) / (3600 * 1000);

        // Before or equal to check-in
        if (durationHours <= 0) {
          // If available, let user click to change check-in directly!
          const raw = getRawHourIntervalState(slotStartMs, slotEndMs);
          if (raw === "AVAILABLE") {
            return {
              state: "AVAILABLE" as SlotState,
              label: "Trống",
              subtext: "Đổi nhận",
              clickable: true,
              hint: "Bấm để đổi giờ nhận phòng sang khung giờ này",
            };
          }
          return {
            state: (raw === "PAST" ? "PAST" : raw) as SlotState,
            label: raw === "BOOKED" ? "Đã đặt" : raw === "HELD" ? "Đang giữ" : raw === "BLOCKED" ? "Khóa" : "Đã qua",
            subtext: "Không chọn",
            clickable: false,
            hint: "Khung giờ này không khả dụng",
          };
        }

        // Under minimum 2 hours
        if (durationHours < 2) {
          return {
            state: "DISABLED_UNDER_MIN" as SlotState,
            label: "< 2 giờ",
            subtext: "Tối thiểu 2h",
            clickable: true, // Clickable to show explanation
            hint: "Thời lượng đặt phòng tối thiểu là 2 giờ",
          };
        }

        // Over maximum 24 hours (e.g. 08:00 today -> 23:00 tomorrow = 39h)
        if (durationHours > 24) {
          return {
            state: "DISABLED_OVER_24H" as SlotState,
            label: "> 24h",
            subtext: "Tối đa 24h",
            clickable: true, // Clickable to explain friendly max 24h rule
            hint: "Hiện tại Kapi chỉ hỗ trợ đặt phòng theo giờ tối đa 24 tiếng",
          };
        }

        // Duration is between 2h and 24h: check if any conflict exists in [pendingCheckInMs, slotStartMs]
        let hasConflict = false;
        for (const item of intervals) {
          const intStart = new Date(item.start_at).getTime();
          const intEnd = new Date(item.end_at).getTime();
          if (intStart < slotStartMs && intEnd > pendingCheckInMs) {
            hasConflict = true;
            break;
          }
        }

        if (hasConflict) {
          return {
            state: "DISABLED_CONFLICT" as SlotState,
            label: "Bị trùng",
            subtext: "Đã có khách",
            clickable: true,
            hint: "Không thể chọn do có khoảng thời gian đã được đặt ở giữa",
          };
        }

        // VALID CHECK-OUT OPTION!
        return {
          state: "VALID_CHECKOUT" as SlotState,
          label: `+${durationHours}h`,
          subtext: "Chọn trả",
          clickable: true,
          durationHours,
          hint: `Bấm để chọn trả phòng lúc ${String(hour).padStart(2, "0")}:00 (${durationHours} giờ)`,
        };
      }

      // -------------------------------------------------------------
      // Case C: Step 1 — User is choosing Check-In
      // -------------------------------------------------------------
      const rawState = getRawHourIntervalState(slotStartMs, slotEndMs);

      if (rawState !== "AVAILABLE") {
        return {
          state: rawState as SlotState,
          label:
            rawState === "BOOKED"
              ? "Đã đặt"
              : rawState === "HELD"
              ? "Đang giữ"
              : rawState === "BLOCKED"
              ? "Khóa"
              : "Đã qua",
          subtext: rawState === "PAST" ? "Đã qua" : "Không thể nhận",
          clickable: false,
          hint: "Khung giờ không khả dụng để nhận phòng",
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
          state: "DISABLED_UNDER_MIN" as SlotState,
          label: "Cần 2h",
          subtext: "Ít hơn 2h trống",
          clickable: false,
          hint: "Khung giờ này không đủ 2 giờ trống liên tục",
        };
      }

      return {
        state: "AVAILABLE" as SlotState,
        label: "Trống",
        subtext: "Nhận phòng",
        clickable: true,
        hint: `Bấm để chọn nhận phòng lúc ${String(hour).padStart(2, "0")}:00`,
      };
    },
    [
      activeDateStr,
      confirmedInMs,
      confirmedOutMs,
      getRawHourIntervalState,
      hasFullSelection,
      intervals,
      pendingCheckInMs,
    ]
  );

  // Slot click handler
  const handleSlotClick = (hour: number) => {
    const slotInfo = evaluateSlot(hour);
    if (!slotInfo.clickable) return;

    setUserNotice(null);
    onClearConflictMessage?.();

    const clickedIsoStr = `${activeDateStr}T${String(hour).padStart(2, "0")}:00`;
    const clickedMs = new Date(`${clickedIsoStr}:00+07:00`).getTime();

    // 1. If user clicked a slot with > 24h
    if (slotInfo.state === "DISABLED_OVER_24H") {
      setUserNotice(
        "Hiện tại Kapi chỉ hỗ trợ đặt phòng theo giờ tối đa 24 tiếng. Vui lòng chọn giờ trả phòng trong vòng 24 giờ kể từ lúc nhận."
      );
      return;
    }

    // 2. If user clicked a slot with < 2h
    if (slotInfo.state === "DISABLED_UNDER_MIN") {
      setUserNotice("Thời lượng đặt phòng tối thiểu là 2 giờ cho mỗi lượt.");
      return;
    }

    // 3. If user clicked a slot with middle conflict
    if (slotInfo.state === "DISABLED_CONFLICT") {
      setUserNotice(
        "Khung giờ này không khả dụng vì có khoảng thời gian đã được đặt hoặc khóa ở giữa."
      );
      return;
    }

    // 4. If user clicked the check-in slot itself -> clear or reset
    if (pendingCheckInMs !== null && clickedMs === pendingCheckInMs) {
      setPendingCheckIn(null);
      return;
    }

    // 5. In Step 1: User chooses Check-In slot
    if (pendingCheckInMs === null || slotInfo.state === "AVAILABLE") {
      setPendingCheckIn(clickedIsoStr);
      onSelectCheckIn?.(clickedIsoStr);
      // Auto-suggest next day tab if check-in is late (>= 22:00)
      if (hour >= 22) {
        setActiveDateStr(addDaysToDateStr(activeDateStr, 1));
      }
      return;
    }

    // 6. In Step 2: User chooses Valid Check-Out slot
    if (slotInfo.state === "VALID_CHECKOUT" && pendingCheckIn) {
      onSelectInterval?.(pendingCheckIn, clickedIsoStr);
      return;
    }
  };

  // Dedicated button handler for midnight (24:00 / 00:00 of next day)
  const handleMidnightCheckoutClick = () => {
    if (!pendingCheckIn) return;
    const nextDayStr = addDaysToDateStr(activeDateStr, 1);
    const midnightIsoStr = `${nextDayStr}T00:00`;
    const midnightMs = new Date(`${midnightIsoStr}:00+07:00`).getTime();
    const durationHours = (midnightMs - pendingCheckInMs!) / (3600 * 1000);

    if (durationHours < 2) {
      setUserNotice("Thời lượng đặt phòng tối thiểu là 2 giờ.");
      return;
    }
    if (durationHours > 24) {
      setUserNotice("Hiện tại Kapi chỉ hỗ trợ đặt phòng theo giờ tối đa 24 tiếng.");
      return;
    }

    let hasConflict = false;
    for (const item of intervals) {
      const intStart = new Date(item.start_at).getTime();
      const intEnd = new Date(item.end_at).getTime();
      if (intStart < midnightMs && intEnd > pendingCheckInMs!) {
        hasConflict = true;
        break;
      }
    }
    if (hasConflict) {
      setUserNotice("Không thể chọn do có khoảng thời gian đã được đặt ở giữa.");
      return;
    }

    onSelectInterval?.(pendingCheckIn, midnightIsoStr);
  };

  // Reset all selections
  const handleReset = () => {
    setPendingCheckIn(null);
    setUserNotice(null);
    onClearConflictMessage?.();
  };

  return (
    <div className="border border-[#E5E5E5] bg-white p-4 sm:p-5 mb-5 rounded-xl shadow-xs">
      {/* Header & Badges */}
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
            Tối thiểu 2h • Tối đa 24h
          </span>
        </div>

        {/* Step Guide Banner */}
        <div className="mt-3 flex items-center justify-between text-xs bg-[#F9FAFB] border border-[#E5E5E5] p-2.5 rounded-lg">
          <div className="flex items-center gap-2">
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                pendingCheckInMs === null
                  ? "bg-[#111111] text-white"
                  : "bg-emerald-600 text-white"
              }`}
            >
              {pendingCheckInMs === null ? "1" : "✓"}
            </span>

            {pendingCheckInMs === null ? (
              <div>
                <span className="font-semibold text-[#111111]">
                  Bước 1: Chọn giờ nhận phòng
                </span>
                <p className="text-[11px] text-[#707072]">
                  Nhấp chọn một khung giờ trống bên dưới
                </p>
              </div>
            ) : (
              <div>
                <span className="font-semibold text-[#111111]">
                  Bước 2: Chọn giờ trả phòng
                </span>
                <p className="text-[11px] text-[#707072]">
                  Nhận:{" "}
                  <strong className="text-[#111111]">
                    {formatFriendlyDateTime(pendingCheckIn!)}
                  </strong>{" "}
                  — Chọn giờ trả (tối thiểu 2h)
                </p>
              </div>
            )}
          </div>

          {pendingCheckInMs !== null && (
            <button
              type="button"
              onClick={handleReset}
              className="text-[11px] font-medium text-[#707072] hover:text-[#111111] flex items-center gap-1 underline underline-offset-2 ml-2 shrink-0 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Chọn lại
            </button>
          )}
        </div>
      </div>

      {/* Cross-Day Quick Tabs (shown when choosing checkout) */}
      {pendingCheckIn && checkInDateStr && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveDateStr(checkInDateStr);
              setUserNotice(null);
            }}
            className={`flex-1 py-1.5 px-2.5 text-xs font-semibold rounded-lg border transition-all text-center ${
              activeDateStr === checkInDateStr
                ? "bg-[#111111] text-white border-[#111111] shadow-xs"
                : "bg-white text-[#707072] border-[#E5E5E5] hover:bg-[#F9FAFB]"
            }`}
          >
            Hôm nhận ({formatDisplayDateLabel(checkInDateStr, todayStr)})
          </button>

          {checkInNextDateStr && (
            <button
              type="button"
              onClick={() => {
                setActiveDateStr(checkInNextDateStr);
                setUserNotice(null);
              }}
              className={`flex-1 py-1.5 px-2.5 text-xs font-semibold rounded-lg border transition-all text-center ${
                activeDateStr === checkInNextDateStr
                  ? "bg-[#111111] text-white border-[#111111] shadow-xs"
                  : "bg-white text-[#707072] border-[#E5E5E5] hover:bg-[#F9FAFB]"
              }`}
            >
              Ngày mai ({formatDisplayDateLabel(checkInNextDateStr, todayStr)})
            </button>
          )}
        </div>
      )}

      {/* Date Stepper & Picker */}
      <div className="mt-3 flex items-center justify-between gap-2 p-2 bg-[#F9FAFB] border border-[#E5E5E5] rounded-lg">
        <button
          type="button"
          onClick={handlePrevDay}
          disabled={!canGoPrev}
          aria-label="Ngày trước đó"
          className="w-8 h-8 flex items-center justify-center rounded-md border border-[#E5E5E5] bg-white text-[#111111] hover:bg-[#F3F4F6] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[#707072]" />
          <span className="text-xs font-bold text-[#111111]">
            {formatDisplayDateLabel(activeDateStr, todayStr)}
          </span>

          <label className="cursor-pointer text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-0.5 ml-1">
            <span>Đổi ngày</span>
            <input
              type="date"
              min={todayStr}
              max={maxDateStr}
              value={activeDateStr}
              onChange={(e) => {
                if (e.target.value) {
                  setActiveDateStr(e.target.value);
                  setUserNotice(null);
                  onClearConflictMessage?.();
                }
              }}
              className="sr-only"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={handleNextDay}
          disabled={!canGoNext}
          aria-label="Ngày tiếp theo"
          className="w-8 h-8 flex items-center justify-center rounded-md border border-[#E5E5E5] bg-white text-[#111111] hover:bg-[#F3F4F6] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Conflict / Race Alert */}
      {holdConflictMessage && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
          <div className="flex-1">
            <p className="font-semibold">{holdConflictMessage}</p>
            <p className="text-[11px] text-red-600 mt-0.5">
              Lịch trống đã được tự động làm mới theo thời gian thực.
            </p>
          </div>
        </div>
      )}

      {/* Friendly Rule Notice Banner */}
      {userNotice && (
        <div className="mt-3 p-3 bg-blue-50 border border-blue-200 text-blue-900 text-xs rounded-lg flex items-start justify-between gap-2 animate-fadeIn">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" />
            <p className="font-medium text-[11px] leading-relaxed">{userNotice}</p>
          </div>
          <button
            type="button"
            onClick={() => setUserNotice(null)}
            className="text-blue-500 hover:text-blue-800 p-0.5"
            aria-label="Đóng thông báo"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main 24-Hour Structured Slot Grid */}
      <div className="mt-3.5">
        {isLoading && intervals.length === 0 ? (
          <div className="py-10 flex flex-col items-center justify-center text-xs text-[#707072]">
            <RefreshCw className="w-5 h-5 animate-spin mb-2 text-[#111111]" />
            <span>Đang đồng bộ tình trạng phòng...</span>
          </div>
        ) : fetchError ? (
          <div className="py-6 text-center text-xs text-red-600 bg-red-50 border border-red-200 p-3 rounded-lg">
            {fetchError}
          </div>
        ) : (
          <div>
            {/* 4 columns on mobile, 6 columns on sm/md/lg */}
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 select-none">
              {Array.from({ length: 24 }, (_, i) => {
                const { state, label, subtext, clickable, hint } = evaluateSlot(i);
                const hourFormatted = `${String(i).padStart(2, "0")}:00`;

                let btnStyle =
                  "border bg-white text-[#111111] hover:border-black hover:bg-neutral-50";

                if (state === "SELECTED_IN" || state === "SELECTED_OUT") {
                  btnStyle =
                    "bg-[#111111] border-[#111111] text-white font-semibold shadow-xs ring-2 ring-[#111111] ring-offset-1 z-10";
                } else if (state === "IN_RANGE") {
                  btnStyle =
                    "bg-neutral-100 border-neutral-300 text-[#111111] font-medium";
                } else if (state === "VALID_CHECKOUT") {
                  btnStyle =
                    "bg-white border-emerald-500 text-emerald-900 hover:bg-emerald-50 hover:border-emerald-600 font-semibold shadow-2xs active:scale-[0.98]";
                } else if (state === "AVAILABLE") {
                  btnStyle =
                    "bg-emerald-50/70 border-emerald-200 text-emerald-800 hover:bg-emerald-100 hover:border-emerald-300 font-medium active:scale-[0.98]";
                } else if (state === "HELD") {
                  btnStyle =
                    "bg-amber-50 border-amber-200 text-amber-800 cursor-not-allowed opacity-90";
                } else if (state === "BOOKED") {
                  btnStyle =
                    "bg-neutral-100 border-neutral-200 text-neutral-400 cursor-not-allowed opacity-70";
                } else if (state === "BLOCKED") {
                  btnStyle =
                    "bg-rose-50 border-rose-200 text-rose-700 cursor-not-allowed opacity-80";
                } else if (state === "DISABLED_OVER_24H") {
                  btnStyle =
                    "bg-neutral-50 border-dashed border-neutral-200 text-neutral-400 hover:border-neutral-400 cursor-pointer";
                } else if (state === "DISABLED_UNDER_MIN") {
                  btnStyle =
                    "bg-neutral-50 border-neutral-200 text-neutral-400 hover:border-neutral-300 cursor-pointer";
                } else if (state === "DISABLED_CONFLICT") {
                  btnStyle =
                    "bg-neutral-50 border-neutral-200 text-neutral-400 hover:border-neutral-300 cursor-pointer";
                } else if (state === "PAST") {
                  btnStyle =
                    "bg-neutral-50/50 border-neutral-100 text-neutral-300 cursor-not-allowed";
                }

                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSlotClick(i)}
                    disabled={!clickable && state !== "DISABLED_OVER_24H" && state !== "DISABLED_UNDER_MIN" && state !== "DISABLED_CONFLICT"}
                    title={hint}
                    className={`h-13 rounded-lg flex flex-col items-center justify-center p-1 transition-all text-xs leading-tight ${btnStyle}`}
                  >
                    <span className="font-mono font-bold tracking-tight text-xs">
                      {hourFormatted}
                    </span>
                    <span className="text-[10px] mt-0.5 truncate max-w-full font-medium">
                      {state === "VALID_CHECKOUT" ? label : subtext}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Special 24:00 (Midnight) Check-Out Slot option for same-day checkout */}
            {isChoosingCheckOut && activeDateStr === checkInDateStr && (
              <div className="mt-2.5 pt-2 border-t border-[#E5E5E5] flex items-center justify-between">
                <span className="text-xs text-[#707072]">
                  Cần trả phòng vào lúc nửa đêm (hết ngày)?
                </span>
                <button
                  type="button"
                  onClick={handleMidnightCheckoutClick}
                  className="px-3 py-1.5 text-xs font-semibold rounded-md border border-emerald-500 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 transition-colors"
                >
                  24:00 (00:00 ngày mai)
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Compact Clean Legend */}
      <div className="mt-4 pt-3 border-t border-[#E5E5E5] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#707072]">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
          <span>Trống</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-neutral-400 inline-block" />
          <span>Đã đặt</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
          <span>Đang giữ</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
          <span>Không khả dụng</span>
        </div>
      </div>
    </div>
  );
}
