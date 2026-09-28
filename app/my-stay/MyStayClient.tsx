"use client";

import React, { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ExternalLink, Lock, MapPin } from "lucide-react";
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
import {
  getMyStayBookingDetails,
  type MyStayBookingDetails,
} from "@/lib/data/my-stay";
import { formatStayDateTime } from "@/lib/utils/stay";

const CANONICAL_PARAM = "bookingId";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function MyStayContent() {
  const searchParams = useSearchParams();
  const rawParam =
    searchParams.get(CANONICAL_PARAM) ||
    searchParams.get("bookingID") ||
    searchParams.get("booking") ||
    searchParams.get("code") ||
    "";
  const trimmedParam = rawParam.trim();
  const isValidUuid = UUID_REGEX.test(trimmedParam);

  const [bookingInput, setBookingInput] = useState(() => (isValidUuid ? trimmedParam : ""));
  const [stayData, setStayData] = useState<MyStayBookingDetails | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(() => {
    if (trimmedParam && !isValidUuid) {
      return "Mã đặt phòng không đúng định dạng.";
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isTicketOpen, setIsTicketOpen] = useState(false);
  const [ticketRefreshKey, setTicketRefreshKey] = useState(0);

  // Synchronize state during render when query parameter changes
  const [prevParam, setPrevParam] = useState(trimmedParam);
  if (trimmedParam !== prevParam) {
    setPrevParam(trimmedParam);
    if (isValidUuid) {
      setBookingInput(trimmedParam);
      setErrorMessage(null);
    } else if (trimmedParam) {
      setBookingInput("");
      setErrorMessage("Mã đặt phòng không đúng định dạng.");
      setStayData(null);
      setIsTicketOpen(false);
    } else {
      setBookingInput("");
      setErrorMessage(null);
      setStayData(null);
      setIsTicketOpen(false);
    }
  }
  const lastFetchedIdRef = useRef<string | null>(null);

  const executeLookup = useCallback(async (id: string) => {
    const cleanId = id.trim();
    if (!cleanId) return;

    if (!UUID_REGEX.test(cleanId)) {
      setErrorMessage("Mã đặt phòng không đúng định dạng.");
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const data = await getMyStayBookingDetails(cleanId);
      if (!data) {
        setErrorMessage("Không tìm thấy thông tin đặt phòng hoặc bạn không có quyền truy cập.");
        setStayData(null);
      } else {
        setStayData(data);
      }
    } catch (err: unknown) {
      // Map domain markers to user-friendly messages without exposing internal/DB details
      const errMsg = err instanceof Error ? err.message : "";
      if (errMsg.startsWith("Unauthorized:")) {
        setErrorMessage("Bạn cần đăng nhập để xem thông tin kỳ nghỉ.");
      } else if (errMsg.startsWith("Forbidden:")) {
        setErrorMessage("Không tìm thấy đơn hoặc bạn không có quyền truy cập.");
      } else {
        setErrorMessage("Hệ thống tạm thời không khả dụng. Vui lòng thử lại sau.");
      }
      setStayData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!trimmedParam || !isValidUuid) {
      return;
    }

    if (lastFetchedIdRef.current !== trimmedParam) {
      lastFetchedIdRef.current = trimmedParam;
      void executeLookup(trimmedParam);
    }

    // Canonicalize query parameter in URL if alias or non-canonical form was used
    if (typeof window !== "undefined") {
      const currentCanonical = searchParams.get(CANONICAL_PARAM);
      const hasAliases =
        searchParams.has("bookingID") ||
        searchParams.has("booking") ||
        searchParams.has("code");
      if (currentCanonical !== trimmedParam || hasAliases) {
        const url = new URL(window.location.href);
        url.searchParams.delete("bookingID");
        url.searchParams.delete("booking");
        url.searchParams.delete("code");
        url.searchParams.set(CANONICAL_PARAM, trimmedParam);
        window.history.replaceState(null, "", url.pathname + url.search);
      }
    }
  }, [trimmedParam, isValidUuid, executeLookup, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanInput = bookingInput.trim();
    if (!cleanInput) return;

    if (!UUID_REGEX.test(cleanInput)) {
      setErrorMessage("Mã đặt phòng không đúng định dạng.");
      setStayData(null);
      setIsTicketOpen(false);
      return;
    }

    lastFetchedIdRef.current = cleanInput;

    // Update URL to canonical param
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("bookingID");
      url.searchParams.delete("booking");
      url.searchParams.delete("code");
      url.searchParams.set(CANONICAL_PARAM, cleanInput);
      window.history.replaceState(null, "", url.pathname + url.search);
    }

    await executeLookup(cleanInput);
  };

  const canReportIssue = Boolean(stayData?.isActiveStay && stayData?.hasActiveCredential);

  const handleOpenTicket = () => {
    if (!canReportIssue) return;
    setIsTicketOpen(true);
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-8 animate-page-entrance">
      {/* Form tra cứu đơn đặt phòng */}
      <Reveal distance={12} delay={0}>
        <section className="bg-white border border-[#E5E5E5] p-6 sm:p-8 space-y-5">
          <div>
            <span className="text-[11px] font-medium tracking-widest uppercase text-[#707072] block mb-1">
              Quản lý kỳ nghỉ
            </span>
            <h1 className="text-2xl sm:text-3xl font-normal text-[#111111] tracking-tight">
              Kỳ nghỉ của tôi
            </h1>
            <p className="text-xs sm:text-sm text-[#707072] mt-1.5 leading-relaxed">
              Tra cứu thông tin nhận phòng, mã khóa thông minh và hướng dẫn tiện ích lưu trú tại Kapi Stay.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <label htmlFor="bookingCode" className="block text-xs font-medium uppercase tracking-wider text-[#707072]">
              Mã đặt phòng (Booking ID)
            </label>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                id="bookingCode"
                type="text"
                value={bookingInput}
                onChange={(e) => {
                  setBookingInput(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="Nhập UUID đơn đặt phòng (VD: 123e4567-e89b-12d3-a456-426614174000)"
                className="flex-1 px-4 py-2.5 border border-[#E5E5E5] text-sm text-[#111111] focus:outline-none focus:border-[#111111] font-mono transition-colors"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="px-6 py-2.5 bg-[#111111] text-white rounded-full text-sm font-medium hover:bg-black disabled:bg-[#9E9EA0] disabled:cursor-not-allowed transition-colors shrink-0"
              >
                {isLoading ? "Đang tra cứu..." : "Tra cứu"}
              </button>
            </div>
            <p className="text-[11px] text-[#707072]">
              Vui lòng nhập mã định danh đơn hàng (Booking ID) được cấp trong xác nhận đặt phòng của bạn.
            </p>
          </form>

          {errorMessage && (
            <div
              role="alert"
              className="p-4 text-xs sm:text-sm text-[#111111] bg-[#F5F5F5] border border-rose-300 flex items-center justify-between"
            >
              <span>{errorMessage}</span>
              {errorMessage.includes("đăng nhập") && (
                <a
                  href={
                    bookingInput.trim()
                      ? `/login?next=${encodeURIComponent(`/my-stay?${CANONICAL_PARAM}=${encodeURIComponent(bookingInput.trim())}`)}`
                      : "/login?next=/my-stay"
                  }
                  className="text-xs font-medium underline ml-2 text-[#111111] hover:opacity-80 whitespace-nowrap"
                >
                  Đăng nhập ngay
                </a>
              )}
            </div>
          )}
        </section>
      </Reveal>

      {/* Thông tin kỳ nghỉ khi đã lookup thành công */}
      {stayData && (
        <div className="space-y-6">
          {/* 1. Room & Property Info */}
          <Reveal distance={12} delay={0}>
            <section className="bg-white border border-[#E5E5E5] p-6 sm:p-8 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-3 pb-5 border-b border-[#E5E5E5]">
                <div>
                  <span className="text-[11px] font-medium tracking-widest uppercase text-[#707072] block mb-1">
                    Thông tin điểm đến
                  </span>
                  <h2 className="text-xl sm:text-2xl font-normal text-[#111111] tracking-tight">
                    {stayData.propertyName}
                  </h2>
                  <p className="text-xs sm:text-sm text-[#707072] mt-1 flex items-start gap-1">
                    <MapPin className="w-3.5 h-3.5 text-[#707072] shrink-0 mt-0.5" />
                    <span>{stayData.propertyAddress}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Badge
                    variant={
                      stayData.stayStatus === "ACTIVE"
                        ? "primary"
                        : stayData.stayStatus === "UPCOMING"
                        ? "primary"
                        : "neutral"
                    }
                    size="md"
                  >
                    {stayData.stayStatus === "ACTIVE"
                      ? "Đang lưu trú"
                      : stayData.stayStatus === "UPCOMING"
                      ? "Sắp diễn ra"
                      : stayData.stayStatus === "COMPLETED"
                      ? "Đã hoàn thành"
                      : "Đã hủy"}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs sm:text-sm">
                <div className="p-4 bg-[#F5F5F5] border border-[#E5E5E5]">
                  <span className="text-[#707072] block text-[11px] uppercase tracking-wider mb-1">Phòng đã đặt</span>
                  <span className="font-medium text-[#111111] text-base block">
                    {stayData.roomName}
                  </span>
                </div>

                <div className="p-4 bg-[#F5F5F5] border border-[#E5E5E5]">
                  <span className="text-[#707072] block text-[11px] uppercase tracking-wider mb-1">Thời gian lưu trú</span>
                  <span className="font-medium text-[#111111] block">
                    {stayData.checkInAt && stayData.checkOutAt
                      ? `${formatStayDateTime(stayData.checkInAt)} → ${formatStayDateTime(stayData.checkOutAt)}`
                      : `${stayData.checkIn} → ${stayData.checkOut}`}
                  </span>
                </div>

                <div className="p-4 bg-[#F5F5F5] border border-[#E5E5E5]">
                  <span className="text-[#707072] block text-[11px] uppercase tracking-wider mb-1">Mã đặt phòng</span>
                  <span
                    className="font-mono text-[#111111] font-medium text-xs break-all block"
                    title={stayData.bookingId}
                  >
                    {stayData.bookingId}
                  </span>
                </div>
              </div>

              {stayData.propertyMapsUrl && (
                <div className="pt-2 flex justify-end">
                  <a
                    href={stayData.propertyMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-[#111111] font-medium hover:underline underline-offset-4"
                  >
                    <span>Xem vị trí trên Google Maps</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </section>
          </Reveal>

          {/* 2. Digital Key (chỉ hiển thị khi active credential được RPC xác nhận) */}
          <Reveal distance={12} delay={80}>
            <section className="space-y-3">
              {stayData.hasActiveCredential && stayData.passcode ? (
                <div className="space-y-3">
                  <KeyCard
                    roomName={stayData.roomName}
                    passcode={stayData.passcode}
                    address={stayData.propertyAddress ?? undefined}
                    mapUrl={stayData.propertyMapsUrl ?? undefined}
                    stayStatus={stayData.stayStatus}
                  />
                  {stayData.instructions && (
                    <div className="p-4 bg-[#F5F5F5] border border-[#E5E5E5] text-xs text-[#111111] leading-relaxed">
                      <strong className="font-medium text-[#111111]">Chỉ dẫn mở cửa: </strong>
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
                    <h3 className="text-sm font-medium text-[#111111]">Khóa phòng điện tử & Mật khẩu Wi-Fi</h3>
                    <p className="text-xs text-[#707072] leading-relaxed">
                      {stayData.activationNotice ??
                        "Mã mở khóa phòng và mật khẩu Wi-Fi chỉ được kích hoạt trong thời gian kỳ nghỉ có hiệu lực."}
                    </p>
                  </div>
                </div>
              )}
            </section>
          </Reveal>

          {/* 3. Wi-Fi (chỉ hiển thị khi credential active và có thông tin thực tế) */}
          {stayData.hasActiveCredential && stayData.wifiSsid && stayData.wifiPass ? (
            <Reveal distance={12} delay={140}>
              <section>
                <WifiWidget ssid={stayData.wifiSsid} password={stayData.wifiPass} />
              </section>
            </Reveal>
          ) : null}

          {/* 4. Quick Actions */}
          <Reveal distance={12} delay={200}>
            <section>
              <QuickActions
                bookingId={stayData.bookingId}
                isCheckoutAllowed={false}
                canReportIssue={canReportIssue}
                onReportIssue={handleOpenTicket}
              />
            </section>
          </Reveal>

          {/* 5. Guest Ticket Status List */}
          <Reveal distance={12} delay={260}>
            <GuestTicketStatusList
              bookingId={stayData.bookingId}
              refreshKey={ticketRefreshKey}
            />
          </Reveal>

          {/* 6. Guest Guide */}
          <Reveal distance={12} delay={320}>
            <GuestGuide
              propertyName={stayData.propertyName}
              deviceInstructions={DEFAULT_DEVICE_INSTRUCTIONS}
              localSpots={[]}
              onReportIssueClick={canReportIssue ? handleOpenTicket : undefined}
            />
          </Reveal>

          {/* 7. Ticket Modal (Chỉ mở khi canReportIssue === true và có bookingId thực) */}
          <TicketModal
            isOpen={isTicketOpen && canReportIssue}
            onClose={() => setIsTicketOpen(false)}
            bookingId={stayData.bookingId}
            onSuccess={() => setTicketRefreshKey((prev) => prev + 1)}
          />
        </div>
      )}
    </div>
  );
}

export default function MyStayClient() {
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-12 text-center text-sm text-dark/60">
          Đang tải thông tin lưu trú...
        </div>
      }
    >
      <MyStayContent />
    </Suspense>
  );
}

export { MyStayClient };