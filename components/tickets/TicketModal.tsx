"use client";

import * as React from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Send,
} from "lucide-react";
import { Badge, Button, Modal } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { Tables, TablesInsert } from "@/lib/database.types";
import {
  VALID_TICKET_CATEGORIES,
  isValidTicketCategory,
  type TicketCategory,
} from "./constants";
import { createGuestTicketAction } from "./actions";

export type Ticket = Tables<"tickets">;
export type TicketInsert = TablesInsert<"tickets">;

export { VALID_TICKET_CATEGORIES, isValidTicketCategory };
export type { TicketCategory };

export interface TicketFormData {
  category: TicketCategory;
  description: string;
  imageUrl?: string;
}

export interface TicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingId?: string;
  roomId?: string;
  onSuccess?: (ticket: Ticket) => void;
  onSubmit?: (ticket: Ticket) => Promise<unknown> | unknown;
}

export const TICKET_CATEGORIES: {
  value: TicketCategory;
  label: string;
  hint: string;
}[] = [
  {
    value: "Khóa kẹt",
    label: "Khóa kẹt",
    hint: "Không mở được khóa thông minh, thẻ từ không nhận hoặc kẹt chốt",
  },
  {
    value: "Thiết bị hỏng",
    label: "Thiết bị hỏng",
    hint: "Điều hòa, bình nóng lạnh, tivi, quạt, đèn hoặc thiết bị điện",
  },
  {
    value: "Vệ sinh chưa sạch",
    label: "Vệ sinh chưa sạch",
    hint: "Ga trải giường, khăn tắm, phòng vệ sinh hoặc rác chưa dọn",
  },
  {
    value: "Tiếng ồn",
    label: "Tiếng ồn",
    hint: "Tiếng ồn từ phòng lân cận, hành lang hoặc khu vực xung quanh",
  },
  {
    value: "Yêu cầu khác",
    label: "Yêu cầu khác",
    hint: "Mượn thêm vật dụng, hỗ trợ vận chuyển hoặc dịch vụ lưu trú",
  },
];

export const INVALID_STAY_ERROR_MESSAGE =
  "Không tìm thấy thông tin đặt phòng hợp lệ.";

