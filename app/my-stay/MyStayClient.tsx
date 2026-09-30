"use client";

import React, { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import { Button, Reveal } from "@/components/ui";
import { BookingList } from "@/components/my-stay/BookingList";
import { BookingDetail } from "@/components/my-stay/BookingDetail";
import {
  getMyStayBookingDetails,
  type MyStayBookingSummary,
  type MyStayBookingDetails,
} from "@/lib/data/my-stay";

const CANONICAL_PARAM = "bookingId";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface MyStayClientProps {
  initialBookings?: MyStayBookingSummary[];
}

function MyStayContent({ initialBookings = [] }: MyStayClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const rawParam =
    searchParams.get(CANONICAL_PARAM) ||
    searchParams.get("bookingID") ||
    searchParams.get("booking") ||
    searchParams.get("code") ||
    "";
  const trimmedParam = rawParam.trim();
  const isValidUuid = UUID_REGEX.test(trimmedParam);

  const [bookings] = useState<MyStayBookingSummary[]>(initialBookings);
  const [stayData, setStayData] = useState<MyStayBookingDetails | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Synchronize state during render when query parameter changes
  const [prevParam, setPrevParam] = useState(trimmedParam);
  if (trimmedParam !== prevParam) {
    setPrevParam(trimmedParam);
    if (!trimmedParam) {
      setStayData(null);
      setErrorMessage(null);
    } else if (!isValidUuid) {
      setStayData(null);
      setErrorMessage("Không tìm thấy booking hoặc bạn không có quyền truy cập.");
    }
  }

  const lastFetchedIdRef = useRef<string | null>(null);

  // Load details when a valid bookingId exists in query parameters
  const executeLookup = useCallback(async (id: string) => {
    const cleanId = id.trim();
    if (!cleanId) return;

    if (!UUID_REGEX.test(cleanId)) {
      setErrorMessage("Không tìm thấy booking hoặc bạn không có quyền truy cập.");
      setStayData(null);
      return;
    }

    setIsLoadingDetail(true);
    setErrorMessage(null);

    try {
      const data = await getMyStayBookingDetails(cleanId);
      if (!data) {
        setErrorMessage("Không tìm thấy booking hoặc bạn không có quyền truy cập.");
        setStayData(null);
      } else {
        setStayData(data);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "";
      if (
        errMsg.startsWith("Unauthorized:") ||
        errMsg.startsWith("UNAUTHENTICATED:")
      ) {
        setErrorMessage("Vui lòng đăng nhập để xem thông tin kỳ nghỉ.");
      } else if (
        errMsg.startsWith("Forbidden:") ||
        errMsg.startsWith("FORBIDDEN:") ||
        errMsg.startsWith("BOOKING_NOT_FOUND:") ||
        errMsg.includes("không có quyền truy cập")
      ) {
        // Safe message without DB or internal details
        setErrorMessage("Không tìm thấy booking hoặc bạn không có quyền truy cập.");
      } else if (
        errMsg.startsWith("Incomplete:") ||
        errMsg.startsWith("BOOKING_DATA_INCOMPLETE:")
      ) {
        // Internal data error: DO NOT falsely show "không tìm thấy booking hoặc không có quyền"
        setErrorMessage("Thông tin kỳ nghỉ đang được cập nhật. Vui lòng thử lại sau.");
      } else {
        // Safe generic system/DB error message - does not falsely accuse user of forbidden access
        setErrorMessage("Không thể tải thông tin kỳ nghỉ lúc này. Vui lòng thử lại sau.");
      }
      setStayData(null);
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (!trimmedParam || !isValidUuid) {
      lastFetchedIdRef.current = null;
      return;
    }

    if (lastFetchedIdRef.current !== trimmedParam) {
      lastFetchedIdRef.current = trimmedParam;
      void executeLookup(trimmedParam);
    }

    // Canonicalize parameter if non-standard alias was provided
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

  const handleBackToList = () => {
    setStayData(null);
    setErrorMessage(null);
    lastFetchedIdRef.current = null;
    router.push("/my-stay");
  };

  const isDetailView = Boolean(trimmedParam);

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-8 animate-page-entrance">
      {/* Detail View Mode */}
      {isDetailView ? (
        <div>
          {isLoadingDetail ? (
            <div className="bg-white border border-[#E5E5E5] p-12 text-center space-y-3">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#111111]" />
              <p className="text-xs sm:text-sm text-[#707072]">
                Đang tải thông tin chi tiết kỳ nghỉ...
              </p>
            </div>
          ) : errorMessage ? (
            <div className="bg-white border border-[#E5E5E5] p-8 sm:p-12 space-y-6 text-center">
              <div className="w-12 h-12 mx-auto rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1.5 max-w-md mx-auto">
                <h2 className="text-lg font-medium text-[#111111]">
                  Không thể hiển thị kỳ nghỉ
                </h2>
                <p className="text-xs sm:text-sm text-[#707072] leading-relaxed">
                  {errorMessage}
                </p>
              </div>
              <div>
                <Button
                  variant="outline"
                  size="md"
                  onClick={handleBackToList}
                  className="gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Quay lại Kỳ nghỉ của tôi</span>
                </Button>
              </div>
            </div>
          ) : stayData ? (
            <BookingDetail stayData={stayData} onBack={handleBackToList} />
          ) : null}
        </div>
      ) : (
        /* Dashboard List Mode */
        <div>
          <Reveal distance={12} delay={0}>
            <BookingList bookings={bookings} />
          </Reveal>
        </div>
      )}
    </div>
  );
}

export default function MyStayClient({
  initialBookings = [],
}: MyStayClientProps) {
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-14 text-center text-sm text-[#707072]">
          Đang tải thông tin lưu trú...
        </div>
      }
    >
      <MyStayContent initialBookings={initialBookings} />
    </Suspense>
  );
}

export { MyStayClient };