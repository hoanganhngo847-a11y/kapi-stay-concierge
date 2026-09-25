"use client";

/**
 * @file components/checkout/BookingSummary.tsx
 * @owner TV4 — Linh (feat/booking-checkout)
 *
 * Hiển thị tóm tắt đặt phòng, bảng kê chi phí, khu vực áp voucher,
 * và form thông tin khách lưu trú.
 *
 * Chỉ sử dụng: @/components/ui, @/lib/data/checkout, @/lib/utils/format
 * KHÔNG sửa bất kỳ file nào ngoài components/checkout/**
 */

import React, { useState, useTransition } from "react";
import {
  CalendarDays,
  Users,
  Moon,
  MapPin,
  Tag,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  X,
  Ticket,
  User,
  Phone,
  Mail,
  BedDouble,
} from "lucide-react";
import { Button, Input, Badge } from "@/components/ui";
import { formatVND } from "@/lib/utils/format";
import type {
  CheckoutSessionWithRoom,
  VoucherRedemption,
  Voucher,
} from "@/lib/data/checkout";

// ---------------------------------------------------------------------------
// Kiểu dữ liệu
// ---------------------------------------------------------------------------

export interface GuestInfo {
  fullName: string;
  phone: string;
  email: string;
}

export interface GuestInfoErrors {
  fullName?: string;
  phone?: string;
  email?: string;
}

