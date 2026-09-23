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
import { ArrowLeft, ShieldCheck, Clock } from "lucide-react";
import { requireBookingAuth } from "@/lib/auth/booking-gate";
import {
  createCheckoutSession,
  getCheckoutSession,
  getUserAvailableVouchers,
} from "@/lib/data/checkout";
import { getPublicRoomById } from "@/lib/data/rooms";
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
    guests?: string;
    sessionId?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidUUID(v: unknown): v is string {
  return typeof v === "string" && UUID_REGEX.test(v);
}

function isValidDate(v: unknown): v is string {
  return typeof v === "string" && DATE_REGEX.test(v);
}

// ---------------------------------------------------------------------------
// Page Component (Server)
// ---------------------------------------------------------------------------

export default async function CheckoutPage({
  searchParams,
}: CheckoutPageProps) {
  // ── 1. Đọc searchParams TRƯỚC để xây dựng returnUrl đầy đủ ──────────────────
  //    Bảo lưu toàn bộ query params (roomId, checkIn, checkOut, guests)
  //    vào returnUrl trước khi gọi auth. Nếu user chưa đăng nhập,
  //    sau login sẽ redirect đúng về phòng và ngày đã chọn.
  const params = await searchParams;
  const {
    roomId,
    checkIn,
    checkOut,
    guests: guestsStr,
    sessionId: existingSessionId,
  } = params;

  // Xây dựng returnUrl chứa đủ query params để sau login quay lại đúng trang
  const rawQuery = new URLSearchParams();
  if (roomId) rawQuery.set("roomId", roomId);
  if (checkIn) rawQuery.set("checkIn", checkIn);
  if (checkOut) rawQuery.set("checkOut", checkOut);
  if (guestsStr) rawQuery.set("guests", guestsStr);
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

    // Session hợp lệ — tải voucher và render
    const { data: vouchers } = await getUserAvailableVouchers(user.id);

    return (
      <CheckoutPageLayout sessionId={existingSession.id}>
        <CheckoutClient
          session={existingSession}
          initialVouchers={vouchers ?? []}
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

  // Validate ngày
  if (!isValidDate(checkIn) || !isValidDate(checkOut)) {
    return (
      <CheckoutPageLayout>
        <CheckoutError
          title="Ngày lưu trú không hợp lệ"
          message="Ngày nhận phòng hoặc trả phòng không đúng định dạng. Vui lòng quay lại và chọn ngày lại."
          backHref={`/rooms/${roomId}`}
          backLabel="Quay lại trang phòng"
        />
      </CheckoutPageLayout>
    );
  }

  // Validate logic ngày
  // [RE-REVIEW #2 — Điểm 5] Tính ngày hôm nay theo múi giờ Asia/Ho_Chi_Minh.
  // Dùng Intl.DateTimeFormat để tránh lỗi lệch ngày ở khung giờ 00:00–06:59 VN
  // khi server chạy UTC (new Date().toISOString().split("T")[0] sẽ trả ngày hôm qua).
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date()); // → "YYYY-MM-DD"
  if (checkIn < today) {
    return (
      <CheckoutPageLayout>
        <CheckoutError
          title="Ngày nhận phòng không hợp lệ"
          message="Ngày nhận phòng không thể ở trong quá khứ. Vui lòng chọn ngày từ hôm nay trở đi."
          backHref={`/rooms/${roomId}`}
          backLabel="Quay lại trang phòng"
        />
      </CheckoutPageLayout>
    );
  }

  if (checkOut <= checkIn) {
    return (
      <CheckoutPageLayout>
        <CheckoutError
          title="Ngày trả phòng không hợp lệ"
          message="Ngày trả phòng phải sau ngày nhận phòng ít nhất 1 đêm."
          backHref={`/rooms/${roomId}`}
          backLabel="Quay lại trang phòng"
        />
      </CheckoutPageLayout>
    );
  }

  // Parse số khách
  const guestCount = Math.max(1, parseInt(guestsStr ?? "1", 10) || 1);

  // Tải thông tin phòng để hiển thị tên và kiểm tra capacity phía client.
  // gross_amount_vnd được tính server-side bởi RPC create_checkout_session_atomic
  // (nightly_price_vnd × số đêm) — không cần tính ở đây nữa.
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

  // Kiểm tra số khách không vượt capacity (pre-flight trước khi gọi RPC)
  if (guestCount > room.capacity) {
    return (
      <CheckoutPageLayout>
        <CheckoutError
          title="Vượt quá sức chứa phòng"
          message={`Phòng ${room.name} chỉ chứa tối đa ${room.capacity} khách. Vui lòng chọn lại số lượng khách.`}
          backHref={`/rooms/${roomId}`}
          backLabel="Quay lại trang phòng"
        />
      </CheckoutPageLayout>
    );
  }

  // Tạo checkout session mới qua RPC (gross_amount_vnd được tính server-side).
  // Không truyền grossAmountVnd — RPC tự tính từ nightly_price_vnd × số đêm.
  const { sessionId: newSessionId, error: createError } =
    await createCheckoutSession({
      roomId: room.id,
      checkIn,
      checkOut,
      guestCount,
    });

  if (createError || !newSessionId) {
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
  sessionId?: string;
}

function CheckoutPageLayout({ children, sessionId }: CheckoutPageLayoutProps) {
  return (
    <div className="min-h-screen bg-light/40">
      {/* Page header */}
      <div className="bg-white border-b border-dark/10 shadow-2xs">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link
            href="/rooms"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-dark/60 hover:text-primary transition-colors"
            aria-label="Quay lại danh sách phòng"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">Danh sách phòng</span>
          </Link>

          {/* Step indicator */}
          <div className="flex items-center gap-2" aria-label="Các bước đặt phòng">
            {/* Bước 1 */}
            <div className="flex items-center gap-1.5">
              <span className="w-6 h-6 rounded-full bg-secondary/30 text-secondary-800 text-xs font-bold flex items-center justify-center">
                ✓
              </span>
              <span className="text-xs font-medium text-secondary-700 hidden sm:inline">
                Chọn phòng
              </span>
            </div>

            <div className="w-6 h-px bg-dark/20" aria-hidden="true" />

            {/* Bước 2 — Hiện tại */}
            <div className="flex items-center gap-1.5">
              <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">
                2
              </span>
              <span className="text-xs font-semibold text-primary hidden sm:inline">
                Thanh toán
              </span>
            </div>

            <div className="w-6 h-px bg-dark/20" aria-hidden="true" />

            {/* Bước 3 */}
            <div className="flex items-center gap-1.5">
              <span className="w-6 h-6 rounded-full bg-dark/15 text-dark/50 text-xs font-bold flex items-center justify-center">
                3
              </span>
              <span className="text-xs font-medium text-dark/40 hidden sm:inline">
                Kỳ nghỉ
              </span>
            </div>
          </div>

          {/* Trust badges */}
          <div className="flex items-center gap-1.5 text-xs text-dark/50">
            <ShieldCheck
              className="w-4 h-4 text-secondary shrink-0"
              aria-hidden="true"
            />
            <span className="hidden sm:inline">Bảo mật SSL</span>
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Page title */}
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-dark tracking-tight">
            Xác nhận & Thanh toán
          </h1>
          <p className="text-sm text-dark/55 mt-1">
            Kiểm tra thông tin đặt phòng, áp voucher (nếu có) và hoàn tất
            thanh toán qua VietQR.
          </p>
        </div>

        {/* Session timer warning */}
        {sessionId && (
          <div
            role="note"
            className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5"
          >
            <Clock
              className="w-4 h-4 text-amber-600 shrink-0"
              aria-hidden="true"
            />
            <p className="text-xs text-amber-800 font-medium">
              Phiên đặt phòng có hiệu lực trong{" "}
              <strong>30 phút</strong>. Vui lòng hoàn tất thanh toán trước khi
              hết hạn.
            </p>
          </div>
        )}

        {/* Checkout content (BookingSummary + QRModal) */}
        {children}

        {/* Footer trust block */}
        <div className="mt-8 pt-6 border-t border-dark/10 text-center space-y-1">
          <p className="text-xs text-dark/40">
            🔒 Kapi Stay Concierge không lưu thông tin thẻ ngân hàng của bạn.
            Thanh toán được xác nhận qua đối soát chuyển khoản VietQR.
          </p>
          <p className="text-xs text-dark/35">
            Gặp vấn đề?{" "}
            <a
              href="tel:+84000000000"
              className="text-primary hover:underline font-medium"
            >
              Liên hệ hỗ trợ
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
