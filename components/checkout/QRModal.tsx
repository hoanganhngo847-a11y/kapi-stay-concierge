"use client";

/**
 * @file components/checkout/QRModal.tsx
 * @owner TV4 — Linh (feat/booking-checkout)
 *
 * Modal hiển thị mã VietQR để thanh toán chuyển khoản.
 * Tích hợp nút copy STK, copy nội dung, và thông báo trạng thái chờ đối soát.
 *
 * Chỉ sử dụng: @/components/ui, @/lib/utils/format
 * KHÔNG sửa bất kỳ file nào ngoài components/checkout/**
 *
 * RE-REVIEW #2 — Điểm 1 (BLOCKER):
 * Đã XOÁ handleConfirmPayment / confirmPaymentAction / onPaymentSuccess.
 * User bấm nút xác nhận KHÔNG được phép kích hoạt finalize_verified_checkout_atomic
 * (service_role-only RPC). Sau khi quét QR và chuyển khoản, UI hiển thị trạng thái
 * chờ xác nhận trung tính — việc finalize booking sẽ do payment webhook xử lý
 * (TV1 + TV8 phụ trách riêng).
 *
 * RE-REVIEW #3 — Điểm 3:
 * Cập nhật wording trạng thái chờ thanh toán: bỏ câu hứa hẹn auto-verify,
 * thay bằng wording trung tính phản ánh đúng thực tế hệ thống.
 *
 * RE-REVIEW #2 — Điểm 3 (HIGH):
 * Đã XOÁ fallback tài khoản giả (MB / 0000000000 / KAPI STAY).
 * Ba biến môi trường là BẮT BUỘC:
 *   NEXT_PUBLIC_VIETQR_BANK_ID
 *   NEXT_PUBLIC_VIETQR_ACCOUNT_NO
 *   NEXT_PUBLIC_VIETQR_ACCOUNT_NAME
 * Nếu bất kỳ biến nào thiếu/rỗng → hiển thị "chưa khả dụng" thay vì render QR.
 */

import React, { useState, useCallback } from "react";
import {
  Copy,
  CheckCheck,
  ExternalLink,
  AlertCircle,
  Clock,
  Smartphone,
  Hourglass,
} from "lucide-react";
import { Modal, Button, Badge } from "@/components/ui";
import { formatVND } from "@/lib/utils/format";

// ---------------------------------------------------------------------------
// Cấu hình ngân hàng VietQR — bắt buộc từ biến môi trường
// ---------------------------------------------------------------------------

/**
 * Đọc từ biến môi trường — KHÔNG có fallback.
 * Khai báo trong .env.local (TV4 phối hợp TV1 để thiết lập):
 *   NEXT_PUBLIC_VIETQR_BANK_ID=<mã ngân hàng, ví dụ: MB, TCB, VCB...>
 *   NEXT_PUBLIC_VIETQR_ACCOUNT_NO=<số tài khoản>
 *   NEXT_PUBLIC_VIETQR_ACCOUNT_NAME=<tên chủ TK>
 */
const BANK_ID = process.env.NEXT_PUBLIC_VIETQR_BANK_ID ?? "";
const ACCOUNT_NO = process.env.NEXT_PUBLIC_VIETQR_ACCOUNT_NO ?? "";
const ACCOUNT_NAME = process.env.NEXT_PUBLIC_VIETQR_ACCOUNT_NAME ?? "";

/**
 * Số điện thoại hỗ trợ — tuỳ chọn.
 * Nếu không cấu hình: KHÔNG render link tel:, chỉ hiển thị text an toàn.
 *   NEXT_PUBLIC_SUPPORT_PHONE=<số điện thoại, ví dụ: +84901234567>
 */
const SUPPORT_PHONE = process.env.NEXT_PUBLIC_SUPPORT_PHONE?.trim() ?? "";

/**
 * Kiểm tra tất cả biến môi trường bắt buộc có giá trị hợp lệ.
 * Nếu bất kỳ biến nào thiếu/rỗng → không render QR.
 */
const VIETQR_CONFIG_VALID =
  BANK_ID.trim().length > 0 &&
  ACCOUNT_NO.trim().length > 0 &&
  ACCOUNT_NAME.trim().length > 0;

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
}

// ---------------------------------------------------------------------------
// Helper: sinh URL VietQR
// ---------------------------------------------------------------------------

