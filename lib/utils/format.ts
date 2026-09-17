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
