export const VALID_TICKET_CATEGORIES = [
  "Khóa kẹt",
  "Thiết bị hỏng",
  "Vệ sinh chưa sạch",
  "Tiếng ồn",
  "Yêu cầu khác",
] as const;

export type TicketCategory = (typeof VALID_TICKET_CATEGORIES)[number];

export function isValidTicketCategory(value: unknown): value is TicketCategory {
  return typeof value === "string" && (VALID_TICKET_CATEGORIES as readonly string[]).includes(value);
}
