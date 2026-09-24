"use client";

import React, { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { KeyCard, type StayStatus } from "@/components/my-stay/KeyCard";
import WifiWidget from "@/components/my-stay/WifiWidget";
import { QuickActions } from "@/components/my-stay/QuickActions";
import { getMyStayBookingDetails } from "@/lib/data/my-stay";

const SUPPORT_HOTLINE = process.env.NEXT_PUBLIC_SUPPORT_HOTLINE?.trim();
const CANONICAL_PARAM = "bookingId";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface StayData {
  bookingId: string;
  roomName?: string;
  passcode?: string | null;
  propertyAddress?: string | null;
  propertyMapsUrl?: string | null;
  wifiSsid?: string | null;
  wifiPass?: string | null;
  hasActiveCredential?: boolean;
  activationNotice?: string;
  stayStatus?: StayStatus;
  isActiveStay?: boolean;
}

function MyStayContent() {
  const searchParams = useSearchParams();
  const rawParam =
    searchParams.get(CANONICAL_PARAM) ||
    searchParams.get("booking") ||
    searchParams.get("code") ||
    "";
  const trimmedParam = rawParam.trim();
  const isValidUuid = UUID_REGEX.test(trimmedParam);

  const [bookingInput, setBookingInput] = useState(() => (isValidUuid ? trimmedParam : ""));
  const [stayData, setStayData] = useState<StayData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(() => {
    if (trimmedParam && !isValidUuid) {
      return "Mã đặt phòng không đúng định dạng UUID. Vui lòng kiểm tra lại đường dẫn hoặc mã được cung cấp.";
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState(false);

  // Synchronize state during render when query parameter changes
  const [prevParam, setPrevParam] = useState(trimmedParam);
  if (trimmedParam !== prevParam) {
    setPrevParam(trimmedParam);
    if (isValidUuid) {
      setBookingInput(trimmedParam);
      setErrorMessage(null);
    } else if (trimmedParam) {
      setBookingInput("");
      setErrorMessage(
        "Mã đặt phòng không đúng định dạng UUID. Vui lòng kiểm tra lại đường dẫn hoặc mã được cung cấp."
      );
      setStayData(null);
    } else {
      setBookingInput("");
      setErrorMessage(null);
      setStayData(null);
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
        setStayData(data as StayData);
      }
    } catch (err: unknown) {
      // TODO: Replace message markers with a structured backend error code.
      const errMsg = err instanceof Error ? err.message : "";
      if (errMsg.startsWith("Unauthorized:")) {
        setErrorMessage("Bạn cần đăng nhập để xem thông tin lưu trú này.");
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
      const hasAliases = searchParams.has("booking") || searchParams.has("code");
      if (currentCanonical !== trimmedParam || hasAliases) {
        const url = new URL(window.location.href);
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
      return;
    }

    lastFetchedIdRef.current = cleanInput;

    // Update URL to canonical param
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("booking");
      url.searchParams.delete("code");
      url.searchParams.set(CANONICAL_PARAM, cleanInput);
      window.history.replaceState(null, "", url.pathname + url.search);
    }

    await executeLookup(cleanInput);
  };

  const canRevealAccess = Boolean(stayData?.hasActiveCredential && stayData?.isActiveStay);

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <form onSubmit={handleSubmit} className="space-y-3">
        <label htmlFor="bookingCode" className="block text-sm font-medium">
          Mã đặt phòng (Booking ID)
        </label>
        <div className="flex gap-2">
          <input
            id="bookingCode"
            type="text"
            value={bookingInput}
            onChange={(e) => setBookingInput(e.target.value)}
            placeholder="Nhập UUID đơn hàng (VD: 123e4567-e89b-12d3-a456-426614174000)"
            className="flex-1 px-3 py-2 border rounded-lg text-sm"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {isLoading ? "Đang tra cứu..." : "Tra cứu"}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Vui lòng nhập mã định danh đơn hàng được cung cấp trong xác nhận đặt phòng.
        </p>
      </form>

      {errorMessage && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-lg">
          {errorMessage}
        </div>
      )}

      {stayData && (
        <div className="space-y-6 border-t pt-6">
          {canRevealAccess && stayData.passcode ? (
            <KeyCard
              roomName={stayData.roomName}
              passcode={stayData.passcode}
              address={stayData.propertyAddress ?? undefined}
              mapUrl={stayData.propertyMapsUrl ?? undefined}
              stayStatus={stayData.stayStatus}
            />
          ) : (
            <div className="p-4 rounded-xl border bg-muted/50 text-sm text-muted-foreground text-center">
              {stayData.activationNotice ?? "Thông tin truy cập phòng chưa khả dụng."}
            </div>
          )}

          {canRevealAccess && stayData.wifiSsid && stayData.wifiPass ? (
            <WifiWidget ssid={stayData.wifiSsid} password={stayData.wifiPass} />
          ) : null}

          <QuickActions />

          {SUPPORT_HOTLINE ? (
            <div className="text-xs text-muted-foreground text-center border-t pt-4">
              Cần hỗ trợ gấp? Liên hệ Hotline:{" "}
              <a href={`tel:${SUPPORT_HOTLINE.replace(/\s+/g, "")}`} className="font-semibold text-primary underline">
                {SUPPORT_HOTLINE}
              </a>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function MyStayClient() {
  return (
    <Suspense
      fallback={
        <div className="max-w-2xl mx-auto p-4 text-center text-sm text-muted-foreground">
          Đang tải thông tin lưu trú...
        </div>
      }
    >
      <MyStayContent />
    </Suspense>
  );
}

export { MyStayClient };