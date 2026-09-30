"use client";

import React, { useState, useEffect, Suspense } from "react";
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
  initialStayData?: MyStayBookingDetails | null;
  initialError?: string | null;
}

function MyStayContent({
  initialBookings = [],
  initialStayData = null,
  initialError = null,
}: MyStayClientProps) {
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

  const hasMatchingInitialStay = Boolean(
    initialStayData &&
      trimmedParam &&
      initialStayData.bookingId.toLowerCase() === trimmedParam.toLowerCase()
  );

  const [bookings] = useState<MyStayBookingSummary[]>(initialBookings);
  const [stayData, setStayData] = useState<MyStayBookingDetails | null>(
    hasMatchingInitialStay ? initialStayData : null
  );
  const [isLoadingDetail, setIsLoadingDetail] = useState(
    Boolean(trimmedParam && isValidUuid && !hasMatchingInitialStay && !initialError)
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(
    trimmedParam && initialError ? initialError : null
  );

  // Synchronize state during render when query parameter or initial props change
  const [prevParam, setPrevParam] = useState(trimmedParam);
  const [prevInitialStayData, setPrevInitialStayData] = useState(initialStayData);
  const [prevInitialError, setPrevInitialError] = useState(initialError);

  if (
    trimmedParam !== prevParam ||
    initialStayData !== prevInitialStayData ||
    initialError !== prevInitialError
  ) {
    setPrevParam(trimmedParam);
    setPrevInitialStayData(initialStayData);
    setPrevInitialError(initialError);

    if (!trimmedParam) {
      setStayData(null);
      setErrorMessage(null);
      setIsLoadingDetail(false);
    } else if (!isValidUuid) {
      setStayData(null);
      setErrorMessage("Không tìm thấy booking hoặc bạn không có quyền truy cập.");
      setIsLoadingDetail(false);
    } else if (
      initialStayData &&
      initialStayData.bookingId.toLowerCase() === trimmedParam.toLowerCase()
    ) {
      setStayData(initialStayData);
      setErrorMessage(null);
      setIsLoadingDetail(false);
    } else if (initialError) {
      setStayData(null);
      setErrorMessage(initialError);
      setIsLoadingDetail(false);
    } else {
      setStayData(null);
      setErrorMessage(null);
      setIsLoadingDetail(true);
    }
  }

  useEffect(() => {
    let ignore = false;
    if (!trimmedParam || !isValidUuid) {
      return;
    }

    const hasData =
      (stayData && stayData.bookingId.toLowerCase() === trimmedParam.toLowerCase()) ||
      errorMessage !== null;

    if (!hasData) {
      void getMyStayBookingDetails(trimmedParam)
        .then((data) => {
          if (ignore) return;
          if (!data) {
            setErrorMessage("Không tìm thấy booking hoặc bạn không có quyền truy cập.");
            setStayData(null);
          } else {
            setStayData(data);
            setErrorMessage(null);
          }
        })
        .catch((err: unknown) => {
          if (ignore) return;
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
            setErrorMessage("Không tìm thấy booking hoặc bạn không có quyền truy cập.");
          } else if (
            errMsg.startsWith("Incomplete:") ||
            errMsg.startsWith("BOOKING_DATA_INCOMPLETE:")
          ) {
            setErrorMessage("Thông tin kỳ nghỉ đang được cập nhật. Vui lòng thử lại sau.");
          } else {
            setErrorMessage("Không thể tải thông tin kỳ nghỉ lúc này. Vui lòng thử lại sau.");
          }
          setStayData(null);
        })
        .finally(() => {
          if (!ignore) {
            setIsLoadingDetail(false);
          }
        });
    }

    return () => {
      ignore = true;
    };
  }, [trimmedParam, isValidUuid, stayData, errorMessage]);

  useEffect(() => {
    // Canonicalize parameter if non-standard alias was provided
    if (typeof window !== "undefined" && trimmedParam) {
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
  }, [trimmedParam, searchParams]);

  const handleBackToList = () => {
    setStayData(null);
    setErrorMessage(null);
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
  initialStayData = null,
  initialError = null,
}: MyStayClientProps) {
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-14 text-center text-sm text-[#707072]">
          Đang tải thông tin lưu trú...
        </div>
      }
    >
      <MyStayContent
        initialBookings={initialBookings}
        initialStayData={initialStayData}
        initialError={initialError}
      />
    </Suspense>
  );
}

export { MyStayClient };