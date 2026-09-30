import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getMyStayBookings,
  getMyStayBookingDetails,
  type MyStayBookingSummary,
  type MyStayBookingDetails,
} from "@/lib/data/my-stay";
import { MyStayError } from "@/lib/types/my-stay";
import MyStayClient from "./MyStayClient";

export const metadata = {
  title: "Kỳ nghỉ của tôi | Kapi Stay Concierge",
  description: "Quản lý kỳ nghỉ, xem mã khóa phòng thông minh và tiện ích lưu trú tại Kapi Stay.",
};

const CANONICAL_PARAM = "bookingId";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface MyStayPageProps {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function MyStayPage({ searchParams }: MyStayPageProps) {
  const resolvedParams = searchParams ? await searchParams : {};
  const getSingleParam = (key: string): string | undefined => {
    const val = resolvedParams[key];
    if (typeof val === "string") return val;
    if (Array.isArray(val) && typeof val[0] === "string") return val[0];
    return undefined;
  };

  const rawBookingLocator =
    getSingleParam(CANONICAL_PARAM) ||
    getSingleParam("bookingID") ||
    getSingleParam("booking") ||
    getSingleParam("code");

  const trimmedLocator = rawBookingLocator?.trim();

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  // Server-side route authorization check using getClaims()
  if (error || !data?.claims?.sub) {
    let returnUrl = "/my-stay";
    if (trimmedLocator) {
      returnUrl = `/my-stay?${CANONICAL_PARAM}=${encodeURIComponent(trimmedLocator)}`;
    }

    redirect(`/login?next=${encodeURIComponent(returnUrl)}`);
  }

  let initialBookings: MyStayBookingSummary[] = [];
  try {
    initialBookings = await getMyStayBookings();
  } catch (err) {
    console.error("[MyStayPage] Error fetching bookings on server:", err);
  }

  let initialStayData: MyStayBookingDetails | null = null;
  let initialError: string | null = null;

  if (trimmedLocator) {
    if (!UUID_REGEX.test(trimmedLocator)) {
      initialError = "Không tìm thấy booking hoặc bạn không có quyền truy cập.";
    } else {
      try {
        initialStayData = await getMyStayBookingDetails(trimmedLocator);
      } catch (err: unknown) {
        if (err instanceof MyStayError) {
          if (err.code === "UNAUTHENTICATED") {
            initialError = "Vui lòng đăng nhập để xem thông tin kỳ nghỉ.";
          } else if (err.code === "FORBIDDEN" || err.code === "BOOKING_NOT_FOUND") {
            initialError = "Không tìm thấy booking hoặc bạn không có quyền truy cập.";
          } else if (err.code === "BOOKING_DATA_INCOMPLETE") {
            initialError = "Thông tin kỳ nghỉ đang được cập nhật. Vui lòng thử lại sau.";
          } else {
            initialError = "Không thể tải thông tin kỳ nghỉ lúc này. Vui lòng thử lại sau.";
          }
        } else {
          initialError = "Không thể tải thông tin kỳ nghỉ lúc này. Vui lòng thử lại sau.";
        }
      }
    }
  }

  return (
    <MyStayClient
      initialBookings={initialBookings}
      initialStayData={initialStayData}
      initialError={initialError}
    />
  );
}

