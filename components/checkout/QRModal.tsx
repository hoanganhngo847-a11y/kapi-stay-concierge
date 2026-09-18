"use client";

/**
 * @file components/checkout/QRModal.tsx
 * @owner TV4 — Linh (feat/booking-checkout)
 *
 * Modal hiển thị mã VietQR để thanh toán chuyển khoản.
 * Tích hợp nút copy STK, copy nội dung, và xác nhận thanh toán.
 *
 * Chỉ sử dụng: @/components/ui, @/lib/data/checkout, @/lib/utils/format
 * KHÔNG sửa bất kỳ file nào ngoài components/checkout/**
 */

import React, { useState, useCallback } from "react";
import {
  Copy,
  CheckCheck,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Clock,
  Smartphone,
  ArrowRight,
} from "lucide-react";
import { Modal, Button, Badge } from "@/components/ui";
import { formatVND } from "@/lib/utils/format";
import { confirmPaymentAction } from "@/app/checkout/actions";

// ---------------------------------------------------------------------------
// Cấu hình ngân hàng VietQR
// ---------------------------------------------------------------------------

/**
 * Đọc từ biến môi trường nếu có; dùng giá trị mặc định khi phát triển.
 * KHÔNG commit giá trị thật lên Git — khai báo trong .env.local
 *
 * Biến môi trường cần thêm vào .env.local (TV4 phối hợp TV1 để thiết lập):
 *   NEXT_PUBLIC_VIETQR_BANK_ID=<mã ngân hàng, ví dụ: MB, TCB, VCB...>
 *   NEXT_PUBLIC_VIETQR_ACCOUNT_NO=<số tài khoản>
 *   NEXT_PUBLIC_VIETQR_ACCOUNT_NAME=<tên chủ TK>
 */
const BANK_ID =
  process.env.NEXT_PUBLIC_VIETQR_BANK_ID ?? "MB";
const ACCOUNT_NO =
  process.env.NEXT_PUBLIC_VIETQR_ACCOUNT_NO ?? "0000000000";
const ACCOUNT_NAME =
  process.env.NEXT_PUBLIC_VIETQR_ACCOUNT_NAME ?? "KAPI STAY";

// ---------------------------------------------------------------------------
// Kiểu dữ liệu
// ---------------------------------------------------------------------------

export interface QRModalProps {
  /** Kiểm soát hiển thị modal */
  isOpen: boolean;
  /** Callback đóng modal */
  onClose: () => void;
  /** UUID của checkout session */
  sessionId: string;
  /** Số tiền cần thanh toán (VND) */
  amountVnd: number;
  /** Nội dung chuyển khoản (payment reference) */
  paymentReference: string;
  /** Callback sau khi booking được xác nhận thành công */
  onPaymentSuccess: (bookingId: string) => void;
}

// ---------------------------------------------------------------------------
// Helper: sinh URL VietQR
// ---------------------------------------------------------------------------

function buildVietQRUrl(
  bankId: string,
  accountNo: string,
  amount: number,
  addInfo: string
): string {
  const encoded = encodeURIComponent(addInfo);
  return `https://img.vietqr.io/image/${bankId}-${accountNo}-compact2.png?amount=${amount}&addInfo=${encoded}&accountName=${encodeURIComponent(ACCOUNT_NAME)}`;
}

// ---------------------------------------------------------------------------
// Sub-component: CopyButton — nút copy 1-click với feedback
// ---------------------------------------------------------------------------

interface CopyButtonProps {
  label: string;
  value: string;
  id: string;
}

