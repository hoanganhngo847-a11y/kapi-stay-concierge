"use client";

/**
 * @file app/checkout/CheckoutClient.tsx
 * @owner TV4 — Linh (feat/booking-checkout)
 *
 * Client component chứa toàn bộ state và logic tương tác cho trang Checkout.
 * Được mount bởi Server Component page.tsx (đã xác thực auth + tạo session).
 *
 * Luồng:
 *   1. Nhận session + vouchers + userId từ page.tsx (props)
 *   2. Quản lý form thông tin khách, voucher picker, trạng thái QRModal
 *   3. Khi user bấm "Thanh toán" → mở QRModal
 *   4. Khi xác nhận thanh toán thành công → điều hướng sang /my-stay
 */

import React, { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { BookingSummary } from "@/components/checkout/BookingSummary";
import { QRModal } from "@/components/checkout/QRModal";
import type { GuestInfo, GuestInfoErrors } from "@/components/checkout/BookingSummary";
// Server Actions — wraps server-only data layer, safe to call from client
import {
  applyVoucherAction,
  releaseVoucherAction,
  refreshAvailableVouchersAction,
} from "./actions";
// type-only imports are allowed in client components (no runtime server code)
import type {
  CheckoutSessionWithRoom,
  VoucherRedemption,
  Voucher,
} from "@/lib/data/checkout";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CheckoutClientProps {
  session: CheckoutSessionWithRoom;
  initialVouchers: (VoucherRedemption & { voucher: Voucher | null })[];
  /** userId được page.tsx truyền vào; auth thực tế do Server Actions xử lý */
  userId: string;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateGuestInfo(info: GuestInfo): GuestInfoErrors {
  const errors: GuestInfoErrors = {};

  if (!info.fullName.trim()) {
    errors.fullName = "Vui lòng nhập họ và tên.";
  } else if (info.fullName.trim().length < 2) {
    errors.fullName = "Họ và tên phải có ít nhất 2 ký tự.";
  }

  if (!info.phone.trim()) {
    errors.phone = "Vui lòng nhập số điện thoại.";
  } else if (!/^(0|\+84)[0-9]{8,10}$/.test(info.phone.replace(/\s/g, ""))) {
    errors.phone = "Số điện thoại không hợp lệ (ví dụ: 0901234567).";
  }

  if (!info.email.trim()) {
    errors.email = "Vui lòng nhập địa chỉ email.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(info.email.trim())) {
    errors.email = "Địa chỉ email không hợp lệ.";
  }

  return errors;
}

// payment_reference được đọc từ session (server đã sinh và lưu vào DB khi tạo session).
// KAPI không để client tự sinh giá trị này.

// ---------------------------------------------------------------------------
// Main Client Component
// ---------------------------------------------------------------------------

export function CheckoutClient({
  session,
  initialVouchers,
  userId: _userId, // eslint-disable-line @typescript-eslint/no-unused-vars
}: CheckoutClientProps) {
  const router = useRouter();

  // ── State: thông tin khách ────────────────────────────────────────────────
  const [guestInfo, setGuestInfo] = useState<GuestInfo>({
    fullName: "",
    phone: "",
    email: "",
  });
  const [guestInfoErrors, setGuestInfoErrors] = useState<GuestInfoErrors>({});

  // ── State: voucher ────────────────────────────────────────────────────────
  const [availableVouchers, setAvailableVouchers] = useState(initialVouchers);
  const [selectedRedemptionId, setSelectedRedemptionId] = useState<string | null>(null);
  const [discountAmountVnd, setDiscountAmountVnd] = useState(0);
  const [isVoucherLoading, setIsVoucherLoading] = useState(false);
  const [voucherError, setVoucherError] = useState<string | null>(null);

  // ── State: QRModal ────────────────────────────────────────────────────────
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Đọc payment_reference do server sinh ra và lưu vào checkout_sessions khi tạo session.
  // Không tự sinh ở browser để tránh sai lệch với DB.
  const paymentReference = session.payment_reference ?? "";
  if (!session.payment_reference) {
    console.warn(
      "[CheckoutClient] payment_reference is null — session may not have been fully initialized."
    );
  }

  // Tính toán số tiền thanh toán thực tế (sau khi áp voucher)
  const finalAmountVnd = Math.max(0, session.gross_amount_vnd - discountAmountVnd);

  // ── Handler: cập nhật thông tin khách ────────────────────────────────────
  const handleGuestInfoChange = useCallback(
    (field: keyof GuestInfo, value: string) => {
      setGuestInfo((prev) => ({ ...prev, [field]: value }));
      // Xóa lỗi field đang được chỉnh
      setGuestInfoErrors((prev) => ({ ...prev, [field]: undefined }));
    },
    []
  );

  // ── Handler: hủy voucher — khai báo TRƯỚC handleApplyVoucher vì được gọi bên trong
  const handleReleaseVoucher = useCallback(async () => {
    if (!selectedRedemptionId) return;

    setIsVoucherLoading(true);
    setVoucherError(null);

    // Gọi Server Action — userId được xác minh lại ở server
    await releaseVoucherAction(session.id);

    setSelectedRedemptionId(null);
    setDiscountAmountVnd(0);
    setIsVoucherLoading(false);
  }, [selectedRedemptionId, session.id]);

  // ── Handler: áp voucher — khai báo SAU handleReleaseVoucher để tránh temporal dead zone
  const handleApplyVoucher = useCallback(
    async (redemptionId: string) => {
      // Nếu đang chọn lại cùng voucher → hủy (toggle) — userId không cần truyền, actions.ts tự lấy
      if (selectedRedemptionId === redemptionId) {
        await handleReleaseVoucher();
        return;
      }

      setIsVoucherLoading(true);
      setVoucherError(null);

      // Nếu đang có voucher khác → hủy trước
      if (selectedRedemptionId) {
        await releaseVoucherAction(session.id);
      }

      // Gọi Server Action — userId được xác minh lại ở server
      const result = await applyVoucherAction(
        redemptionId,
        session.id,
        session.gross_amount_vnd
      );

      setIsVoucherLoading(false);

      if (!result.valid) {
        setVoucherError(result.errorMessage);
        // Refresh danh sách voucher để phản ánh trạng thái mới nhất
        const { data: refreshed } = await refreshAvailableVouchersAction();
        if (refreshed) setAvailableVouchers(refreshed);
        return;
      }

      setSelectedRedemptionId(redemptionId);
      setDiscountAmountVnd(result.discountAmountVnd);
      setVoucherError(null);
    },
    // handleReleaseVoucher included correctly — declared above, stable reference
    [selectedRedemptionId, session.id, session.gross_amount_vnd, handleReleaseVoucher]
  );

  // ── Handler: bấm "Tiến hành thanh toán" ──────────────────────────────────
  function handleProceedToPayment() {
    // Validate form thông tin khách
    const errors = validateGuestInfo(guestInfo);
    if (Object.keys(errors).length > 0) {
      setGuestInfoErrors(errors);
      // Scroll lên trên để user thấy lỗi
      const firstErrorField = document.querySelector<HTMLInputElement>(
        "[aria-invalid='true']"
      );
      firstErrorField?.scrollIntoView({ behavior: "smooth", block: "center" });
      firstErrorField?.focus();
      return;
    }

    setIsSubmitting(true);
    setIsQRModalOpen(true);
    setIsSubmitting(false);
  }

  // ── Handler: đóng QRModal ─────────────────────────────────────────────────
  function handleCloseQRModal() {
    setIsQRModalOpen(false);
  }

  // ── Handler: thanh toán thành công ──────────────────────────────────────
  function handlePaymentSuccess(bookingId: string) {
    // Delay nhẹ để user đọc màn hình success trong QRModal trước khi redirect
    setTimeout(() => {
      router.push(`/my-stay?welcome=1&booking=${bookingId.slice(0, 8).toUpperCase()}`);
    }, 3000);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <BookingSummary
        session={session}
        availableVouchers={availableVouchers}
        selectedRedemptionId={selectedRedemptionId}
        discountAmountVnd={discountAmountVnd}
        onApplyVoucher={handleApplyVoucher}
        onReleaseVoucher={handleReleaseVoucher}
        isVoucherLoading={isVoucherLoading}
        voucherError={voucherError}
        guestInfo={guestInfo}
        guestInfoErrors={guestInfoErrors}
        onGuestInfoChange={handleGuestInfoChange}
        onProceedToPayment={handleProceedToPayment}
        isSubmitting={isSubmitting}
      />

      <QRModal
        isOpen={isQRModalOpen}
        onClose={handleCloseQRModal}
        sessionId={session.id}
        amountVnd={finalAmountVnd}
        paymentReference={paymentReference}
        onPaymentSuccess={handlePaymentSuccess}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Error display sub-component (dùng trong page.tsx khi có lỗi)
// ---------------------------------------------------------------------------

interface CheckoutErrorProps {
  title: string;
  message: string;
  backHref?: string;
  backLabel?: string;
}

export function CheckoutError({
  title,
  message,
  backHref = "/rooms",
  backLabel = "Quay lại danh sách phòng",
}: CheckoutErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center mb-5 border border-rose-200">
        <AlertCircle
          className="w-8 h-8 text-rose-500"
          aria-hidden="true"
        />
      </div>
      <h1 className="text-xl font-bold text-dark mb-2">{title}</h1>
      <p className="text-sm text-dark/60 leading-relaxed max-w-sm mb-6">
        {message}
      </p>
      <Link
        href={backHref}
        className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-600 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        {backLabel}
      </Link>
    </div>
  );
}
