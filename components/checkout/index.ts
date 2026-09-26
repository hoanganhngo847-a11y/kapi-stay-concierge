/**
 * @file components/checkout/index.ts
 * @owner TV4 — Linh (feat/booking-checkout)
 *
 * Barrel export cho tất cả component trong module Checkout.
 * Import từ một nơi duy nhất: import { BookingSummary, QRModal } from '@/components/checkout'
 */

export { BookingSummary } from "./BookingSummary";
export type {
  BookingSummaryProps,
  GuestInfo,
  GuestInfoErrors,
} from "./BookingSummary";

export { QRModal } from "./QRModal";
export type { QRModalProps } from "./QRModal";
