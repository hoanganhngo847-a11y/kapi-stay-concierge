/**
 * @file app/checkout/page.tsx
 * @owner TV4 — Linh (feat/booking-checkout)
 *
 * Server Component — Trang thanh toán đặt phòng.
 *
 * Trách nhiệm của Server Component này:
 *   1. Bảo vệ route: yêu cầu đăng nhập Google qua requireBookingAuth()
 *   2. Đọc và validate searchParams từ URL (roomId, checkIn, checkOut, guests)
 *   3. Tạo checkout session mới (hoặc đọc lại session hiện có từ sessionId param)
 *   4. Tải danh sách voucher khả dụng của user
 *   5. Truyền dữ liệu xuống CheckoutClient (Client Component)
 *
 * URL hợp lệ để vào trang này (từ RoomBookingWidget):
 *   /checkout?roomId=<uuid>&checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD&guests=<n>
 *
 * URL tái nhập session đã tạo (tránh tạo trùng khi reload):
 *   /checkout?sessionId=<uuid>
 *
 * TUÂN THỦ QUY TẮC DỰ ÁN:
 * - Auth: requireBookingAuth() từ @/lib/auth/booking-gate — REUSE ONLY
 * - Data: createCheckoutSession, getCheckoutSession, getUserAvailableVouchers
 *   từ @/lib/data/checkout
 * - KHÔNG sửa file nào ngoài app/checkout/**
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { requireBookingAuth } from "@/lib/auth/booking-gate";
import {
  createCheckoutSession,
  getCheckoutSession,
  getUserAvailableVouchers,
  getUserAvailablePhysicalRewards,
  getActiveCheckoutMenuItems,
} from "@/lib/data/checkout";
import { getPublicRoomById, isValidUUID } from "@/lib/data/rooms";
import { CheckoutClient, CheckoutError } from "./CheckoutClient";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "Xác nhận đặt phòng | Kapi Stay Concierge",
  description:
    "Xem lại thông tin đặt phòng, áp mã ưu đãi và thanh toán qua VietQR để hoàn tất đặt phòng tại Kapi House.",
  robots: { index: false, follow: false }, // Không index trang thanh toán
};

// Luôn render động — không cache trang checkout
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CheckoutPageProps {
  searchParams: Promise<{
    roomId?: string;
    checkIn?: string;
    checkOut?: string;
    checkInAt?: string;
    checkOutAt?: string;
    guests?: string;
    sessionId?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseToVietnamTimestamp(v: unknown, defaultHour: string = "14:00"): number | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const trimmed = v.trim();
  // Format: YYYY-MM-DDTHH:mm
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    const withOffset = trimmed.length === 16 ? `${trimmed}:00+07:00` : `${trimmed}+07:00`;
    const d = new Date(withOffset);
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  // Format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const withOffset = `${trimmed}T${defaultHour}:00+07:00`;
    const d = new Date(withOffset);
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d.getTime();
}

// ---------------------------------------------------------------------------
// Page Component (Server)
// ---------------------------------------------------------------------------

export default async function CheckoutPage({
  searchParams,
}: CheckoutPageProps) {
  // ── 1. Đọc searchParams TRƯỚC để xây dựng returnUrl đầy đủ ──────────────────
  //    Bảo lưu toàn bộ query params (roomId, checkIn, checkOut, checkInAt, checkOutAt, guests)
  //    vào returnUrl trước khi gọi auth. Nếu user chưa đăng nhập,
  //    sau login sẽ redirect đúng về phòng và thời gian đã chọn.
  const params = await searchParams;
  const {
    roomId,
    checkIn: rawCheckIn,
    checkOut: rawCheckOut,
    checkInAt: rawCheckInAt,
    checkOutAt: rawCheckOutAt,
    sessionId: existingSessionId,
  } = params;

  const checkIn = rawCheckInAt || rawCheckIn;
  const checkOut = rawCheckOutAt || rawCheckOut;

  // Xây dựng returnUrl chứa đủ query params để sau login quay lại đúng trang
  const rawQuery = new URLSearchParams();
  if (roomId) rawQuery.set("roomId", roomId);
  if (checkIn) {
    rawQuery.set("checkIn", checkIn);
    rawQuery.set("checkInAt", checkIn);
  }
  if (checkOut) {
    rawQuery.set("checkOut", checkOut);
    rawQuery.set("checkOutAt", checkOut);
  }
  if (existingSessionId) rawQuery.set("sessionId", existingSessionId);
  const returnUrl =
    rawQuery.size > 0 ? `/checkout?${rawQuery.toString()}` : "/checkout";

  // ── 2. Xác thực: bắt buộc đăng nhập trước khi vào checkout ──────────────
  //    requireBookingAuth() sẽ tự redirect về /login?next=<returnUrl> nếu chưa đăng nhập.
  const user = await requireBookingAuth(returnUrl);

  // ── 3a. Nếu có sessionId → tái tải session đã tạo (tránh tạo trùng) ──────
  if (existingSessionId) {
    if (!isValidUUID(existingSessionId)) {
      return (
        <CheckoutPageLayout>
          <CheckoutError
            title="Liên kết không hợp lệ"
            message="Mã phiên đặt phòng trong URL không đúng định dạng. Vui lòng bắt đầu lại từ trang chọn phòng."
          />
        </CheckoutPageLayout>
      );
    }

    const { data: existingSession, error: sessionFetchError } =
      await getCheckoutSession(existingSessionId);

    if (sessionFetchError || !existingSession) {
      return (
        <CheckoutPageLayout>
          <CheckoutError
            title="Không tìm thấy phiên đặt phòng"
            message="Phiên đặt phòng không tồn tại hoặc đã hết hạn. Vui lòng bắt đầu lại."
          />
        </CheckoutPageLayout>
      );
    }

    // Kiểm tra phiên còn thuộc user hiện tại
    if (existingSession.user_id !== user.id) {
      return (
        <CheckoutPageLayout>
          <CheckoutError
            title="Không có quyền truy cập"
            message="Phiên đặt phòng này không thuộc tài khoản của bạn."
          />
        </CheckoutPageLayout>
      );
    }

    // Kiểm tra phiên còn ở trạng thái có thể tiếp tục thanh toán
    // (ACTIVE hoặc PAYMENT_PROCESSING theo schema)
    const activeStatuses = ["ACTIVE", "PAYMENT_PROCESSING"];
    if (!activeStatuses.includes(existingSession.status)) {
      return (
        <CheckoutPageLayout>
          <CheckoutError
            title={
              existingSession.status === "COMPLETED"
                ? "Đặt phòng đã hoàn tất"
                : "Phiên đặt phòng đã hết hạn"
            }
            message={
              existingSession.status === "COMPLETED"
                ? "Đơn đặt phòng này đã được xác nhận thành công. Xem thông tin kỳ nghỉ của bạn tại My Stay."
                : "Phiên thanh toán đã hết hạn hoặc không hợp lệ. Vui lòng bắt đầu lại từ trang chọn phòng."
            }
            backHref={
              existingSession.status === "COMPLETED" ? "/my-stay" : "/rooms"
            }
            backLabel={
              existingSession.status === "COMPLETED"
                ? "Xem kỳ nghỉ của tôi"
                : "Quay lại chọn phòng"
            }
          />
        </CheckoutPageLayout>
      );
    }

    // [RE-REVIEW #2 — Điểm 2] Kiểm tra expires_at ngay cả khi status vẫn ACTIVE/PAYMENT_PROCESSING.
    // Có thể xảy ra khi session hết hạn nhưng DB chưa cập nhật status (race condition hoặc
    // cleanup job chưa chạy). Chặn ở đây để tránh user tương tác với phiên đã hết hiệu lực.
    if (existingSession.expires_at) {
      const expiresAt = new Date(existingSession.expires_at);
      if (expiresAt <= new Date()) {
        const roomHref = existingSession.room_id
          ? `/rooms/${existingSession.room_id}`
          : "/rooms";
        return (
          <CheckoutPageLayout>
            <CheckoutError
              title="Phiên thanh toán đã hết hạn"
              message="Phiên đặt phòng đã hết hiệu lực. Vui lòng quay lại trang phòng và bắt đầu lại."
              backHref={roomHref}
              backLabel="Quay lại trang phòng"
            />
          </CheckoutPageLayout>
        );
      }
    }

    // Session hợp lệ — tải voucher, phần thưởng hiện vật, thực đơn và món đã chọn song song
    const [
      { data: vouchers },
      { data: physicalRewards },
      { data: menuItems },
      { data: allMenuProducts },
      { data: initialMenuItems, menuAmountVnd: initialMenuAmountVnd },
    ] = await Promise.all([
      getUserAvailableVouchers(user.id),
      getUserAvailablePhysicalRewards(user.id),
      getActiveCheckoutMenuItems(),
      (await import("@/lib/data/menu")).getMenuProducts(),
      (await import("@/lib/data/checkout")).getCheckoutMenuItems(existingSession.id),
    ]);

    return (
      <CheckoutPageLayout>
        <CheckoutClient
          session={existingSession}
          initialVouchers={vouchers ?? []}
          initialPhysicalRewards={physicalRewards ?? []}
          menuItems={menuItems ?? []}
          allMenuProducts={allMenuProducts ?? []}
          initialSelectedMenuItems={initialMenuItems ?? []}
          initialMenuAmountVnd={initialMenuAmountVnd ?? 0}
          userId={user.id}
        />
      </CheckoutPageLayout>
    );
  }

  // ── 3b. Tạo session mới từ searchParams ──────────────────────────────────

  // Validate roomId
  if (!isValidUUID(roomId)) {
    return (
      <CheckoutPageLayout>
        <CheckoutError
          title="Thiếu thông tin đặt phòng"
          message="Không tìm thấy thông tin phòng trong URL. Vui lòng chọn phòng từ danh sách và thử lại."
        />
      </CheckoutPageLayout>
    );
  }

  // Validate thời gian nhận và trả phòng
  const tIn = parseToVietnamTimestamp(checkIn, "14:00");
  const tOut = parseToVietnamTimestamp(checkOut, "18:00");

  if (!tIn || !tOut) {
    return (
      <CheckoutPageLayout>
        <CheckoutError
          title="Thời gian lưu trú không hợp lệ"
          message="Thời gian nhận phòng hoặc trả phòng không đúng định dạng. Vui lòng quay lại và chọn thời gian lại."
          backHref={`/rooms/${roomId}`}
          backLabel="Quay lại trang phòng"
        />
      </CheckoutPageLayout>
    );
  }


  if (tOut <= tIn) {
    return (
      <CheckoutPageLayout>
        <CheckoutError
          title="Thời gian trả phòng không hợp lệ"
          message="Thời gian trả phòng phải sau thời gian nhận phòng."
          backHref={`/rooms/${roomId}`}
          backLabel="Quay lại trang phòng"
        />
      </CheckoutPageLayout>
    );
  }

  const durationHours = Math.ceil((tOut - tIn) / (60 * 60 * 1000));
  if (durationHours < 2) {
    return (
      <CheckoutPageLayout>
        <CheckoutError
          title="Thời lượng thuê không hợp lệ"
          message="Thời lượng thuê phòng theo giờ tối thiểu là 2 giờ."
          backHref={`/rooms/${roomId}`}
          backLabel="Quay lại trang phòng"
        />
      </CheckoutPageLayout>
    );
  }

  // Tải thông tin phòng để hiển thị tên nếu có lỗi
  // gross_amount_vnd được tính server-side bởi RPC create_hourly_checkout_session_atomic
  // (hourly_price_vnd × số giờ) — không cần tính ở đây nữa.
  const { data: room, error: roomError } = await getPublicRoomById(roomId);

  if (roomError || !room) {
    return (
      <CheckoutPageLayout>
        <CheckoutError
          title="Không tìm thấy phòng"
          message="Phòng bạn chọn không còn tồn tại hoặc đã bị ẩn khỏi danh mục. Vui lòng chọn phòng khác."
        />
      </CheckoutPageLayout>
    );
  }

  // Tạo checkout session mới qua RPC (gross_amount_vnd được tính server-side từ hourly_price_vnd × số giờ)
  const { sessionId: newSessionId, error: createError } =
    await createCheckoutSession({
      roomId: room.id,
      checkInAt: new Date(tIn).toISOString(),
      checkOutAt: new Date(tOut).toISOString(),
    });

  if (createError || !newSessionId) {
    const isConflict =
      createError?.includes("vừa được một khách khác chọn") ||
      createError?.includes("Phòng đã được đặt") ||
      createError?.includes("ROOM_TEMPORARILY_HELD") ||
      createError?.includes("ROOM_NOT_AVAILABLE");

    if (isConflict) {
      redirect(`/rooms/${roomId}?conflict=held`);
    }

    return (
      <CheckoutPageLayout>
        <CheckoutError
          title="Không thể tạo phiên đặt phòng"
          message={
            createError ??
            "Đã xảy ra lỗi khi khởi tạo phiên thanh toán. Vui lòng thử lại sau."
          }
          backHref={`/rooms/${roomId}`}
          backLabel="Quay lại trang phòng"
        />
      </CheckoutPageLayout>
    );
  }

  // Redirect canonical sang /checkout?sessionId=<id> để tránh tạo lại session khi F5.
  // Từ đây trở đi, mọi request đến /checkout?sessionId=... sẽ dùng nhánh existingSessionId bên trên.
  redirect(`/checkout?sessionId=${newSessionId}`);
}

// ---------------------------------------------------------------------------
// Layout wrapper — tránh lặp lại cấu trúc HTML
// ---------------------------------------------------------------------------

interface CheckoutPageLayoutProps {
  children: React.ReactNode;
}

function CheckoutPageLayout({ children }: CheckoutPageLayoutProps) {
  return (
    <div className="min-h-screen bg-white">
      {/* Page header */}
      <div className="bg-white border-b border-[#E5E5E5]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link
            href="/rooms"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#707072] hover:text-[#111111] transition-colors"
            aria-label="Quay lại danh sách phòng"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">Danh sách phòng</span>
          </Link>

          {/* Step indicator */}
          <div className="flex items-center gap-2" aria-label="Các bước đặt phòng">
            {/* Bước 1 */}
            <div className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-[#111111] text-white text-[11px] font-medium flex items-center justify-center">
                ✓
              </span>
              <span className="text-xs font-medium text-[#111111] hidden sm:inline">
                Chọn phòng
              </span>
            </div>

            <div className="w-6 h-px bg-[#E5E5E5]" aria-hidden="true" />

            {/* Bước 2 — Hiện tại */}
            <div className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full border border-[#111111] text-[#111111] text-[11px] font-medium flex items-center justify-center">
                2
              </span>
              <span className="text-xs font-medium text-[#111111] hidden sm:inline">
                Thanh toán
              </span>
            </div>

            <div className="w-6 h-px bg-[#E5E5E5]" aria-hidden="true" />

            {/* Bước 3 */}
            <div className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full border border-[#E5E5E5] text-[#9E9EA0] text-[11px] font-medium flex items-center justify-center">
                3
              </span>
              <span className="text-xs font-medium text-[#9E9EA0] hidden sm:inline">
                Kỳ nghỉ
              </span>
            </div>
          </div>

          {/* Trust badges */}
          <div className="flex items-center gap-1.5 text-xs text-[#707072]">
            <ShieldCheck
              className="w-4 h-4 text-[#707072] shrink-0"
              aria-hidden="true"
            />
            <span className="hidden sm:inline">Bảo mật SSL</span>
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 animate-page-entrance">
        {/* Page title */}
        <div className="mb-8">
          <span className="text-[11px] font-medium tracking-widest uppercase text-[#707072] block mb-1">
            Đặt phòng trực tuyến
          </span>
          <h1 className="text-2xl sm:text-3xl font-medium text-[#111111] tracking-tight">
            Xác nhận & Thanh toán
          </h1>
          <p className="text-sm text-[#707072] mt-1.5">
            Kiểm tra thông tin đặt phòng, áp voucher và hoàn tất
            thanh toán chuyển khoản qua VietQR.
          </p>
        </div>

        {/* Checkout content (BookingSummary + QRModal) */}
        {children}

        {/* Footer trust block */}
        <div className="mt-12 pt-6 border-t border-[#E5E5E5] text-center space-y-1.5">
          <p className="text-xs text-[#707072]">
            Kapi Stay Concierge không lưu thông tin tài khoản hay thẻ của bạn.
            Thanh toán được xác nhận qua đối soát giao dịch VietQR.
          </p>
          <p className="text-xs text-[#707072]">
            Cần trợ giúp?{" "}
            {process.env.NEXT_PUBLIC_SUPPORT_PHONE?.trim() ? (
              <a
                href={`tel:${process.env.NEXT_PUBLIC_SUPPORT_PHONE.trim()}`}
                className="text-[#111111] underline font-medium"
              >
                Liên hệ hotline hỗ trợ
              </a>
            ) : (
              <span className="text-[#111111] font-medium">
                Liên hệ lễ tân để được hỗ trợ
              </span>
            )}
          </p>
        </div>
      </main>
    </div>
  );
}