function buildVietQRUrl(
  bankId: string,
  accountNo: string,
  accountName: string,
  amount: number,
  addInfo: string
): string {
  const encoded = encodeURIComponent(addInfo);
  return `https://img.vietqr.io/image/${bankId}-${accountNo}-compact2.png?amount=${amount}&addInfo=${encoded}&accountName=${encodeURIComponent(accountName)}`;
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
        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium",
        "transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#111111]",
        copied
          ? "bg-[#111111] text-white"
          : "bg-[#F5F5F5] text-[#111111] border border-[#E5E5E5] hover:bg-[#E5E5E5]",
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
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-[#E5E5E5] last:border-0">
      <span className="text-xs text-[#707072] font-medium shrink-0 pt-0.5 min-w-[90px]">
        {label}
      </span>
      <div className="flex flex-col items-end gap-1.5 min-w-0">
        <span
          className={[
            "text-sm font-medium text-right break-all",
            highlight ? "text-[#111111] text-base font-semibold" : "text-[#111111]",
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
// Sub-component: VietQRUnavailable — hiển thị khi thiếu env vars
// ---------------------------------------------------------------------------

function VietQRUnavailable({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      closeOnOverlayClick={true}
      size="sm"
      title="Thanh toán qua VietQR"
      description="Phương thức thanh toán QR"
      footer={
        <Button
          id="close-qr-unavailable-btn"
          variant="primary"
          size="md"
          onClick={onClose}
          className="w-full"
        >
          Đóng
        </Button>
      }
    >
      <div className="flex flex-col items-center text-center gap-4 py-4">
        <div className="w-14 h-14 rounded-full bg-[#F5F5F5] border border-[#E5E5E5] flex items-center justify-center">
          <AlertCircle className="w-7 h-7 text-[#111111]" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-medium text-[#111111] mb-1">
            Thanh toán qua VietQR hiện chưa khả dụng
          </p>
          <p className="text-xs text-[#707072] leading-relaxed">
            Vui lòng liên hệ lễ tân hoặc bộ phận hỗ trợ để hoàn tất thanh toán.
          </p>
        </div>
        {SUPPORT_PHONE ? (
          <a
            href={`tel:${SUPPORT_PHONE}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#111111] underline hover:opacity-80 transition-opacity"
          >
            Liên hệ hỗ trợ
          </a>
        ) : (
          <p className="text-sm font-medium text-[#707072]">
            Liên hệ lễ tân để được hỗ trợ
          </p>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main component: QRModal
// ---------------------------------------------------------------------------

export function QRModal({
  isOpen,
  onClose,
  sessionId: _sessionId, // eslint-disable-line @typescript-eslint/no-unused-vars
  amountVnd,
  paymentReference,
}: QRModalProps) {
  const [qrError, setQrError] = useState(false);

  // Đặt lại trạng thái khi modal đóng
  function handleClose() {
    onClose();
  }

  // Nếu thiếu cấu hình VietQR — hiển thị thông báo chưa khả dụng
  if (!VIETQR_CONFIG_VALID) {
    return <VietQRUnavailable onClose={onClose} />;
  }

  const qrUrl = buildVietQRUrl(BANK_ID, ACCOUNT_NO, ACCOUNT_NAME, amountVnd, paymentReference);

  // ---------------------------------------------------------------------------
  // Màn hình QR chính
  // ---------------------------------------------------------------------------
  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      closeOnOverlayClick={true}
      size="md"
      title="Thanh toán qua VietQR"
      description="Quét mã QR hoặc chuyển khoản theo thông tin bên dưới. Giữ nguyên nội dung chuyển khoản để hỗ trợ việc xác minh giao dịch."
      footer={
        <div className="flex flex-col gap-3 w-full">
          {/* Trạng thái chờ đối soát */}
          <div
            role="status"
            aria-live="polite"
            className="flex items-start gap-3 bg-[#F5F5F5] border border-[#E5E5E5] p-3.5 w-full text-left"
          >
            <Hourglass
              className="w-4 h-4 text-[#111111] shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <p className="text-xs text-[#111111] leading-relaxed">
              <span className="font-semibold">Đang chờ xác nhận thanh toán.</span>{" "}
              Đặt phòng sẽ được xác nhận sau khi hệ thống xác minh giao dịch thành công.
            </p>
          </div>

          <Button
            variant="primary"
            size="md"
            onClick={handleClose}
            className="w-full"
            id="close-qr-modal-btn"
          >
            Đóng
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* ── Cảnh báo thời hạn ───────────────────────────────────────── */}
        <div className="flex items-center gap-2.5 bg-[#F5F5F5] border border-[#E5E5E5] p-3">
          <Clock
            className="w-4 h-4 text-[#111111] shrink-0"
            aria-hidden="true"
          />
          <p className="text-xs text-[#111111] font-medium">
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
                className="w-52 h-52 border border-[#E5E5E5] object-contain bg-white p-2"
                onError={() => setQrError(true)}
                loading="eager"
              />
            ) : (
              <div className="w-52 h-52 border border-[#E5E5E5] bg-[#F5F5F5] flex flex-col items-center justify-center gap-2">
                <AlertCircle
                  className="w-8 h-8 text-[#707072]"
                  aria-hidden="true"
                />
                <p className="text-xs text-[#707072] text-center px-4">
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
              className="inline-flex items-center gap-1 text-xs text-[#707072] hover:text-[#111111] transition-colors"
              aria-label="Mở ảnh QR trong tab mới"
            >
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
              Mở ảnh lớn hơn
            </a>
          </div>
        </div>

        {/* ── Thông tin chuyển khoản ────────────────────────────────────── */}
        <div
          className="bg-white border border-[#E5E5E5] px-4 py-1"
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
        <div className="bg-[#F5F5F5] p-4 border border-[#E5E5E5] space-y-2.5 text-left">
          <div className="flex items-center gap-2 mb-1">
            <Smartphone
              className="w-4 h-4 text-[#111111] shrink-0"
              aria-hidden="true"
            />
            <p className="text-xs font-semibold text-[#111111]">
              Hướng dẫn thanh toán
            </p>
          </div>
          {[
            "Mở ứng dụng ngân hàng và chọn chuyển khoản",
            "Quét mã QR hoặc nhập số tài khoản thủ công",
            "Nhập đúng số tiền và nội dung chuyển khoản",
            "Sau khi chuyển khoản, vui lòng chờ hệ thống xác minh giao dịch. Đặt phòng chỉ được xác nhận sau khi giao dịch được xác minh thành công.",
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span
                className="shrink-0 w-5 h-5 rounded-full bg-[#111111] text-white text-[11px] font-medium flex items-center justify-center mt-0.5"
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <p className="text-xs text-[#111111] leading-relaxed">{step}</p>
            </div>
          ))}
        </div>

        {/* ── Lưu ý quan trọng ─────────────────────────────────────────── */}
        <p className="text-xs text-[#707072] text-center leading-relaxed">
          ⚠️ Nhập đúng nội dung chuyển khoản để hỗ trợ việc xác minh giao dịch.
          Sai nội dung có thể làm chậm quá trình xác nhận.
        </p>
      </div>
    </Modal>
  );
}
