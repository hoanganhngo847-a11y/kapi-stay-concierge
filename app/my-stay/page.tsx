import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyStayBookings, type MyStayBookingSummary } from "@/lib/data/my-stay";
import MyStayClient from "./MyStayClient";

export const metadata = {
  title: "Kỳ nghỉ của tôi | Kapi Stay Concierge",
  description: "Quản lý kỳ nghỉ, xem mã khóa phòng thông minh và tiện ích lưu trú tại Kapi Stay.",
};

const CANONICAL_PARAM = "bookingId";

interface MyStayPageProps {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function MyStayPage({ searchParams }: MyStayPageProps) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  // Server-side route authorization check using getClaims()
  if (error || !data?.claims?.sub) {
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

  return <MyStayClient initialBookings={initialBookings} />;
}
