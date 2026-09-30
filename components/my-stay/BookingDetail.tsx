"use client";

import React, { useState } from "react";
import {
  ArrowLeft,
  MapPin,
  ExternalLink,
  Lock,
  Coffee,
  CheckCircle2,
} from "lucide-react";
import { Badge, Reveal } from "@/components/ui";
import { KeyCard } from "@/components/my-stay/KeyCard";
import WifiWidget from "@/components/my-stay/WifiWidget";
import { QuickActions } from "@/components/my-stay/QuickActions";
import {
  GuestGuide,
  DEFAULT_DEVICE_INSTRUCTIONS,
} from "@/components/tickets/GuestGuide";
import { TicketModal } from "@/components/tickets/TicketModal";
import { GuestTicketStatusList } from "@/components/tickets/GuestTicketStatusList";
import { formatVND } from "@/lib/utils/format";
import { formatStayDateTime } from "@/lib/utils/stay";
import type { MyStayBookingDetails } from "@/lib/data/my-stay";

interface BookingDetailProps {
  stayData: MyStayBookingDetails;
  onBack: () => void;
}

function calculateStayDuration(
  checkInAt?: string | null,
  checkOutAt?: string | null,
  checkIn?: string | null,
  checkOut?: string | null
): string {
  const start = checkInAt || checkIn;
  const end = checkOutAt || checkOut;
  if (!start || !end) return "";
  try {
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    if (isNaN(startTime) || isNaN(endTime) || endTime <= startTime) return "";
    const totalMinutes = Math.round((endTime - startTime) / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;
      if (remainingHours === 0) {
        return `${days} ngày`;
      }
      return `${days} ngày ${remainingHours} giờ`;
    }
    if (minutes > 0) {
      return `${hours} giờ ${minutes} phút`;
    }
    return `${hours} giờ`;
  } catch {
    return "";
  }
}