export interface BookingSummaryProps {
  /** Dữ liệu phiên checkout kèm chi tiết phòng */
  session: CheckoutSessionWithRoom;
  /** Danh sách voucher còn hiệu lực của user */
  availableVouchers: (VoucherRedemption & { voucher: Voucher | null })[];
  /** ID redemption đang được chọn (null = chưa chọn) */
  selectedRedemptionId: string | null;
  /** Số tiền được giảm hiện tại */
  discountAmountVnd: number;
  /** Callback khi user áp / hủy voucher */
  onApplyVoucher: (redemptionId: string) => Promise<void>;
  onReleaseVoucher: () => Promise<void>;
  /** Trạng thái đang xử lý voucher */
  isVoucherLoading: boolean;
  /** Lỗi voucher từ server */
  voucherError: string | null;
  /** Thông tin khách hiện tại */
  guestInfo: GuestInfo;
  /** Lỗi validation thông tin khách */
  guestInfoErrors: GuestInfoErrors;
  /** Callback cập nhật thông tin khách */
  onGuestInfoChange: (field: keyof GuestInfo, value: string) => void;
  /** Callback khi user bấm "Tiến hành thanh toán" */
  onProceedToPayment: () => void;
  /** Đang xử lý (nút CTA) */
  isSubmitting: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Tính số đêm giữa 2 ngày ISO (YYYY-MM-DD) */
function calcNights(checkIn: string, checkOut: string): number {
  const a = new Date(checkIn).getTime();
  const b = new Date(checkOut).getTime();
  return Math.max(1, Math.round((b - a) / 86_400_000));
}

/** Format ngày từ ISO sang dd/MM/yyyy */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Format thời gian hết hạn voucher còn lại */
function formatVoucherExpiry(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Đã hết hạn";
  const hours = Math.floor(diff / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (hours > 0) return `Còn ${hours}g ${mins}p`;
  return `Còn ${mins} phút`;
}

// ---------------------------------------------------------------------------
// Sub-component: VoucherCard — mỗi voucher trong danh sách
// ---------------------------------------------------------------------------

interface VoucherCardProps {
  item: VoucherRedemption & { voucher: Voucher | null };
  isSelected: boolean;
  grossAmountVnd: number;
  onSelect: (redemptionId: string) => void;
  disabled: boolean;
}

function VoucherCard({
  item,
  isSelected,
  grossAmountVnd,
  onSelect,
  disabled,
}: VoucherCardProps) {
  const v = item.voucher;
  if (!v) return null;

  const eligibleBase = Math.min(grossAmountVnd, v.max_eligible_base_vnd);
  const discount = Math.floor((eligibleBase * v.discount_percentage) / 100);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(item.id)}
      aria-pressed={isSelected}
      className={[
        "w-full text-left rounded-xl border-2 p-4 transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        isSelected
          ? "border-primary bg-primary/5"
          : "border-dark/15 bg-white hover:border-primary/50 hover:bg-primary/[0.02]",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Icon + Tên voucher */}
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={[
              "shrink-0 w-9 h-9 rounded-lg flex items-center justify-center",
              isSelected
                ? "bg-primary text-white"
                : "bg-primary/10 text-primary",
            ].join(" ")}
          >
            <Ticket className="w-4.5 h-4.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-dark truncate">{v.name}</p>
            <p className="text-xs text-dark/60 mt-0.5">
              Giảm {v.discount_percentage}% · Tối đa{" "}
              {formatVND(
                Math.floor((v.max_eligible_base_vnd * v.discount_percentage) / 100)
              )}
            </p>
          </div>
        </div>

        {/* Số tiền giảm + badge */}
        <div className="shrink-0 text-right">
          <p className="text-sm font-bold text-primary">-{formatVND(discount)}</p>
          <div className="flex items-center gap-1 mt-1 justify-end">
            <Clock className="w-3 h-3 text-dark/40" aria-hidden="true" />
            <span className="text-xs text-dark/40">
              {formatVoucherExpiry(item.expires_at)}
            </span>
          </div>
        </div>
      </div>

      {/* Checkbox indicator */}
      {isSelected && (
        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-primary/20">
          <CheckCircle2
            className="w-4 h-4 text-primary shrink-0"
            aria-hidden="true"
          />
          <span className="text-xs font-medium text-primary">
            Đã áp dụng voucher này
          </span>
        </div>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component: BookingSummary
// ---------------------------------------------------------------------------

export function BookingSummary({
  session,
  availableVouchers,
  selectedRedemptionId,
  discountAmountVnd,
  onApplyVoucher,
  onReleaseVoucher,
  isVoucherLoading,
  voucherError,
  guestInfo,
  guestInfoErrors,
  onGuestInfoChange,
  onProceedToPayment,
  isSubmitting,
}: BookingSummaryProps) {
  const [showVoucherPanel, setShowVoucherPanel] = useState(false);
  const [isPending, startTransition] = useTransition();

  const nights = calcNights(session.check_in, session.check_out);
  const gross = session.gross_amount_vnd;
  const discount = discountAmountVnd;
  const finalAmount = Math.max(0, gross - discount);

  const room = session.room;

  function handleApply(redemptionId: string) {
    startTransition(() => {
      onApplyVoucher(redemptionId);
    });
  }

  function handleRelease() {
    startTransition(() => {
      onReleaseVoucher();
    });
  }

  return (
    <div className="w-full space-y-5">
      {/* ── Card 1: Tóm tắt đặt phòng ─────────────────────────────────── */}
      <section
        className="bg-white rounded-2xl border border-dark/10 overflow-hidden shadow-sm"
        aria-labelledby="booking-summary-heading"
      >
        {/* Header phòng */}
        <div className="bg-gradient-to-r from-primary/10 to-secondary/10 px-5 pt-5 pb-4 border-b border-dark/8">
          <div className="flex items-start gap-4">
            {/* Thumbnail phòng */}
            {room?.image_paths?.[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={room.image_paths[0]}
                alt={room.name}
                className="w-16 h-16 rounded-xl object-cover shrink-0 border border-dark/10"
              />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                <BedDouble
                  className="w-7 h-7 text-primary/70"
                  aria-hidden="true"
                />
              </div>
            )}
            <div className="min-w-0">
              <h2
                id="booking-summary-heading"
                className="text-base font-bold text-dark leading-snug"
              >
                {room?.name ?? "Phòng đã chọn"}
              </h2>
              {room?.property && (
                <div className="flex items-center gap-1.5 mt-1">
                  <MapPin
                    className="w-3.5 h-3.5 text-dark/40 shrink-0"
                    aria-hidden="true"
                  />
                  <p className="text-xs text-dark/60 truncate">
                    {room.property.name} · {room.property.address}
                  </p>
                </div>
              )}
              <Badge variant="secondary" size="sm" className="mt-2">
                Đã chọn
              </Badge>
            </div>
          </div>
        </div>

        {/* Chi tiết lịch trình */}
        <div className="px-5 py-4 grid grid-cols-2 gap-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-secondary/15 flex items-center justify-center shrink-0">
              <CalendarDays
                className="w-4 h-4 text-secondary-700"
                aria-hidden="true"
              />
            </div>
            <div>
              <p className="text-xs text-dark/50 font-medium uppercase tracking-wide">
                Nhận phòng
              </p>
              <p className="text-sm font-semibold text-dark mt-0.5">
                {formatDate(session.check_in)}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-secondary/15 flex items-center justify-center shrink-0">
              <CalendarDays
                className="w-4 h-4 text-secondary-700"
                aria-hidden="true"
              />
            </div>
            <div>
              <p className="text-xs text-dark/50 font-medium uppercase tracking-wide">
                Trả phòng
              </p>
              <p className="text-sm font-semibold text-dark mt-0.5">
                {formatDate(session.check_out)}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Moon className="w-4 h-4 text-primary" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-dark/50 font-medium uppercase tracking-wide">
                Số đêm
              </p>
              <p className="text-sm font-semibold text-dark mt-0.5">
                {nights} đêm
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4 text-primary" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-dark/50 font-medium uppercase tracking-wide">
                Số khách
              </p>
              <p className="text-sm font-semibold text-dark mt-0.5">
                {session.guest_count} khách
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Card 2: Voucher ──────────────────────────────────────────────── */}
      <section
        className="bg-white rounded-2xl border border-dark/10 shadow-sm overflow-hidden"
        aria-labelledby="voucher-section-heading"
      >
        <button
          type="button"
          id="voucher-section-heading"
          onClick={() => setShowVoucherPanel((p) => !p)}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-dark/[0.02] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30"
          aria-expanded={showVoucherPanel}
          aria-controls="voucher-panel"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Tag className="w-4 h-4 text-primary" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold text-dark">Mã ưu đãi</p>
              {selectedRedemptionId ? (
                <p className="text-xs text-primary font-medium mt-0.5">
                  Đã áp dụng · Tiết kiệm {formatVND(discountAmountVnd)}
                </p>
              ) : (
                <p className="text-xs text-dark/50 mt-0.5">
                  {availableVouchers.length > 0
                    ? `Bạn có ${availableVouchers.length} voucher có thể dùng`
                    : "Không có voucher khả dụng"}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectedRedemptionId && (
              <Badge variant="success" size="sm" dot>
                Đã áp
              </Badge>
            )}
            {showVoucherPanel ? (
              <ChevronUp className="w-4 h-4 text-dark/40" aria-hidden="true" />
            ) : (
              <ChevronDown
                className="w-4 h-4 text-dark/40"
                aria-hidden="true"
              />
            )}
          </div>
        </button>

        {/* Panel voucher mở rộng */}
        {showVoucherPanel && (
          <div
            id="voucher-panel"
            className="px-5 pb-5 border-t border-dark/8 pt-4 space-y-3"
          >
            {/* Lỗi voucher */}
            {voucherError && (
              <div
                role="alert"
                className="flex items-start gap-2.5 bg-rose-50 border border-rose-200 rounded-xl p-3.5"
              >
                <X
                  className="w-4 h-4 text-rose-500 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <p className="text-sm text-rose-700">{voucherError}</p>
              </div>
            )}

            {availableVouchers.length === 0 ? (
              <div className="text-center py-6">
                <Ticket
                  className="w-10 h-10 text-dark/20 mx-auto mb-2"
                  aria-hidden="true"
                />
                <p className="text-sm text-dark/50">
                  Bạn chưa có voucher nào khả dụng.
                </p>
                <p className="text-xs text-dark/40 mt-1">
                  Tích điểm để đổi voucher giảm giá nhé!
                </p>
              </div>
            ) : (
              <div className="space-y-2.5" role="radiogroup" aria-label="Chọn voucher">
                {availableVouchers.map((item) => (
                  <VoucherCard
                    key={item.id}
                    item={item}
                    isSelected={selectedRedemptionId === item.id}
                    grossAmountVnd={gross}
                    onSelect={handleApply}
                    disabled={isVoucherLoading || isPending}
                  />
                ))}
              </div>
            )}

            {/* Nút hủy voucher đã chọn */}
            {selectedRedemptionId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRelease}
                isLoading={isVoucherLoading || isPending}
                className="w-full text-dark/50 hover:text-rose-600 hover:bg-rose-50 mt-1"
              >
                Hủy áp dụng voucher
              </Button>
            )}
          </div>
        )}
      </section>

      {/* ── Card 3: Bảng kê chi phí ──────────────────────────────────────── */}
      <section
        className="bg-white rounded-2xl border border-dark/10 shadow-sm px-5 py-4 space-y-3"
        aria-label="Bảng kê chi phí"
      >
        <h3 className="text-sm font-semibold text-dark/70 uppercase tracking-wide">
          Chi phí
        </h3>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-dark/70">
              {room?.nightly_price_vnd
                ? `${formatVND(room.nightly_price_vnd)} × ${nights} đêm`
                : "Tổng tiền phòng"}
            </span>
            <span className="text-sm font-medium text-dark">
              {formatVND(gross)}
            </span>
          </div>

          {discount > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
                <span className="text-sm text-primary font-medium">
                  Giảm giá voucher
                </span>
              </div>
              <span className="text-sm font-bold text-primary">
                -{formatVND(discount)}
              </span>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-dashed border-dark/15 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-dark">
              Tổng thanh toán
            </span>
            <span className="text-xl font-bold text-dark">
              {formatVND(finalAmount)}
            </span>
          </div>
          <p className="text-xs text-dark/45 mt-1 text-right">
            Thanh toán 100% qua VietQR · Không hỗ trợ đặt cọc
          </p>
        </div>
      </section>

      {/* ── Card 4: Thông tin khách lưu trú ──────────────────────────────── */}
      <section
        className="bg-white rounded-2xl border border-dark/10 shadow-sm px-5 py-5 space-y-4"
        aria-labelledby="guest-info-heading"
      >
        <h3
          id="guest-info-heading"
          className="text-sm font-semibold text-dark/70 uppercase tracking-wide"
        >
          Thông tin khách lưu trú
        </h3>

        <div className="space-y-3.5">
          <Input
            id="guest-full-name"
            label="Họ và tên"
            placeholder="Nguyễn Văn A"
            autoComplete="name"
            value={guestInfo.fullName}
            onChange={(e) => onGuestInfoChange("fullName", e.target.value)}
            errorMessage={guestInfoErrors.fullName}
            startIcon={
              <User className="w-4 h-4" aria-hidden="true" />
            }
            required
          />

          <Input
            id="guest-phone"
            label="Số điện thoại"
            type="tel"
            placeholder="0901 234 567"
            autoComplete="tel"
            value={guestInfo.phone}
            onChange={(e) => onGuestInfoChange("phone", e.target.value)}
            errorMessage={guestInfoErrors.phone}
            startIcon={
              <Phone className="w-4 h-4" aria-hidden="true" />
            }
            required
          />

          <Input
            id="guest-email"
            label="Email liên hệ"
            type="email"
            placeholder="example@email.com"
            autoComplete="email"
            value={guestInfo.email}
            onChange={(e) => onGuestInfoChange("email", e.target.value)}
            errorMessage={guestInfoErrors.email}
            startIcon={
              <Mail className="w-4 h-4" aria-hidden="true" />
            }
            required
          />
        </div>

        <p className="text-xs text-dark/40 leading-relaxed">
          Thông tin trên chỉ dùng để liên hệ xác nhận đặt phòng và không được
          lưu trữ ngoài mục đích nghiệp vụ.
        </p>
      </section>

      {/* ── CTA: Tiến hành thanh toán ─────────────────────────────────────── */}
      <Button
        id="proceed-to-payment-btn"
        size="lg"
        variant="primary"
        className="w-full"
        onClick={onProceedToPayment}
        isLoading={isSubmitting}
        disabled={isSubmitting}
        rightIcon={
          !isSubmitting ? (
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-5 h-5"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
                clipRule="evenodd"
              />
            </svg>
          ) : undefined
        }
      >
        {isSubmitting ? "Đang xử lý..." : `Thanh toán ${formatVND(finalAmount)}`}
      </Button>
    </div>
  );
}
