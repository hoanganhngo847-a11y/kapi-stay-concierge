"use client";

import * as React from "react";
import { Clock, RefreshCw, AlertCircle, Loader2 } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  getGuestTicketsAction,
  type GuestTicketStatusRecord,
  type GuestTicketCanonicalStatus,
} from "./actions";

export interface GuestTicketStatusListProps {
  bookingId: string;
  refreshKey?: number;
  className?: string;
}

const STATUS_CONFIG: Record<
  GuestTicketCanonicalStatus,
  { label: string; variant: "warning" | "primary" | "success" }
> = {
  pending: {
    label: "Đang chờ tiếp nhận",
    variant: "warning",
  },
  in_progress: {
    label: "Đang xử lý",
    variant: "primary",
  },
  resolved: {
    label: "Đã xong",
    variant: "success",
  },
};

function formatTicketDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return dateStr;
  }
}

export function GuestTicketStatusList({
  bookingId,
  refreshKey = 0,
  className,
}: GuestTicketStatusListProps) {
  const [tickets, setTickets] = React.useState<GuestTicketStatusRecord[]>([]);
  const [isLoading, setIsLoading] = React.useState(() => Boolean(bookingId));
  const [error, setError] = React.useState<string | null>(null);

  const requestIdRef = React.useRef(0);

  // Đồng bộ state khi bookingId thay đổi:
  // Clear tickets ngay lập tức để không lộ vé của booking trước,
  // reset error và thiết lập loading state cho booking mới.
  const [prevBookingId, setPrevBookingId] = React.useState(bookingId);
  if (bookingId !== prevBookingId) {
    setPrevBookingId(bookingId);
    setTickets([]);
    setError(null);
    setIsLoading(Boolean(bookingId));
  }

  // Hợp nhất logic load vào một hàm duy nhất với sequence guard chống race condition
  const loadTickets = React.useCallback(async () => {
    if (!bookingId) {
      return;
    }

    setIsLoading(true);
    setError(null);

    const currentRequestId = ++requestIdRef.current;

    try {
      const res = await getGuestTicketsAction(bookingId);

      // Guard: loại bỏ response stale nếu có request mới hơn
      if (currentRequestId !== requestIdRef.current) {
        return;
      }

      if (res.success) {
        setTickets(res.data);
      } else {
        setError(res.error);
      }
    } catch {
      if (currentRequestId !== requestIdRef.current) {
        return;
      }
      setError(
        "Không thể tải danh sách yêu cầu hỗ trợ lúc này. Vui lòng thử lại sau."
      );
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [bookingId]);

  // Tải danh sách khi mount, khi bookingId thay đổi hoặc khi refreshKey thay đổi (TicketModal onSuccess)
  React.useEffect(() => {
    void Promise.resolve().then(() => {
      void loadTickets();
    });

    return () => {
      // Invalidate in-flight request khi unmount hoặc effect cleanup
      requestIdRef.current += 1;
    };
  }, [bookingId, refreshKey, loadTickets]);

  const handleRefresh = () => {
    if (isLoading || !bookingId) return;
    void loadTickets();
  };

  return (
    <section
      className={cn(
        "bg-white rounded-2xl border border-dark/10 p-5 sm:p-6 shadow-sm space-y-4",
        className
      )}
    >
      {/* Header với tiêu đề và nút Làm mới */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-dark/10">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-primary" />
          <h2 className="text-base sm:text-lg font-bold text-dark tracking-tight">
            Yêu cầu hỗ trợ đã gửi
          </h2>
          {tickets.length > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              {tickets.length}
            </span>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isLoading || !bookingId}
          leftIcon={
            <RefreshCw
              className={cn("w-3.5 h-3.5", isLoading && "animate-spin")}
              aria-hidden="true"
            />
          }
          className="text-xs h-8 px-3"
        >
          Làm mới
        </Button>
      </div>

      {/* Trạng thái Loading */}
      {isLoading && tickets.length === 0 ? (
        <div className="flex items-center justify-center gap-2.5 py-8 text-dark/60 text-xs sm:text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
          <span>Đang tải danh sách yêu cầu hỗ trợ...</span>
        </div>
      ) : error ? (
        /* Trạng thái Error */
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-start justify-between gap-3 animate-in fade-in"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span className="leading-snug">{error}</span>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            className="text-xs font-semibold underline text-rose-700 hover:text-rose-900 shrink-0"
          >
            Thử lại
          </button>
        </div>
      ) : tickets.length === 0 ? (
        /* Trạng thái Empty */
        <div className="text-center py-6 px-4 text-xs sm:text-sm text-dark/50 bg-light/30 rounded-xl border border-dashed border-dark/15">
          Bạn chưa có yêu cầu hỗ trợ nào cho kỳ nghỉ này.
        </div>
      ) : (
        /* Danh sách Tickets */
        <div className="space-y-3">
          {tickets.map((ticket) => {
            const statusInfo = STATUS_CONFIG[ticket.status] || {
              label: ticket.status,
              variant: "neutral" as const,
            };

            return (
              <div
                key={ticket.id}
                className="p-4 rounded-xl border border-dark/10 bg-dark/2 hover:bg-dark/4 transition-colors space-y-2.5 text-xs sm:text-sm"
              >
                {/* Header hàng ticket: Category + Mã rút gọn + Badge trạng thái */}
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-dark text-sm sm:text-base">
                        {ticket.category}
                      </span>
                      <span className="font-mono text-[11px] sm:text-xs text-dark/50 font-medium">
                        #{ticket.id.slice(0, 8).toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <Badge variant={statusInfo.variant} size="sm" dot>
                    {statusInfo.label}
                  </Badge>
                </div>

                {/* Mô tả chi tiết */}
                <p className="text-dark/80 whitespace-pre-wrap leading-relaxed">
                  {ticket.description}
                </p>

                {/* Thời gian gửi / cập nhật */}
                <div className="flex items-center gap-1.5 text-[11px] text-dark/50 pt-1 border-t border-dark/5">
                  <Clock className="w-3.5 h-3.5 text-dark/40 shrink-0" />
                  <span>Gửi lúc: {formatTicketDate(ticket.created_at)}</span>
                  {ticket.updated_at && ticket.updated_at !== ticket.created_at && (
                    <span className="hidden sm:inline">
                      • Cập nhật: {formatTicketDate(ticket.updated_at)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default GuestTicketStatusList;
