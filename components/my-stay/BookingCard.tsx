"use client";

import React from "react";
import Link from "next/link";
import { DoorOpen, ArrowRight, MapPin } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { formatVND } from "@/lib/utils/format";
import type { MyStayBookingSummary } from "@/lib/data/my-stay";

interface BookingCardProps {
  booking: MyStayBookingSummary;
}

function formatIntervalItem(dtStr?: string | null, dateFallback?: string | null): string {
  const target = dtStr || dateFallback;
  if (!target) return "—";
  try {
    const d = new Date(target);
    if (isNaN(d.getTime())) return target;
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    if (dtStr && dtStr.includes("T")) {
      const hours = String(d.getHours()).padStart(2, "0");
      const minutes = String(d.getMinutes()).padStart(2, "0");
      return `${day}/${month}/${year} — ${hours}:${minutes}`;
    }
    return `${day}/${month}/${year}`;
  } catch {
    return target;
  }
}

export function BookingCard({ booking }: BookingCardProps) {
  const coverImage =
    booking.roomImages && booking.roomImages.length > 0
      ? booking.roomImages[0]
      : null;

  const badgeConfig = {
    ACTIVE: {
      label: "Đang lưu trú",
      variant: "primary" as const,
    },
    UPCOMING: {
      label: "Sắp diễn ra",
      variant: "primary" as const,
    },
    COMPLETED: {
      label: "Đã hoàn thành",
      variant: "neutral" as const,
    },
    CANCELLED: {
      label: "Đã hủy",
      variant: "danger" as const,
    },
  }[booking.stayStatus] ?? {
    label: booking.stayStatus,
    variant: "neutral" as const,
  };

  const isPaymentPaid =
    booking.paymentStatus === "COMPLETED" ||
    booking.paymentStatus === "PAID" ||
    booking.paymentStatus === "confirmed";

  const paymentLabel = isPaymentPaid
    ? "Đã thanh toán"
    : booking.paymentStatus === "PENDING"
    ? "Chờ thanh toán"
    : booking.paymentStatus === "FAILED"
    ? "Thanh toán thất bại"
    : booking.paymentStatus;

  const checkInDisplay = formatIntervalItem(booking.checkInAt, booking.checkIn);
  const checkOutDisplay = formatIntervalItem(booking.checkOutAt, booking.checkOut);

  return (
    <div className="group block bg-white border border-[#E5E5E5] hover:border-[#111111] transition-all duration-200 overflow-hidden flex flex-col">
      {/* 1. Room Image */}
      <Link
        href={`/my-stay?bookingId=${encodeURIComponent(booking.bookingId)}`}
        className="relative aspect-[16/10] w-full overflow-hidden bg-[#F5F5F5] block select-none"
      >
        {coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverImage}
            alt={booking.roomName}
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-[#707072]">
            <DoorOpen className="w-8 h-8 stroke-1 mb-1.5" />
            <span className="text-[11px] uppercase tracking-widest font-mono">
              Kapi Stay
            </span>
          </div>
        )}

        <div className="absolute top-3 right-3">
          <Badge variant={badgeConfig.variant} size="sm">
            {badgeConfig.label}
          </Badge>
        </div>
      </Link>

      {/* 2. Room & Property Info */}
      <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
        <div className="space-y-2">
          <div>
            <Link
              href={`/my-stay?bookingId=${encodeURIComponent(booking.bookingId)}`}
              className="text-base sm:text-lg font-medium text-[#111111] group-hover:underline underline-offset-4 line-clamp-1"
            >
              {booking.roomName}
            </Link>
            <p className="text-xs text-[#707072] mt-0.5 flex items-start gap-1">
              <MapPin className="w-3.5 h-3.5 text-[#707072] shrink-0 mt-0.5" />
              <span className="line-clamp-1">{booking.propertyName}</span>
            </p>
          </div>

          {/* Stay Date/Time Interval */}
          <div className="p-3 bg-[#F5F5F5] border border-[#E5E5E5] text-xs space-y-1">
            <div className="flex items-center justify-between text-[#111111] font-mono">
              <span className="text-[#707072] text-[11px] uppercase tracking-wider font-sans">
                Nhận phòng
              </span>
              <span>{checkInDisplay}</span>
            </div>
            <div className="flex items-center justify-between text-[#111111] font-mono border-t border-[#E5E5E5] pt-1">
              <span className="text-[#707072] text-[11px] uppercase tracking-wider font-sans">
                Trả phòng
              </span>
              <span>{checkOutDisplay}</span>
            </div>
          </div>
        </div>

        {/* 3. Footer: Payment, Total, CTA */}
        <div className="pt-3 border-t border-[#E5E5E5] flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] text-[#707072]">
              Thanh toán:{" "}
              <span className="font-medium text-[#111111]">{paymentLabel}</span>
            </p>
            <p className="text-sm font-semibold text-[#111111] mt-0.5">
              Tổng: {formatVND(booking.finalPaidAmount)}
            </p>
          </div>

          <Link href={`/my-stay?bookingId=${encodeURIComponent(booking.bookingId)}`}>
            <Button
              variant="outline"
              size="sm"
              className="group-hover:bg-[#111111] group-hover:text-white group-hover:border-[#111111] transition-colors gap-1.5"
            >
              <span>Xem chi tiết</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default BookingCard;
