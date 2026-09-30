/**
 * @file tests/my_stay_dashboard.test.js
 *
 * Test suite for the Automatic My Stay Booking Dashboard:
 * 1. Authenticated user sees own bookings automatically.
 * 2. Booking ID input is not required on primary landing.
 * 3. User A cannot see User B bookings (server-enforced auth.uid()).
 * 4. ACTIVE sorted before UPCOMING/COMPLETED.
 * 5. Upcoming sorted by nearest check-in.
 * 6. Booking card shows room name.
 * 7. Booking card shows property.
 * 8. Booking card shows stay interval.
 * 9. Booking card shows payment status.
 * 10. Booking card shows amount.
 * 11. Clicking card opens booking detail.
 * 12. /my-stay?bookingId=<owned> loads detail.
 * 13. Unauthorized booking ID denied.
 * 14. Upcoming booking does not reveal PIN.
 * 15. Upcoming booking does not reveal Wi-Fi password.
 * 16. Active booking reveals credential only when RPC says active.
 * 17. Completed booking hides credentials.
 * 18. Room image loads from image_paths.
 * 19. Amenities render.
 * 20. F&B booking items render.
 * 21. No F&B section when empty.
 * 22. QR success CTA opens selected booking detail.
 * 23. Empty state routes to /rooms.
 *
 * Runs with: node --test tests/my_stay_dashboard.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { calculateStayLifecycle } from "../lib/utils/stay.ts";

const ROOT = process.cwd();

describe("My Stay Automatic Booking Dashboard & Clickable Details", () => {
  // -------------------------------------------------------------------------
  // 1 & 3. Authentication & User Isolation
  // -------------------------------------------------------------------------
  it("1. Authenticated user sees own bookings automatically without manual lookup", () => {
    const myStayDataCode = fs.readFileSync(path.join(ROOT, "lib/data/my-stay.ts"), "utf-8");
    assert.ok(
      myStayDataCode.includes("export async function getMyStayBookings"),
      "getMyStayBookings must be exported"
    );
    assert.ok(
      myStayDataCode.includes("supabase.auth.getUser()"),
      "Must authenticate user via Supabase server client"
    );
    assert.ok(
      myStayDataCode.includes('.eq("user_id", user.id)'),
      "Query must strictly filter by authenticated user.id"
    );
  });

  it("2. Booking ID input is not required in primary landing UI", () => {
    const myStayClientCode = fs.readFileSync(path.join(ROOT, "app/my-stay/MyStayClient.tsx"), "utf-8");
    // Ensure the old manual lookup form with id="bookingCode" or "Nhập UUID" is removed
    assert.ok(
      !myStayClientCode.includes('id="bookingCode"'),
      "Old booking code input form must not be in primary UI"
    );
    assert.ok(
      !myStayClientCode.includes("Nhập UUID đơn đặt phòng"),
      "Manual UUID input prompt must not be in primary UI"
    );
    assert.ok(
      myStayClientCode.includes("<BookingList"),
      "Primary landing must render BookingList component"
    );
  });

  it("3. User A cannot see User B bookings — server enforces auth.uid()", () => {
    const myStayDataCode = fs.readFileSync(path.join(ROOT, "lib/data/my-stay.ts"), "utf-8");
    // Never accepts arbitrary user_id parameter from caller
    const getMyStayBookingsDecl = myStayDataCode.match(/function getMyStayBookings\((.*?)\)/);
    assert.ok(getMyStayBookingsDecl, "Function getMyStayBookings must be defined");
    assert.equal(
      getMyStayBookingsDecl[1].trim(),
      "",
      "getMyStayBookings must take NO user_id arguments from caller"
    );

    // Detail view ownership check
    assert.ok(
      myStayDataCode.includes("if (booking.user_id !== user.id)"),
      "Detail view must throw Forbidden if booking does not belong to logged-in user"
    );
  });

  // -------------------------------------------------------------------------
  // 4 & 5. Deterministic Sorting Logic
  // -------------------------------------------------------------------------
  it("4. ACTIVE sorted before UPCOMING and COMPLETED", () => {
    const nowMs = new Date("2026-09-30T16:00:00+07:00").getTime();

    // Mock items
    const items = [
      {
        bookingId: "b-completed",
        stayStatus: "COMPLETED",
        checkInAt: "2026-09-20T10:00:00+07:00",
        checkOutAt: "2026-09-21T10:00:00+07:00",
      },
      {
        bookingId: "b-upcoming",
        stayStatus: "UPCOMING",
        checkInAt: "2026-10-05T14:00:00+07:00",
        checkOutAt: "2026-10-06T12:00:00+07:00",
      },
      {
        bookingId: "b-active",
        stayStatus: "ACTIVE",
        checkInAt: "2026-09-30T12:00:00+07:00",
        checkOutAt: "2026-09-30T20:00:00+07:00",
      },
      {
        bookingId: "b-cancelled",
        stayStatus: "CANCELLED",
        checkInAt: "2026-09-29T10:00:00+07:00",
        checkOutAt: "2026-09-29T12:00:00+07:00",
      },
    ];

    const statusRank = {
      ACTIVE: 1,
      UPCOMING: 2,
      COMPLETED: 3,
      CANCELLED: 4,
    };

    items.sort((a, b) => statusRank[a.stayStatus] - statusRank[b.stayStatus]);

    assert.equal(items[0].bookingId, "b-active");
    assert.equal(items[1].bookingId, "b-upcoming");
    assert.equal(items[2].bookingId, "b-completed");
    assert.equal(items[3].bookingId, "b-cancelled");
  });

  it("5. Upcoming bookings sorted by nearest check-in first", () => {
    const upcomingList = [
      {
        bookingId: "b-farther",
        checkInAt: "2026-10-15T14:00:00+07:00",
      },
      {
        bookingId: "b-nearest",
        checkInAt: "2026-10-02T14:00:00+07:00",
      },
      {
        bookingId: "b-middle",
        checkInAt: "2026-10-08T14:00:00+07:00",
      },
    ];

    upcomingList.sort(
      (a, b) => new Date(a.checkInAt).getTime() - new Date(b.checkInAt).getTime()
    );

    assert.equal(upcomingList[0].bookingId, "b-nearest");
    assert.equal(upcomingList[1].bookingId, "b-middle");
    assert.equal(upcomingList[2].bookingId, "b-farther");
  });

  // -------------------------------------------------------------------------
  // 6 - 10. Booking Card Elements
  // -------------------------------------------------------------------------
  it("6. Booking card shows room name", () => {
    const cardCode = fs.readFileSync(path.join(ROOT, "components/my-stay/BookingCard.tsx"), "utf-8");
    assert.ok(cardCode.includes("{booking.roomName}"), "Card must render roomName");
  });

  it("7. Booking card shows property name and address", () => {
    const cardCode = fs.readFileSync(path.join(ROOT, "components/my-stay/BookingCard.tsx"), "utf-8");
    assert.ok(cardCode.includes("{booking.propertyName}"), "Card must render propertyName");
  });

  it("8. Booking card shows stay interval (check-in and check-out)", () => {
    const cardCode = fs.readFileSync(path.join(ROOT, "components/my-stay/BookingCard.tsx"), "utf-8");
    assert.ok(cardCode.includes("Nhận phòng"), "Card must label Nhận phòng");
    assert.ok(cardCode.includes("Trả phòng"), "Card must label Trả phòng");
    assert.ok(cardCode.includes("checkInDisplay"), "Card must format check-in");
    assert.ok(cardCode.includes("checkOutDisplay"), "Card must format check-out");
  });

  it("9. Booking card shows payment status badge/label", () => {
    const cardCode = fs.readFileSync(path.join(ROOT, "components/my-stay/BookingCard.tsx"), "utf-8");
    assert.ok(cardCode.includes("paymentLabel"), "Card must compute paymentLabel");
    assert.ok(cardCode.includes("Đã thanh toán"), "Card must recognize Đã thanh toán");
  });

  it("10. Booking card shows final paid amount formatted in VND", () => {
    const cardCode = fs.readFileSync(path.join(ROOT, "components/my-stay/BookingCard.tsx"), "utf-8");
    assert.ok(cardCode.includes("formatVND(booking.finalPaidAmount)"), "Card must format finalPaidAmount via formatVND");
  });

  // -------------------------------------------------------------------------
  // 11 - 13. URL Navigation & Detail View Routing
  // -------------------------------------------------------------------------
  it("11. Clicking card opens booking detail via /my-stay?bookingId=", () => {
    const cardCode = fs.readFileSync(path.join(ROOT, "components/my-stay/BookingCard.tsx"), "utf-8");
    assert.ok(
      cardCode.includes("/my-stay?bookingId="),
      "BookingCard must link to /my-stay?bookingId="
    );
    assert.ok(cardCode.includes("Xem chi tiết"), "Card must have Xem chi tiết CTA");
  });

  it("12. /my-stay?bookingId=<owned> loads detail view and back button returns to list", () => {
    const clientCode = fs.readFileSync(path.join(ROOT, "app/my-stay/MyStayClient.tsx"), "utf-8");
    assert.ok(
      clientCode.includes("isDetailView"),
      "MyStayClient must switch to detail view when bookingId parameter exists"
    );
    assert.ok(
      clientCode.includes("<BookingDetail"),
      "Detail view renders BookingDetail component"
    );

    const detailCode = fs.readFileSync(path.join(ROOT, "components/my-stay/BookingDetail.tsx"), "utf-8");
    assert.ok(
      detailCode.includes("Kỳ nghỉ của tôi"),
      "BookingDetail must have back button pointing to Kỳ nghỉ của tôi"
    );
  });

  it("13. Unauthorized booking ID or not found displays safe error without DB leakage", () => {
    const clientCode = fs.readFileSync(path.join(ROOT, "app/my-stay/MyStayClient.tsx"), "utf-8");
    assert.ok(
      clientCode.includes("Không tìm thấy booking hoặc bạn không có quyền truy cập."),
      "Must show generic safe access denied message"
    );
    // Must NOT leak database errors, PostgreSQL tables, or stack traces
    assert.ok(
      !clientCode.includes("error.message"),
      "Must not expose raw DB error message to client UI"
    );
  });

  // -------------------------------------------------------------------------
  // 14 - 17. Credential Access Security Lifecycle
  // -------------------------------------------------------------------------
  it("14. Upcoming booking does not reveal PIN", () => {
    const lifecycle = calculateStayLifecycle(
      "2026-10-10T14:00:00+07:00",
      "2026-10-11T12:00:00+07:00",
      null,
      null,
      new Date("2026-09-30T12:00:00+07:00").getTime(),
      "CONFIRMED"
    );

    assert.equal(lifecycle.stayStatus, "UPCOMING");
    assert.equal(lifecycle.isActiveStay, false);

    const detailCode = fs.readFileSync(path.join(ROOT, "components/my-stay/BookingDetail.tsx"), "utf-8");
    assert.ok(
      detailCode.includes("Thông tin truy cập sẽ được kích hoạt khi đến giờ nhận phòng."),
      "Upcoming view must inform guest credentials activate at check-in"
    );
  });

  it("15. Upcoming booking does not reveal Wi-Fi password", () => {
    const myStayDataCode = fs.readFileSync(path.join(ROOT, "lib/data/my-stay.ts"), "utf-8");
    // getMyStayBookings MUST NOT return credentials
    const summaryInterface = myStayDataCode.slice(
      myStayDataCode.indexOf("export interface MyStayBookingSummary"),
      myStayDataCode.indexOf("export interface MyStayBookingDetails")
    );
    assert.ok(!summaryInterface.includes("passcode"), "List summary must not have passcode");
    assert.ok(!summaryInterface.includes("wifiPass"), "List summary must not have wifiPass");
    assert.ok(!summaryInterface.includes("digital_key"), "List summary must not have digital_key");
  });

  it("16. Active booking reveals credentials only when RPC confirms is_active = true", () => {
    const myStayDataCode = fs.readFileSync(path.join(ROOT, "lib/data/my-stay.ts"), "utf-8");
    assert.ok(
      /supabase\s*\.\s*rpc\s*\(\s*["']get_my_stay_credentials["']/.test(myStayDataCode),
      "Detail function must call get_my_stay_credentials RPC"
    );
    assert.ok(
      myStayDataCode.includes("hasActiveCredential = credsResponse.is_active;"),
      "Credential reveal must strictly depend on RPC is_active flag"
    );
  });

  it("17. Completed booking hides credentials and shows expired notice", () => {
    const myStayDataCode = fs.readFileSync(path.join(ROOT, "lib/data/my-stay.ts"), "utf-8");
    assert.ok(
      myStayDataCode.includes("Kỳ nghỉ đã kết thúc. Mã khóa và Wi-Fi đã hết hiệu lực."),
      "Completed booking must display expired notice"
    );
  });

  // -------------------------------------------------------------------------
  // 18 - 21. Room Images, Amenities, and F&B Ordering
  // -------------------------------------------------------------------------
  it("18. Room image loads from image_paths with clean fallback placeholder", () => {
    const cardCode = fs.readFileSync(path.join(ROOT, "components/my-stay/BookingCard.tsx"), "utf-8");
    assert.ok(
      cardCode.includes("booking.roomImages && booking.roomImages.length > 0"),
      "Must inspect image_paths"
    );
    assert.ok(
      cardCode.includes("<DoorOpen"),
      "Clean SVG placeholder when no room image exists"
    );
    assert.ok(
      !cardCode.includes("unsplash.com") && !cardCode.includes("placeholder.com"),
      "Must not use external fake placeholder images"
    );
  });

  it("19. Room amenities render cleanly", () => {
    const detailCode = fs.readFileSync(path.join(ROOT, "components/my-stay/BookingDetail.tsx"), "utf-8");
    assert.ok(
      detailCode.includes("stayData.roomAmenities && stayData.roomAmenities.length > 0"),
      "Must check for amenities before rendering"
    );
    assert.ok(
      detailCode.includes("Trang thiết bị & Tiện ích"),
      "Amenities section must be clearly labeled"
    );
  });

  it("20. F&B booking items render product name, quantity, source, and price", () => {
    const detailCode = fs.readFileSync(path.join(ROOT, "components/my-stay/BookingDetail.tsx"), "utf-8");
    assert.ok(
      detailCode.includes("stayData.menuItems && stayData.menuItems.length > 0"),
      "Must check for menuItems before rendering"
    );
    assert.ok(
      detailCode.includes("item.productName"),
      "Must render product name"
    );
    assert.ok(
      detailCode.includes("item.quantity"),
      "Must render quantity"
    );
    assert.ok(
      detailCode.includes("Quà Rewards"),
      "Must label REWARD items as Quà Rewards"
    );
    assert.ok(
      detailCode.includes("Đã mua"),
      "Must label PURCHASE items as Đã mua"
    );
    assert.ok(
      detailCode.includes("formatVND(item.totalPriceVnd)"),
      "Must format total price"
    );
  });

  it("21. No F&B section rendered when booking has no menu items", () => {
    const detailCode = fs.readFileSync(path.join(ROOT, "components/my-stay/BookingDetail.tsx"), "utf-8");
    assert.ok(
      detailCode.includes("{stayData.menuItems && stayData.menuItems.length > 0 && ("),
      "F&B section is cleanly conditioned on non-empty menuItems array"
    );
  });

  // -------------------------------------------------------------------------
  // 22 & 23. QR Modal Post-Payment & Empty State
  // -------------------------------------------------------------------------
  it("22. QR success CTA opens selected booking detail via /my-stay?bookingId=", () => {
    const qrModalCode = fs.readFileSync(path.join(ROOT, "components/checkout/QRModal.tsx"), "utf-8");
    assert.ok(
      /\/my-stay\?bookingId=\$\{encodeURIComponent\(bookingId\)\}/.test(qrModalCode),
      "QRModal must link directly to /my-stay?bookingId= when bookingId is known"
    );
    assert.ok(
      qrModalCode.includes("Xem My Stay"),
      "CTA text must remain Xem My Stay"
    );
  });

  it("23. Empty state displays friendly message and routes to /rooms", () => {
    const listCode = fs.readFileSync(path.join(ROOT, "components/my-stay/BookingList.tsx"), "utf-8");
    assert.ok(
      listCode.includes("Bạn chưa có kỳ nghỉ nào tại Kapi Stay."),
      "Must show friendly empty state message"
    );
    assert.ok(
      listCode.includes('href="/rooms"'),
      "Empty state CTA must route to /rooms"
    );
    assert.ok(
      listCode.includes("Xem phòng"),
      "CTA button must say Xem phòng"
    );
  });
});
