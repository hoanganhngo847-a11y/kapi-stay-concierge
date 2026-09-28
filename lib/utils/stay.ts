/**
 * @file lib/utils/stay.ts
 * Pure utilities for calculating stay lifecycle status and formatting stay times.
 */

export interface StayLifecycleResult {
  stayStatus: "ACTIVE" | "UPCOMING" | "COMPLETED" | "CANCELLED";
  isActiveStay: boolean;
  isUpcoming: boolean;
  isExpired: boolean;
  isCancelled: boolean;
  checkInStartTime: number;
  checkOutEndTime: number;
  isHourly: boolean;
}

/**
 * Calculates stay lifecycle strictly honoring hourly intervals when available,
 * and falling back to calendar date boundaries for legacy bookings.
 *
 * @param checkInAt - TIMESTAMPTZ ISO string (e.g. "2026-09-28T14:00:00+07:00")
 * @param checkOutAt - TIMESTAMPTZ ISO string (e.g. "2026-09-28T18:00:00+07:00")
 * @param checkIn - Legacy DATE string (e.g. "2026-09-28")
 * @param checkOut - Legacy DATE string (e.g. "2026-09-28")
 * @param nowMs - Timestamp in milliseconds to evaluate against (defaults to Date.now())
 * @param bookingStatus - Current status (e.g. "confirmed", "cancelled")
 */
export function calculateStayLifecycle(
  checkInAt: string | null | undefined,
  checkOutAt: string | null | undefined,
  checkIn?: string | null,
  checkOut?: string | null,
  nowMs: number = Date.now(),
  bookingStatus: string = "CONFIRMED"
): StayLifecycleResult {
  const isCancelled = bookingStatus.toLowerCase() === "cancelled";
  const isHourly = Boolean(checkInAt && checkOutAt);

  let checkInStartTime: number;
  let checkOutEndTime: number;

  if (isHourly) {
    checkInStartTime = new Date(checkInAt!).getTime();
    checkOutEndTime = new Date(checkOutAt!).getTime();
  } else {
    // Legacy fallback: 00:00 check-in day -> 23:59:59.999 check-out day (Asia/Ho_Chi_Minh: UTC+7)
    const checkInDateStr = checkIn
      ? (checkIn.includes("T") ? checkIn.split("T")[0].trim() : checkIn.trim())
      : "1970-01-01";
    const checkOutDateStr = checkOut
      ? (checkOut.includes("T") ? checkOut.split("T")[0].trim() : checkOut.trim())
      : checkInDateStr;

    checkInStartTime = new Date(`${checkInDateStr}T00:00:00+07:00`).getTime();
    checkOutEndTime = new Date(`${checkOutDateStr}T23:59:59.999+07:00`).getTime();
  }

  const isUpcoming = nowMs < checkInStartTime;
  const isExpired = nowMs > checkOutEndTime;
  const isActiveStay = !isCancelled && nowMs >= checkInStartTime && nowMs <= checkOutEndTime;

  let stayStatus: "ACTIVE" | "UPCOMING" | "COMPLETED" | "CANCELLED" = "ACTIVE";
  if (isCancelled) {
    stayStatus = "CANCELLED";
  } else if (isUpcoming) {
    stayStatus = "UPCOMING";
  } else if (isExpired) {
    stayStatus = "COMPLETED";
  }

  return {
    stayStatus,
    isActiveStay,
    isUpcoming,
    isExpired,
    isCancelled,
    checkInStartTime,
    checkOutEndTime,
    isHourly,
  };
}

/**
 * Formats a datetime string into Vietnam format (HH:mm dd/MM/yyyy).
 */
export function formatStayDateTime(val?: string | null): string {
  if (!val) return "—";
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return val;
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
      const [y, m, day] = val.split("-");
      return `${day}/${m}/${y}`;
    }
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour12: false,
    }).format(d);
  } catch {
    return val;
  }
}
