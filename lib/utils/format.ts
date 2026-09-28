/**
 * Formats a numeric or bigint monetary value in Vietnam Dong (VND).
 * Example: 650000 -> "650.000đ"
 */
export function formatVND(amount: number | bigint | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(Number(amount))) {
    return "0đ";
  }
  const formatted = new Intl.NumberFormat("vi-VN").format(Number(amount));
  return `${formatted}đ`;
}

/**
 * Chuẩn hóa chuỗi thời gian sang ISO UTC string với timezone Asia/Ho_Chi_Minh (+07:00) nếu chưa có offset.
 */
export function normalizeToVietnamISO(dateOrTimeStr: string): string | null {
  if (!dateOrTimeStr || typeof dateOrTimeStr !== "string") return null;
  const trimmed = dateOrTimeStr.trim();
  if (!trimmed) return null;

  // Format 1: YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss without timezone
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    const withOffset = trimmed.length === 16 ? `${trimmed}:00+07:00` : `${trimmed}+07:00`;
    const d = new Date(withOffset);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  // Format 2: YYYY-MM-DD (legacy date) -> default 14:00 check-in
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const withOffset = `${trimmed}T14:00:00+07:00`;
    const d = new Date(withOffset);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  // Format 3: Already has offset or Z
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

