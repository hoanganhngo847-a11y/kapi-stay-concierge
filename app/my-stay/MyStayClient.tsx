"use client";

import React, { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ExternalLink, Lock, MapPin } from "lucide-react";
import { Badge } from "@/components/ui";
import { KeyCard } from "@/components/my-stay/KeyCard";
import WifiWidget from "@/components/my-stay/WifiWidget";
import { QuickActions } from "@/components/my-stay/QuickActions";
import {
  GuestGuide,
  DEFAULT_DEVICE_INSTRUCTIONS,
} from "@/components/tickets/GuestGuide";
import { TicketModal } from "@/components/tickets/TicketModal";
import {
  getMyStayBookingDetails,
  type MyStayBookingDetails,
} from "@/lib/data/my-stay";

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
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Form tra cứu đơn đặt phòng */}
      <section className="bg-white rounded-2xl border border-dark/10 p-5 sm:p-6 shadow-sm space-y-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-dark tracking-tight">
            Kỳ nghỉ của tôi
          </h1>
          <p className="text-xs sm:text-sm text-dark/60 mt-1">
            Tra cứu thông tin nhận phòng, mã khóa thông minh và hướng dẫn tiện ích lưu trú.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label htmlFor="bookingCode" className="block text-sm font-medium text-dark">
            Mã đặt phòng (Booking ID)
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="bookingCode"
              type="text"
              value={bookingInput}
              onChange={(e) => {
                setBookingInput(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              placeholder="Nhập UUID đơn đặt phòng (VD: 123e4567-e89b-12d3-a456-426614174000)"
              className="flex-1 px-3.5 py-2.5 border border-dark/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors font-mono"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary-600 disabled:opacity-50 transition-colors shrink-0"
            >
              {isLoading ? "Đang tra cứu..." : "Tra cứu"}
            </button>
          </div>
          <p className="text-xs text-dark/50">
            Vui lòng nhập mã định danh đơn hàng (Booking ID) được cấp trong xác nhận đặt phòng của bạn.
          </p>
        </form>

        {errorMessage && (
          <div
            role="alert"
            className="p-3.5 text-xs sm:text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between animate-in fade-in"
          >
            <span>{errorMessage}</span>
            {errorMessage.includes("đăng nhập") && (
              <a
                href={
                  bookingInput.trim()
                    ? `/login?next=${encodeURIComponent(`/my-stay?${CANONICAL_PARAM}=${encodeURIComponent(bookingInput.trim())}`)}`
                    : "/login?next=/my-stay"
                }
                className="text-xs font-semibold underline ml-2 text-primary hover:text-primary-700 whitespace-nowrap"
              >
                Đăng nhập ngay
              </a>
            )}
          </div>
        )}
      </section>

      {/* Thông tin kỳ nghỉ khi đã lookup thành công */}
      {stayData && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* 1. Room & Property Info */}
          <section className="bg-white rounded-2xl border border-dark/10 p-5 sm:p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-dark/10">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-primary" />
                  <h2 className="text-xl sm:text-2xl font-bold text-dark tracking-tight">
                    {stayData.propertyName}
                  </h2>
                </div>
                <p className="text-xs sm:text-sm text-dark/60 mt-1 flex items-start gap-1">
                  <MapPin className="w-4 h-4 text-dark/40 shrink-0 mt-0.5" />
                  <span>{stayData.propertyAddress}</span>
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Badge
                  variant={
                    stayData.stayStatus === "ACTIVE"
                      ? "success"
                      : stayData.stayStatus === "UPCOMING"
                      ? "primary"
                      : stayData.stayStatus === "COMPLETED"
                      ? "neutral"
                      : "danger"
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
              <div className="p-3 bg-dark/2 rounded-xl">
                <span className="text-dark/50 block text-xs">Phòng đã đặt</span>
                <span className="font-semibold text-dark text-base mt-0.5 block">
                  {stayData.roomName}
                </span>
              </div>

              <div className="p-3 bg-dark/2 rounded-xl">
                <span className="text-dark/50 block text-xs">Thời gian lưu trú</span>
                <span className="font-medium text-dark mt-0.5 block">
                  {stayData.checkIn} → {stayData.checkOut}
                </span>
              </div>

              <div className="p-3 bg-dark/2 rounded-xl">
                <span className="text-dark/50 block text-xs">Mã đặt phòng (Booking ID)</span>
                <span
                  className="font-mono text-dark font-medium text-xs break-all mt-0.5 block"
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
                  className="inline-flex items-center gap-1.5 text-xs text-primary font-medium hover:underline"
                >
                  <span>Xem vị trí trên Google Maps</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </section>

          {/* 2. Digital Key (chỉ hiển thị khi active credential được RPC xác nhận) */}
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
                  <div className="p-3.5 bg-primary/5 border border-primary/15 rounded-xl text-xs text-dark/80 leading-relaxed">
                    <strong className="text-primary font-semibold">Chỉ dẫn mở cửa: </strong>
                    <span>{stayData.instructions}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-5 rounded-2xl border border-dark/10 bg-white shadow-sm flex items-start gap-3.5">
                <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 shrink-0 mt-0.5">
                  <Lock className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-dark">Khóa phòng điện tử & Mật khẩu Wi-Fi</h3>
                  <p className="text-xs text-dark/60 leading-relaxed">
                    {stayData.activationNotice ??
                      "Mã mở khóa phòng và mật khẩu Wi-Fi chỉ được kích hoạt trong thời gian kỳ nghỉ có hiệu lực."}
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* 3. Wi-Fi (chỉ hiển thị khi credential active và có thông tin thực tế) */}
          {stayData.hasActiveCredential && stayData.wifiSsid && stayData.wifiPass ? (
            <section>
              <WifiWidget ssid={stayData.wifiSsid} password={stayData.wifiPass} />
            </section>
          ) : null}

          {/* 4. Quick Actions */}
          <section>
            <QuickActions
              bookingId={stayData.bookingId}
              isCheckoutAllowed={false}
              canReportIssue={canReportIssue}
              onReportIssue={handleOpenTicket}
            />
          </section>

          {/* 5. Guest Guide */}
          <GuestGuide
            propertyName={stayData.propertyName}
            deviceInstructions={DEFAULT_DEVICE_INSTRUCTIONS}
            localSpots={[]}
            onReportIssueClick={canReportIssue ? handleOpenTicket : undefined}
          />

          {/* 6. Ticket Modal (Chỉ mở khi canReportIssue === true và có bookingId thực) */}
          <TicketModal
            isOpen={isTicketOpen && canReportIssue}
            onClose={() => setIsTicketOpen(false)}
            bookingId={stayData.bookingId}
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