function CopyButton({ label, value, id }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback cho môi trường không hỗ trợ Clipboard API
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [value]);

  return (
    <button
      id={id}
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Đã sao chép!" : `Sao chép ${label}`}
      className={[
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium",
        "transition-all duration-200 focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-primary/40",
        copied
          ? "bg-secondary/20 text-secondary-700 border border-secondary/30"
          : "bg-dark/8 text-dark/70 border border-dark/15 hover:bg-dark/12 hover:text-dark",
      ].join(" ")}
    >
      {copied ? (
        <>
          <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
          Đã sao chép!
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
          Sao chép {label}
        </>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: InfoRow — mỗi dòng thông tin chuyển khoản
// ---------------------------------------------------------------------------

interface InfoRowProps {
  label: string;
  value: string;
  highlight?: boolean;
  copyId?: string;
}

function InfoRow({ label, value, highlight = false, copyId }: InfoRowProps) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-dark/8 last:border-0">
      <span className="text-xs text-dark/50 font-medium shrink-0 pt-0.5 min-w-[90px]">
        {label}
      </span>
      <div className="flex flex-col items-end gap-1.5 min-w-0">
        <span
          className={[
            "text-sm font-semibold text-right break-all",
            highlight ? "text-primary text-base" : "text-dark",
          ].join(" ")}
        >
          {value}
        </span>
        {copyId && (
          <CopyButton
            id={copyId}
            label={label.toLowerCase()}
            value={value}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component: QRModal
// ---------------------------------------------------------------------------

export function QRModal({
  isOpen,
  onClose,
  sessionId,
  amountVnd,
  paymentReference,
  onPaymentSuccess,
}: QRModalProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [successBookingId, setSuccessBookingId] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);

  const qrUrl = buildVietQRUrl(BANK_ID, ACCOUNT_NO, amountVnd, paymentReference);

  // Đặt lại trạng thái khi modal đóng
  function handleClose() {
    if (isConfirming) return; // Không cho đóng khi đang xử lý
    onClose();
  }

  // Xác nhận đã chuyển khoản → gọi Server Action confirmPaymentAction
  async function handleConfirmPayment() {
    setIsConfirming(true);
    setConfirmError(null);

    // userId được xác minh lại ở server, không cần truyền từ client
    const { bookingId, error } = await confirmPaymentAction(sessionId);

    setIsConfirming(false);

    if (error || !bookingId) {
      setConfirmError(
        error ??
          "Có lỗi xảy ra khi xác nhận đặt phòng. Vui lòng liên hệ hỗ trợ."
      );
      return;
    }

    setIsSuccess(true);
    setSuccessBookingId(bookingId);
    onPaymentSuccess(bookingId);
  }

  // ---------------------------------------------------------------------------
  // Màn hình thành công (sau khi xác nhận)
  // ---------------------------------------------------------------------------
  if (isSuccess && successBookingId) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        closeOnOverlayClick={false}
        size="sm"
        title="Đặt phòng thành công! 🎉"
        description="Cảm ơn bạn đã tin tưởng Kapi Stay. Chúc bạn có kỳ nghỉ tuyệt vời!"
        footer={
          <a
            href="/my-stay"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-600 active:bg-primary-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
            id="go-to-my-stay-link"
          >
            Xem kỳ nghỉ của tôi
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </a>
        }
      >
        <div className="flex flex-col items-center text-center gap-5 py-2">
          {/* Icon thành công */}
          <div className="w-20 h-20 rounded-full bg-secondary/20 flex items-center justify-center">
            <CheckCircle2
              className="w-10 h-10 text-secondary-700"
              aria-hidden="true"
            />
          </div>

          {/* Booking code */}
          <div className="w-full bg-light rounded-xl p-4 border border-dark/10">
            <p className="text-xs text-dark/50 uppercase tracking-wide font-medium mb-1">
              Mã đặt phòng
            </p>
            <p
              className="text-lg font-bold text-dark font-mono tracking-widest"
              aria-label={`Mã đặt phòng: ${successBookingId.slice(0, 8).toUpperCase()}`}
            >
              {successBookingId.slice(0, 8).toUpperCase()}
            </p>
            <p className="text-xs text-dark/40 mt-2">
              Lưu lại mã này để tra cứu đặt phòng nếu cần.
            </p>
          </div>

          <div className="text-left w-full space-y-2 text-sm text-dark/70">
            <div className="flex items-center gap-2">
              <CheckCheck
                className="w-4 h-4 text-secondary-600 shrink-0"
                aria-hidden="true"
              />
              <span>Thanh toán đã được ghi nhận</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCheck
                className="w-4 h-4 text-secondary-600 shrink-0"
                aria-hidden="true"
              />
              <span>Phòng của bạn đã được xác nhận</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCheck
                className="w-4 h-4 text-secondary-600 shrink-0"
                aria-hidden="true"
              />
              <span>Điểm loyalty sẽ được cộng trong ít phút</span>
            </div>
          </div>
        </div>
      </Modal>
    );
  }

  // ---------------------------------------------------------------------------
  // Màn hình QR chính
  // ---------------------------------------------------------------------------
  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      closeOnOverlayClick={!isConfirming}
      size="md"
      title="Thanh toán qua VietQR"
      description="Quét mã QR hoặc chuyển khoản theo thông tin bên dưới. Giữ nguyên nội dung chuyển khoản để hệ thống tự đối soát."
      footer={
        <div className="flex flex-col gap-2 w-full">
          {/* Lỗi xác nhận */}
          {confirmError && (
            <div
              role="alert"
              className="flex items-start gap-2.5 bg-rose-50 border border-rose-200 rounded-xl p-3 w-full"
            >
              <AlertCircle
                className="w-4 h-4 text-rose-500 shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <p className="text-xs text-rose-700">{confirmError}</p>
            </div>
          )}

          <div className="flex gap-3 w-full">
            <Button
              variant="outline"
              size="md"
              onClick={handleClose}
              disabled={isConfirming}
              className="flex-1"
              id="cancel-payment-btn"
            >
              Hủy
            </Button>
            <Button
              id="confirm-payment-btn"
              variant="primary"
              size="md"
              isLoading={isConfirming}
              onClick={handleConfirmPayment}
              className="flex-[2]"
            >
              {isConfirming
                ? "Đang xác nhận..."
                : "Tôi đã chuyển khoản thành công"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* ── Cảnh báo thời hạn ───────────────────────────────────────── */}
        <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <Clock
            className="w-4 h-4 text-amber-600 shrink-0"
            aria-hidden="true"
          />
          <p className="text-xs text-amber-800 font-medium">
            Phiên thanh toán có hiệu lực trong{" "}
            <strong>30 phút</strong>. Vui lòng hoàn tất trước khi hết hạn.
          </p>
        </div>

        {/* ── Ảnh QR ──────────────────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            {!qrError ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrUrl}
                alt={`Mã QR chuyển khoản ${formatVND(amountVnd)} cho ${paymentReference}`}
                className="w-52 h-52 rounded-2xl border-2 border-dark/10 shadow-sm object-contain bg-white p-1"
                onError={() => setQrError(true)}
                loading="eager"
              />
            ) : (
              <div className="w-52 h-52 rounded-2xl border-2 border-dark/10 bg-dark/5 flex flex-col items-center justify-center gap-2">
                <AlertCircle
                  className="w-8 h-8 text-dark/30"
                  aria-hidden="true"
                />
                <p className="text-xs text-dark/40 text-center px-4">
                  Không tải được mã QR. Vui lòng chuyển khoản thủ công theo
                  thông tin bên dưới.
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="primary" size="sm" dot>
              VietQR
            </Badge>
            <a
              href={qrUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-dark/40 hover:text-primary transition-colors"
              aria-label="Mở ảnh QR trong tab mới"
            >
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
              Mở ảnh lớn hơn
            </a>
          </div>
        </div>

        {/* ── Thông tin chuyển khoản ────────────────────────────────────── */}
        <div
          className="bg-light/60 rounded-2xl border border-dark/10 px-4 py-1"
          aria-label="Thông tin tài khoản nhận tiền"
        >
          <InfoRow label="Ngân hàng" value={BANK_ID} />
          <InfoRow
            label="Số tài khoản"
            value={ACCOUNT_NO}
            copyId="copy-account-number-btn"
          />
          <InfoRow label="Chủ tài khoản" value={ACCOUNT_NAME} />
          <InfoRow
            label="Số tiền"
            value={formatVND(amountVnd)}
            highlight
          />
          <InfoRow
            label="Nội dung CK"
            value={paymentReference}
            copyId="copy-payment-reference-btn"
          />
        </div>

        {/* ── Hướng dẫn ────────────────────────────────────────────────── */}
        <div className="bg-secondary/10 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Smartphone
              className="w-4 h-4 text-secondary-700 shrink-0"
              aria-hidden="true"
            />
            <p className="text-xs font-semibold text-secondary-800">
              Hướng dẫn thanh toán
            </p>
          </div>
          {[
            "Mở ứng dụng ngân hàng và chọn chuyển khoản",
            "Quét mã QR hoặc nhập số tài khoản thủ công",
            "Nhập đúng số tiền và nội dung chuyển khoản",
            'Sau khi chuyển thành công, bấm "Tôi đã chuyển khoản"',
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span
                className="shrink-0 w-5 h-5 rounded-full bg-secondary/30 text-secondary-800 text-xs font-bold flex items-center justify-center mt-0.5"
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <p className="text-xs text-secondary-900 leading-relaxed">{step}</p>
            </div>
          ))}
        </div>

        {/* ── Lưu ý quan trọng ─────────────────────────────────────────── */}
        <p className="text-xs text-dark/40 text-center leading-relaxed">
          ⚠️ Nhập đúng nội dung chuyển khoản để hệ thống tự động đối soát.
          Sai nội dung có thể làm chậm xác nhận.
        </p>
      </div>
    </Modal>
  );
}
