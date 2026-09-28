"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  closeOnOverlayClick?: boolean;
}

const modalSizes: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
  closeOnOverlayClick = true,
}) => {
  // Đảm bảo chỉ render Portal trên Client
  const isMounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  // Khóa cuộn trang (lock body scroll) và bù trừ thanh cuộn tránh layout shift
  React.useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;

    // Đo độ rộng thanh cuộn của trình duyệt
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      const currentPadding =
        parseFloat(window.getComputedStyle(document.body).paddingRight) || 0;
      document.body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
    };
  }, [isOpen]);

  // Đóng modal khi nhấn phím Escape
  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isMounted || !isOpen) {
    return null;
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 transition-opacity duration-250 animate-in fade-in"
        onClick={closeOnOverlayClick ? onClose : undefined}
        aria-hidden="true"
      />

      {/* Modal Dialog Content */}
      <div
        className={cn(
          "relative w-full bg-white text-[#111111] border border-[#E5E5E5] overflow-hidden z-10",
          "transform transition-all duration-250 ease-[cubic-bezier(0.16,1,0.3,1)] animate-in fade-in zoom-in-[0.98] slide-in-from-bottom-2",
          modalSizes[size],
          className
        )}
      >
        {/* Header */}
        {(title || description) && (
          <div className="px-6 pt-6 pb-4 border-b border-[#E5E5E5] pr-14">
            {title && (
              <h3 className="text-lg font-semibold text-[#111111] leading-none">
                {title}
              </h3>
            )}
            {description && (
              <p className="text-sm text-[#707072] mt-2 leading-relaxed">
                {description}
              </p>
            )}
          </div>
        )}

        {/* Nút đóng (X) */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng hộp thoại"
          className="absolute top-4 right-4 p-2 rounded-full text-[#707072] hover:text-[#111111] hover:bg-[#F5F5F5] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111111]/30"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>

        {/* Body Content */}
        <div className="px-6 py-5 max-h-[calc(85vh-140px)] overflow-y-auto">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 bg-[#F5F5F5]/60 border-t border-[#E5E5E5] flex items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

Modal.displayName = "Modal";
