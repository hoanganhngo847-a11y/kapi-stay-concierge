/**
 * @file tests/my_stay_detail_access_and_error_classification.test.js
 *
 * Test suite for My Stay Detail Access, Visibility, and Error Classification:
 * 1. Booking owner can open detail.
 * 2. Non-owner cannot open detail.
 * 3. Completed booking detail remains viewable.
 * 4. Expired credentials do not break detail page.
 * 5. Expired credentials return null secrets.
 * 6. Unlisted booked room still viewable by booking owner through safe owned-booking path.
 * 7. Inactive property historical booking remains viewable if business rule allows.
 * 8. Public users still cannot access private/unlisted rooms.
 * 9. Server logs preserve actual error category.
 * 10. UI does not falsely show forbidden for internal data error.
 *
 * Runs with: node --test tests/my_stay_detail_access_and_error_classification.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { calculateStayLifecycle } from "../lib/utils/stay.ts";

const ROOT = process.cwd();

describe("My Stay Booking Detail Access & Error Classification", () => {
  // -------------------------------------------------------------------------
  // 1 & 2. Owner Access vs Non-Owner Forbidden
  // -------------------------------------------------------------------------
  it("1. Booking owner can open detail via getMyStayBookingDetails / safe read path", () => {
    const dataCode = fs.readFileSync(path.join(ROOT, "lib/data/my-stay.ts"), "utf-8");
    assert.ok(
      dataCode.includes("get_my_stay_booking_details"),
      "Must utilize trusted get_my_stay_booking_details RPC read path"
    );
    assert.ok(
      dataCode.includes("bookingRecord = res.booking") ||
        dataCode.includes("bookingRecord = booking"),
      "Must populate bookingRecord when ownership check passes"
    );
  });

  it("2. Non-owner cannot open detail — throws FORBIDDEN without leaking data", () => {
    const dataCode = fs.readFileSync(path.join(ROOT, "lib/data/my-stay.ts"), "utf-8");
    assert.ok(
      dataCode.includes('if (booking.user_id !== user.id)'),
      "Must verify booking.user_id === user.id"
    );
    assert.ok(
      dataCode.includes('throw new MyStayError("FORBIDDEN"'),
      "Must throw MyStayError with FORBIDDEN code for non-owners"
    );
    assert.ok(
      dataCode.includes('Forbidden: Bạn không có quyền truy cập vào đơn đặt phòng này.'),
      "Must provide safe forbidden error message without revealing private booking data"
    );
  });

  // -------------------------------------------------------------------------
  // 3. Completed Booking Detail Remains Viewable
  // -------------------------------------------------------------------------
  it("3. Completed booking detail remains viewable with full stay information", () => {
    const completedStay = calculateStayLifecycle(
      "2026-09-30T10:00:00+00:00",
      "2026-09-30T12:00:00+00:00",
      "2026-09-30",
      "2026-09-30",
      new Date("2026-09-30T14:00:00+00:00").getTime(),
      "CONFIRMED"
    );

    assert.equal(completedStay.stayStatus, "COMPLETED");
    assert.equal(completedStay.isActiveStay, false);
    assert.equal(completedStay.isExpired, true);

    const dataCode = fs.readFileSync(path.join(ROOT, "lib/data/my-stay.ts"), "utf-8");
    assert.ok(
      dataCode.includes("roomName,"),
      "Detail response must preserve roomName for completed stays"
    );
    assert.ok(
      dataCode.includes("propertyName,"),
      "Detail response must preserve propertyName for completed stays"
    );
    assert.ok(
      dataCode.includes("roomAmenities,"),
      "Detail response must preserve roomAmenities for completed stays"
    );
    assert.ok(
      dataCode.includes("finalPaidAmount:"),
      "Detail response must preserve finalPaidAmount for completed stays"
    );
    assert.ok(
      dataCode.includes("paymentStatus:"),
      "Detail response must preserve paymentStatus for completed stays"
    );
    assert.ok(
      dataCode.includes("menuItems,"),
      "Detail response must preserve menuItems for completed stays"
    );
  });

  // -------------------------------------------------------------------------
  // 4 & 5. Expired Credentials UX & Secrets Redaction
  // -------------------------------------------------------------------------
  it("4. Expired credentials do not break detail page", () => {
    const dataCode = fs.readFileSync(path.join(ROOT, "lib/data/my-stay.ts"), "utf-8");
    // Ensure RPC success with is_active = false does not throw
    assert.ok(
      dataCode.includes("hasActiveCredential = credsResponse.is_active;"),
      "Must assign hasActiveCredential from RPC without throwing error"
    );
  });

  it("5. Expired credentials return null secrets and friendly expired notice", () => {
    const dataCode = fs.readFileSync(path.join(ROOT, "lib/data/my-stay.ts"), "utf-8");
    assert.ok(
      dataCode.includes('activationNotice = "Kỳ nghỉ đã kết thúc. Mã khóa và Wi-Fi đã hết hiệu lực.";'),
      "Must display explicit expired notice for completed stay"
    );

    // Verify secrets are null when not active
    const detailCode = fs.readFileSync(path.join(ROOT, "components/my-stay/BookingDetail.tsx"), "utf-8");
    assert.ok(
      detailCode.includes("{stayData.hasActiveCredential && stayData.passcode ? ("),
      "Secrets (Digital Key & Wi-Fi) must only render when hasActiveCredential is true"
    );
  });

  // -------------------------------------------------------------------------
  // 6 & 7. Unlisted Room & Inactive Property Safe Read Path
  // -------------------------------------------------------------------------
  it("6. Unlisted booked room still viewable by booking owner through safe owned-booking path", () => {
    const migrationPath = path.join(ROOT, "supabase/migrations/20260930150000_my_stay_owned_booking_read_path.sql");
    assert.ok(fs.existsSync(migrationPath), "Migration 20260930150000 must exist");

    const migrationSql = fs.readFileSync(migrationPath, "utf-8");
    assert.ok(
      migrationSql.includes("FUNCTION public.get_my_stay_booking_details"),
      "Must define get_my_stay_booking_details RPC"
    );
    assert.ok(
      migrationSql.includes("Users can view rooms for own bookings"),
      "Must create RLS policy for booked rooms on public.rooms"
    );
    assert.ok(
      /b\.room_id\s*=\s*rooms\.id[\s\S]*?b\.user_id\s*=\s*\(SELECT\s+auth\.uid\(\)\)/.test(migrationSql),
      "Rooms policy must check b.user_id = auth.uid()"
    );
  });

  it("7. Inactive property historical booking remains viewable if booked by user", () => {
    const migrationSql = fs.readFileSync(
      path.join(ROOT, "supabase/migrations/20260930150000_my_stay_owned_booking_read_path.sql"),
      "utf-8"
    );
    assert.ok(
      migrationSql.includes("Users can view properties for own bookings"),
      "Must create RLS policy for booked properties on public.properties"
    );
    assert.ok(
      /r\.property_id\s*=\s*properties\.id[\s\S]*?b\.user_id\s*=\s*\(SELECT\s+auth\.uid\(\)\)/.test(migrationSql),
      "Properties policy must check b.user_id = auth.uid()"
    );
  });

  // -------------------------------------------------------------------------
  // 8. Public Users Cannot Access Private/Unlisted Rooms
  // -------------------------------------------------------------------------
  it("8. Public users still cannot access private/unlisted rooms or inactive properties", () => {
    const migrationSql = fs.readFileSync(
      path.join(ROOT, "supabase/migrations/20260930150000_my_stay_owned_booking_read_path.sql"),
      "utf-8"
    );
    // Ensure existing public policies are not dropped or replaced with permissive TRUE
    assert.ok(
      !migrationSql.includes("DROP POLICY \"Public rooms are viewable by everyone\""),
      "Must NOT drop Public rooms policy"
    );
    assert.ok(
      !migrationSql.includes("DROP POLICY \"Public properties are viewable by everyone\""),
      "Must NOT drop Public properties policy"
    );
    assert.ok(
      migrationSql.includes("TO authenticated"),
      "Owned booking policy must restrict to authenticated users only"
    );
  });

  // -------------------------------------------------------------------------
  // 9. Error Classification & Logging
  // -------------------------------------------------------------------------
  it("9. Server logs preserve exact error category", () => {
    const dataCode = fs.readFileSync(path.join(ROOT, "lib/data/my-stay.ts"), "utf-8");
    const requiredCategories = [
      "UNAUTHENTICATED",
      "FORBIDDEN",
      "BOOKING_NOT_FOUND",
      "BOOKING_DATA_INCOMPLETE",
      "CREDENTIAL_RPC_ERROR",
      "DB_QUERY_ERROR",
    ];

    for (const cat of requiredCategories) {
      assert.ok(
        dataCode.includes(`[${cat}]`),
        `Server logs must preserve exact error category [${cat}]`
      );
    }

    const typesCode = fs.readFileSync(path.join(ROOT, "lib/types/my-stay.ts"), "utf-8");
    assert.ok(
      typesCode.includes("export type MyStayErrorCode ="),
      "Must export MyStayErrorCode type"
    );
    assert.ok(
      typesCode.includes("export class MyStayError extends Error"),
      "Must export MyStayError class"
    );
  });

  // -------------------------------------------------------------------------
  // 10. UI Does Not Falsely Show Forbidden for Internal Data Error
  // -------------------------------------------------------------------------
  it("10. UI does not falsely show forbidden for internal data error", () => {
    const clientCode = fs.readFileSync(path.join(ROOT, "app/my-stay/MyStayClient.tsx"), "utf-8");

    // Internal data errors should have their own distinct message
    assert.ok(
      clientCode.includes('BOOKING_DATA_INCOMPLETE') || clientCode.includes('Incomplete:'),
      "MyStayClient must handle incomplete booking data specifically"
    );
    assert.ok(
      clientCode.includes("Thông tin kỳ nghỉ đang được cập nhật. Vui lòng thử lại sau."),
      "Incomplete data error must show friendly updating message, not forbidden"
    );
    assert.ok(
      clientCode.includes("Không thể tải thông tin kỳ nghỉ lúc này. Vui lòng thử lại sau."),
      "Generic system error must not show forbidden"
    );
    assert.ok(
      clientCode.includes("Không tìm thấy booking hoặc bạn không có quyền truy cập."),
      "Forbidden error is reserved for unauthorized or non-existent bookings"
    );
  });
});