export function TicketModal({
  isOpen,
  onClose,
  bookingId,
  roomId,
  onSuccess,
  onSubmit,
}: TicketModalProps) {
  const [prevIsOpen, setPrevIsOpen] = React.useState(isOpen);
  const [category, setCategory] = React.useState<TicketCategory | "">("");
  const [description, setDescription] = React.useState("");

  const [errors, setErrors] = React.useState<{
    category?: string;
    description?: string;
  }>({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [isSuccess, setIsSuccess] = React.useState(false);
  const [submittedTicket, setSubmittedTicket] = React.useState<Ticket | null>(null);

  const hasStayInfo = Boolean(bookingId?.trim() && roomId?.trim());

  // Khôi phục trạng thái mặc định khi modal mở lại mà không gây cascading render trong effect
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setCategory("");
      setDescription("");
      setErrors({});
      setSubmitError(null);
      setIsSuccess(false);
      setSubmittedTicket(null);
    }
  }

  const handleResetForm = () => {
    setCategory("");
    setDescription("");
    setErrors({});
    setSubmitError(null);
    setIsSuccess(false);
    setSubmittedTicket(null);
  };

  const handleCloseModal = () => {
    if (isSubmitting) return;
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // 1. Kiểm tra thông tin định danh phòng và booking
    if (!bookingId?.trim() || !roomId?.trim() || !hasStayInfo) {
      setSubmitError(INVALID_STAY_ERROR_MESSAGE);
      return;
    }

    // 2. Validate dữ liệu nhập
    const validationErrors: typeof errors = {};

    if (!category || !isValidTicketCategory(category)) {
      validationErrors.category = "Vui lòng chọn loại sự cố hoặc yêu cầu cần hỗ trợ";
    }

    const trimmedDescription = description.trim();
    if (!trimmedDescription) {
      validationErrors.description = "Vui lòng nhập mô tả chi tiết sự cố";
    } else if (trimmedDescription.length < 5) {
      validationErrors.description = "Mô tả cần ít nhất 5 ký tự để lễ tân nắm bắt sự cố";
    }

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const cleanBookingId = bookingId.trim();
      const cleanRoomId = roomId.trim();

      // C.7: The modal MUST ALWAYS call and await createGuestTicketAction to enforce persistence boundary
      const res = await createGuestTicketAction({
        bookingId: cleanBookingId,
        roomId: cleanRoomId,
        category,
        description: trimmedDescription,
      });

      // If createGuestTicketAction fails: set error state, DO NOT call onSubmit, keep isSuccess(false)
      if (!res.success) {
        setSubmittedTicket(null);
        setIsSuccess(false);
        setSubmitError(res.error);
        return;
      }

      // If and only if createGuestTicketAction succeeds and returns a persisted ticket:
      if (
        res.ticket &&
        typeof res.ticket === "object" &&
        typeof res.ticket.id === "string" &&
        res.ticket.id.trim().length > 0
      ) {
        setSubmittedTicket(res.ticket);
        setIsSuccess(true);
        await onSubmit?.(res.ticket);
        onSuccess?.(res.ticket);
      } else {
        setSubmittedTicket(null);
        setIsSuccess(false);
        setSubmitError("Không thể xác nhận lưu trữ yêu cầu hỗ trợ.");
      }
    } catch {
      setSubmittedTicket(null);
      setIsSuccess(false);
      setSubmitError("Không thể tạo yêu cầu hỗ trợ lúc này. Vui lòng thử lại sau.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCategoryInfo = TICKET_CATEGORIES.find((c) => c.value === category);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCloseModal}
      size="md"
      title={
        isSuccess ? undefined : (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary" />
            <span className="text-dark font-semibold text-lg">
              Báo cáo sự cố & Hỗ trợ
            </span>
          </div>
        )
      }
      description={
        isSuccess
          ? undefined
          : "Gửi thông tin trực tiếp đến đội ngũ lễ tân và kỹ thuật Kapi Stay Concierge."
      }
    >
      {isSuccess ? (
        /* =================== GIAO DIỆN PHẢN HỒI THÀNH CÔNG (SPA) =================== */
        <div className="flex flex-col items-center text-center py-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mb-4 shadow-sm">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <h4 className="text-xl font-bold text-dark mb-1.5">
            Gửi yêu cầu thành công!
          </h4>
          <p className="text-sm text-dark/70 max-w-sm leading-relaxed mb-6">
            Yêu cầu của bạn đã được ghi nhận. Quản gia hoặc bộ phận kỹ thuật sẽ
            liên hệ hoặc tới hỗ trợ trong ít phút.
          </p>

          <div className="w-full bg-dark/2 rounded-xl p-4 border border-dark/10 text-left space-y-2.5 mb-6 text-xs sm:text-sm">
            <div className="flex items-center justify-between">
              <span className="text-dark/60">Trạng thái:</span>
              <Badge variant="warning" size="sm">
                Đang chờ tiếp nhận
              </Badge>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-dark/60">Loại sự cố:</span>
              <span className="font-medium text-dark">{category}</span>
            </div>

            {submittedTicket?.id && (
              <div className="flex items-center justify-between">
                <span className="text-dark/60">Mã yêu cầu:</span>
                <span className="font-mono font-medium text-dark">
                  #{submittedTicket.id.slice(0, 8).toUpperCase()}
                </span>
              </div>
            )}

            <div className="flex items-start justify-between pt-1">
              <span className="text-dark/60 shrink-0 mr-3">Nội dung:</span>
              <span className="font-normal text-dark text-right line-clamp-2">
                {description}
              </span>
            </div>
          </div>

          <div className="w-full flex flex-col sm:flex-row items-center gap-3">
            <Button
              variant="outline"
              onClick={handleResetForm}
              className="w-full sm:w-1/2"
            >
              Gửi yêu cầu khác
            </Button>
            <Button
              variant="primary"
              onClick={handleCloseModal}
              className="w-full sm:w-1/2"
            >
              Hoàn tất & Đóng
            </Button>
          </div>
        </div>
      ) : (
        /* =================== FORM NHẬP YÊU CẦU HỖ TRỢ =================== */
        <form onSubmit={handleSubmit} className="space-y-4 pt-1" noValidate>
          {!hasStayInfo ? (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-start gap-2.5 animate-in fade-in"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 leading-snug">
                {INVALID_STAY_ERROR_MESSAGE}
              </div>
            </div>
          ) : submitError ? (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-start gap-2.5 animate-in fade-in"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 leading-snug">{submitError}</div>
            </div>
          ) : null}

          {/* 1. Dropdown chọn loại sự cố */}
          <div className="w-full flex flex-col gap-1.5">
            <label
              htmlFor="ticket-category-select"
              className="text-sm font-medium text-dark/90 flex items-center justify-between"
            >
              <span>
                Loại sự cố / Yêu cầu <span className="text-rose-500">*</span>
              </span>
              <span className="text-xs text-dark/40 font-normal">
                (Chọn danh mục phù hợp)
              </span>
            </label>

            <div className="relative">
              <select
                id="ticket-category-select"
                value={category}
                disabled={!hasStayInfo || isSubmitting}
                onChange={(e) => {
                  setCategory(e.target.value as TicketCategory);
                  if (errors.category) {
                    setErrors((prev) => ({ ...prev, category: undefined }));
                  }
                }}
                className={cn(
                  "w-full h-11 px-3.5 pr-10 text-sm bg-white text-dark rounded-lg border transition-colors appearance-none",
                  "focus:outline-none focus:ring-2",
                  errors.category
                    ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500/20 text-rose-950"
                    : "border-dark/20 focus:border-primary focus:ring-primary/20",
                  (!hasStayInfo || isSubmitting) && "bg-dark/5 text-dark/40 cursor-not-allowed"
                )}
              >
                <option value="" disabled>
                  -- Chọn loại sự cố hoặc yêu cầu trợ giúp --
                </option>
                {TICKET_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>

              <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-dark/40">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>

            {errors.category ? (
              <p className="text-xs font-medium text-rose-600 animate-in fade-in">
                {errors.category}
              </p>
            ) : selectedCategoryInfo ? (
              <p className="text-xs text-dark/60 animate-in fade-in">
                {selectedCategoryInfo.hint}
              </p>
            ) : null}
          </div>

          {/* 2. Textarea mô tả chi tiết */}
          <div className="w-full flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="ticket-description-input"
                className="text-sm font-medium text-dark/90"
              >
                Mô tả chi tiết <span className="text-rose-500">*</span>
              </label>
              <span className="text-xs text-dark/40">
                {description.trim().length} ký tự
              </span>
            </div>

            <textarea
              id="ticket-description-input"
              rows={3}
              value={description}
              disabled={!hasStayInfo || isSubmitting}
              placeholder="Vui lòng mô tả cụ thể tình trạng sự cố (ví dụ: Khóa cửa phòng không nhận mã pin, điều hòa thổi gió yếu không mát...)"
              onChange={(e) => {
                setDescription(e.target.value);
                if (errors.description) {
                  setErrors((prev) => ({ ...prev, description: undefined }));
                }
              }}
              className={cn(
                "w-full p-3.5 text-sm bg-white text-dark rounded-lg border transition-colors resize-y min-h-[90px] max-h-[180px]",
                "placeholder:text-dark/40",
                "focus:outline-none focus:ring-2",
                errors.description
                  ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500/20 text-rose-950"
                  : "border-dark/20 focus:border-primary focus:ring-primary/20",
                (!hasStayInfo || isSubmitting) &&
                  "bg-dark/5 text-dark/40 cursor-not-allowed"
              )}
            />

            {errors.description ? (
              <p className="text-xs font-medium text-rose-600 animate-in fade-in">
                {errors.description}
              </p>
            ) : (
              <p className="text-xs text-dark/60">
                Mô tả chi tiết vị trí và hiện tượng giúp nhân viên mang đúng thiết
                bị sửa chữa.
              </p>
            )}
          </div>

          {/* Footer nút bấm */}
          <div className="pt-3 border-t border-dark/10 flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleCloseModal}
              disabled={isSubmitting}
            >
              Hủy
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isSubmitting}
              disabled={!hasStayInfo || isSubmitting}
              leftIcon={<Send className="w-4 h-4" />}
            >
              Gửi yêu cầu
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export default TicketModal;