export function BookingDetail({ stayData, onBack }: BookingDetailProps) {
  const [isTicketOpen, setIsTicketOpen] = useState(false);
  const [ticketRefreshKey, setTicketRefreshKey] = useState(0);

  const canReportIssue = Boolean(
    stayData.isActiveStay && stayData.hasActiveCredential
  );

  const durationStr = calculateStayDuration(
    stayData.checkInAt,
    stayData.checkOutAt,
    stayData.checkIn,
    stayData.checkOut
  );

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
  }[stayData.stayStatus] ?? {
    label: stayData.stayStatus,
    variant: "neutral" as const,
  };

  const isPaymentPaid =
    stayData.paymentStatus === "COMPLETED" ||
    stayData.paymentStatus === "PAID" ||
    stayData.paymentStatus === "confirmed";

  const paymentLabel = isPaymentPaid
    ? "Đã thanh toán"
    : stayData.paymentStatus === "PENDING"
    ? "Chờ thanh toán"
    : stayData.paymentStatus === "FAILED"
    ? "Thanh toán thất bại"
    : stayData.paymentStatus;

  const heroImage =
    stayData.roomImages && stayData.roomImages.length > 0
      ? stayData.roomImages[0]
      : null;

  return (
    <div className="space-y-6">
      {/* Top Navigation: Back Button */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-[#111111] hover:underline underline-offset-4 py-1"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kỳ nghỉ của tôi</span>
        </button>

        <Badge variant={badgeConfig.variant} size="md">
          {badgeConfig.label}
        </Badge>
      </div>

      {/* A. Room Hero & Property Card */}
      <Reveal distance={12} delay={0}>
        <section className="bg-white border border-[#E5E5E5] overflow-hidden">
          {heroImage && (
            <div className="aspect-[21/9] sm:aspect-[24/9] w-full overflow-hidden bg-[#F5F5F5]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={heroImage}
                alt={stayData.roomName}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div className="p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-3 pb-5 border-b border-[#E5E5E5]">
              <div>
                <span className="text-[11px] font-medium tracking-widest uppercase text-[#707072] block mb-1">
                  Điểm đến & Phòng
                </span>
                <h1 className="text-2xl sm:text-3xl font-normal text-[#111111] tracking-tight">
                  {stayData.roomName}
                </h1>
                <p className="text-sm font-medium text-[#111111] mt-1">
                  {stayData.propertyName}
                </p>
                <p className="text-xs sm:text-sm text-[#707072] mt-1 flex items-start gap-1">
                  <MapPin className="w-3.5 h-3.5 text-[#707072] shrink-0 mt-0.5" />
                  <span>{stayData.propertyAddress}</span>
                </p>
              </div>

              {stayData.propertyMapsUrl && (
                <div className="shrink-0">
                  <a
                    href={stayData.propertyMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-[#111111] font-medium hover:underline underline-offset-4"
                  >
                    <span>Xem vị trí Google Maps</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>

            {stayData.roomDescription && (
              <p className="text-xs sm:text-sm text-[#707072] leading-relaxed">
                {stayData.roomDescription}
              </p>
            )}

            {/* Stay & Payment Specs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs sm:text-sm">
              <div className="p-4 bg-[#F5F5F5] border border-[#E5E5E5]">
                <span className="text-[#707072] block text-[11px] uppercase tracking-wider mb-1">
                  Nhận phòng
                </span>
                <span className="font-medium text-[#111111] block font-mono">
                  {stayData.checkInAt
                    ? formatStayDateTime(stayData.checkInAt)
                    : stayData.checkIn}
                </span>
              </div>

              <div className="p-4 bg-[#F5F5F5] border border-[#E5E5E5]">
                <span className="text-[#707072] block text-[11px] uppercase tracking-wider mb-1">
                  Trả phòng
                </span>
                <span className="font-medium text-[#111111] block font-mono">
                  {stayData.checkOutAt
                    ? formatStayDateTime(stayData.checkOutAt)
                    : stayData.checkOut}
                </span>
                {durationStr && (
                  <span className="text-[11px] text-[#707072] mt-0.5 block">
                    Thời lượng: {durationStr}
                  </span>
                )}
              </div>

              <div className="p-4 bg-[#F5F5F5] border border-[#E5E5E5]">
                <span className="text-[#707072] block text-[11px] uppercase tracking-wider mb-1">
                  Thanh toán
                </span>
                <div className="flex items-center gap-1.5 font-medium text-[#111111]">
                  {isPaymentPaid && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#111111]" />
                  )}
                  <span>{paymentLabel}</span>
                </div>
                <span className="text-[11px] text-[#707072] mt-0.5 block font-semibold">
                  {formatVND(stayData.finalPaidAmount)}
                </span>
              </div>

              <div className="p-4 bg-[#F5F5F5] border border-[#E5E5E5]">
                <span className="text-[#707072] block text-[11px] uppercase tracking-wider mb-1">
                  Mã đơn (Booking ID)
                </span>
                <span
                  className="font-mono text-[#111111] font-medium text-xs break-all block"
                  title={stayData.bookingId}
                >
                  {stayData.bookingId}
                </span>
              </div>
            </div>
          </div>
        </section>
      </Reveal>

      {/* B. Room Amenities */}
      {stayData.roomAmenities && stayData.roomAmenities.length > 0 && (
        <Reveal distance={12} delay={40}>
          <section className="bg-white border border-[#E5E5E5] p-6 sm:p-8 space-y-4">
            <div>
              <span className="text-[11px] font-medium uppercase tracking-wider text-[#707072] block mb-1">
                Tiện nghi phòng
              </span>
              <h3 className="text-lg font-medium text-[#111111]">
                Trang thiết bị & Tiện ích
              </h3>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              {stayData.roomAmenities.map((amenity, idx) => (
                <span
                  key={idx}
                  className="px-3 py-1.5 bg-[#F5F5F5] border border-[#E5E5E5] text-xs text-[#111111] rounded-full"
                >
                  {amenity}
                </span>
              ))}
            </div>
          </section>
        </Reveal>
      )}

      {/* C. F&B Ordered Section (Cleanly hidden if none) */}
      {stayData.menuItems && stayData.menuItems.length > 0 && (
        <Reveal distance={12} delay={60}>
          <section className="bg-white border border-[#E5E5E5] p-6 sm:p-8 space-y-5">
            <div className="flex items-center justify-between border-b border-[#E5E5E5] pb-4">
              <div>
                <span className="text-[11px] font-medium uppercase tracking-wider text-[#707072] block mb-1">
                  Ẩm thực & Dịch vụ đi kèm
                </span>
                <h3 className="text-lg font-medium text-[#111111]">
                  Menu F&B đã đặt
                </h3>
              </div>
              <Coffee className="w-5 h-5 text-[#707072]" />
            </div>

            <div className="divide-y divide-[#E5E5E5]">
              {stayData.menuItems.map((item) => {
                const isReward = item.sourceType === "REWARD";
                return (
                  <div
                    key={item.id}
                    className="py-3.5 flex items-center justify-between gap-3 text-xs sm:text-sm"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[#111111]">
                          {item.productName}
                        </span>
                        <Badge
                          variant={isReward ? "primary" : "neutral"}
                          size="sm"
                        >
                          {isReward ? "Quà Rewards" : "Đã mua"}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-[#707072]">
                        Số lượng: {item.quantity} · Đơn giá:{" "}
                        {isReward
                          ? "Miễn phí"
                          : formatVND(item.unitPriceVnd)}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="font-semibold text-[#111111]">
                        {isReward ? "Miễn phí" : formatVND(item.totalPriceVnd)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </Reveal>
      )}

      {/* D. Access Credentials: KeyCard & Wi-Fi */}
      <Reveal distance={12} delay={80}>
        <section className="space-y-4">
          {stayData.hasActiveCredential && stayData.passcode ? (
            <div className="space-y-4">
              <KeyCard
                roomName={stayData.roomName}
                passcode={stayData.passcode}
                address={stayData.propertyAddress ?? undefined}
                mapUrl={stayData.propertyMapsUrl ?? undefined}
                stayStatus={stayData.stayStatus}
              />
              {stayData.instructions && (
                <div className="p-4 bg-[#F5F5F5] border border-[#E5E5E5] text-xs text-[#111111] leading-relaxed">
                  <strong className="font-medium text-[#111111]">
                    Chỉ dẫn mở cửa:{" "}
                  </strong>
                  <span>{stayData.instructions}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="p-6 border border-[#E5E5E5] bg-white flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-[#F5F5F5] text-[#111111] flex items-center justify-center shrink-0 mt-0.5">
                <Lock className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-medium text-[#111111]">
                  Khóa phòng điện tử & Mật khẩu Wi-Fi
                </h3>
                <p className="text-xs text-[#707072] leading-relaxed">
                  {stayData.activationNotice ??
                    (stayData.stayStatus === "UPCOMING"
                      ? "Thông tin truy cập sẽ được kích hoạt khi đến giờ nhận phòng."
                      : stayData.stayStatus === "COMPLETED"
                      ? "Kỳ nghỉ đã kết thúc. Mã khóa và Wi-Fi đã hết hiệu lực."
                      : "Mã mở khóa phòng và mật khẩu Wi-Fi chỉ được kích hoạt trong thời gian kỳ nghỉ có hiệu lực.")}
                </p>
              </div>
            </div>
          )}
        </section>
      </Reveal>

      {/* E. Wi-Fi Widget (only when credentials active) */}
      {stayData.hasActiveCredential &&
      stayData.wifiSsid &&
      stayData.wifiPass ? (
        <Reveal distance={12} delay={100}>
          <section>
            <WifiWidget ssid={stayData.wifiSsid} password={stayData.wifiPass} />
          </section>
        </Reveal>
      ) : null}

      {/* F. Quick Actions */}
      <Reveal distance={12} delay={120}>
        <section>
          <QuickActions
            bookingId={stayData.bookingId}
            isCheckoutAllowed={false}
            canReportIssue={canReportIssue}
            onReportIssue={() => {
              if (canReportIssue) setIsTicketOpen(true);
            }}
          />
        </section>
      </Reveal>

      {/* G. Guest Ticket Status List */}
      <Reveal distance={12} delay={140}>
        <GuestTicketStatusList
          bookingId={stayData.bookingId}
          refreshKey={ticketRefreshKey}
        />
      </Reveal>

      {/* H. Guest Guide */}
      <Reveal distance={12} delay={160}>
        <GuestGuide
          propertyName={stayData.propertyName}
          deviceInstructions={DEFAULT_DEVICE_INSTRUCTIONS}
          localSpots={[]}
          onReportIssueClick={
            canReportIssue ? () => setIsTicketOpen(true) : undefined
          }
        />
      </Reveal>

      {/* Ticket Modal */}
      <TicketModal
        isOpen={isTicketOpen && canReportIssue}
        onClose={() => setIsTicketOpen(false)}
        bookingId={stayData.bookingId}
        onSuccess={() => setTicketRefreshKey((prev) => prev + 1)}
      />
    </div>
  );
}

export default BookingDetail;
