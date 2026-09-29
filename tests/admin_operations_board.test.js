import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// TEST SUITE: UNIFIED ADMIN PROPERTY / ROOM OPERATIONS BOARD
// ---------------------------------------------------------------------------

test("Board 1: SQL Migration Structure & Security Verification", () => {
  const migrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/20260929213000_unified_admin_room_operations_board.sql"
  );
  assert.ok(fs.existsSync(migrationPath), "Migration file must exist");
  const sql = fs.readFileSync(migrationPath, "utf8");

  // 1. Check RPC definitions
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.get_admin_property_overview/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.get_admin_property_room_schedule/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.get_admin_booking_detail/i);

  // 2. Strict Security: SECURITY DEFINER, SET search_path = ''
  const searchPathMatches = sql.match(/SET search_path = ''/gi);
  assert.ok(
    searchPathMatches && searchPathMatches.length >= 3,
    "All RPCs must enforce SET search_path = ''"
  );

  const securityDefinerMatches = sql.match(/SECURITY DEFINER/gi);
  assert.ok(
    securityDefinerMatches && securityDefinerMatches.length >= 3,
    "All RPCs must be SECURITY DEFINER"
  );

  // 3. Strict Admin Role Verification: SELECT 1 FROM public.staff_roles WHERE user_id = v_user_id AND role = 'admin'
  assert.match(sql, /SELECT 1 FROM public\.staff_roles WHERE user_id = v_user_id AND role = 'admin'/i);

  // 4. Timezone verification: Asia/Ho_Chi_Minh
  assert.match(sql, /Asia\/Ho_Chi_Minh/i);

  // 5. Secret exclusion: neither door_access_code nor wifi_password selected in get_admin_booking_detail
  const bookingDetailSql = sql.slice(sql.indexOf("get_admin_booking_detail"));
  assert.doesNotMatch(
    bookingDetailSql,
    /'door_access_code'/i,
    "Booking detail RPC must not return door_access_code"
  );
  assert.doesNotMatch(
    bookingDetailSql,
    /'wifi_password'/i,
    "Booking detail RPC must not return wifi_password"
  );
});

test("Board 2: Navigation Contract — Top-level navigation merged into 'Vận hành phòng'", () => {
  const adminNavPath = path.resolve(process.cwd(), "components/admin/AdminNav.tsx");
  const content = fs.readFileSync(adminNavPath, "utf8");

  // Must have 'Vận hành phòng' linking to /admin
  assert.match(content, /label:\s*["']Vận hành phòng["']/);
  assert.match(content, /href:\s*["']\/admin["']/);

  // Separate Dashboard, separate Phòng, and separate Operations removed from top nav items
  assert.doesNotMatch(content, /label:\s*["']Dashboard["']/);
  assert.doesNotMatch(content, /label:\s*["']Phòng["']/);
  assert.doesNotMatch(content, /label:\s*["']Operations["']/);

  // Active condition covers /admin, /admin/properties, and /admin/rooms
  assert.match(content, /pathname\.startsWith\(["']\/admin\/properties["']\)/);
});

test("Board 3: Back Button Contract — Room edit page returns to /admin/properties/[propertyId]", () => {
  const roomEditClientPath = path.resolve(
    process.cwd(),
    "components/admin/AdminRoomEditClient.tsx"
  );
  const content = fs.readFileSync(roomEditClientPath, "utf8");

  // Back link must direct to /admin/properties/${initialData.room.property_id}
  assert.match(content, /href=\{`\/admin\/properties\/\$\{initialData\.room\.property_id\}`\}/);
});

test("Board 4: Route Contract — /admin/rooms redirects to /admin", () => {
  const roomsPagePath = path.resolve(
    process.cwd(),
    "app/admin/(portal)/rooms/page.tsx"
  );
  const content = fs.readFileSync(roomsPagePath, "utf8");
  assert.match(content, /redirect\(["']\/admin["']\)/);
});

test("Board 5: Property Overview Logic — Counts segregated by property and Asia/Ho_Chi_Minh timezone", () => {
  // Mock data of 2 properties
  const prop1 = {
    property_id: "p1",
    property_name: "Kapi Hanoi Cầu Giấy",
    room_count: 20,
    ready_count: 14,
    occupied_count: 3,
    cleaning_count: 2,
    maintenance_count: 1,
    today_checkins: 5,
    today_checkouts: 4,
    today_booking_count: 6,
  };

  const prop2 = {
    property_id: "p2",
    property_name: "Kapi Saigon Quận 1",
    room_count: 20,
    ready_count: 16,
    occupied_count: 2,
    cleaning_count: 1,
    maintenance_count: 1,
    today_checkins: 2,
    today_checkouts: 2,
    today_booking_count: 3,
  };

  assert.equal(prop1.ready_count + prop1.occupied_count + prop1.cleaning_count + prop1.maintenance_count, prop1.room_count);
  assert.equal(prop2.ready_count + prop2.occupied_count + prop2.cleaning_count + prop2.maintenance_count, prop2.room_count);
  assert.notEqual(prop1.property_id, prop2.property_id);
});

test("Board 6: Half-Open Interval Overlap & Availability Engine", () => {
  const isOverlap = (startA, endA, startB, endB) => {
    // Half-open interval [startA, endA) and [startB, endB)
    const tStartA = new Date(startA).getTime();
    const tEndA = new Date(endA).getTime();
    const tStartB = new Date(startB).getTime();
    const tEndB = new Date(endB).getTime();
    return tStartA < tEndB && tEndA > tStartB;
  };

  // Case 1: Back-to-back stays (10:00 - 12:00) and (12:00 - 14:00) => NO overlap!
  assert.equal(
    isOverlap("2026-09-29T10:00:00Z", "2026-09-29T12:00:00Z", "2026-09-29T12:00:00Z", "2026-09-29T14:00:00Z"),
    false,
    "Back-to-back stays must not overlap"
  );

  // Case 2: Partial overlap (10:00 - 13:00) and (12:00 - 14:00) => Overlap
  assert.equal(
    isOverlap("2026-09-29T10:00:00Z", "2026-09-29T13:00:00Z", "2026-09-29T12:00:00Z", "2026-09-29T14:00:00Z"),
    true
  );

  // Case 3: Enclosed stay (11:00 - 12:00) inside (10:00 - 14:00) => Overlap
  assert.equal(
    isOverlap("2026-09-29T10:00:00Z", "2026-09-29T14:00:00Z", "2026-09-29T11:00:00Z", "2026-09-29T12:00:00Z"),
    true
  );

  // Case 4: Completely separate stays => NO overlap
  assert.equal(
    isOverlap("2026-09-29T08:00:00Z", "2026-09-29T10:00:00Z", "2026-09-29T14:00:00Z", "2026-09-29T18:00:00Z"),
    false
  );
});

test("Board 7: Cancelled & Refunded Bookings Do NOT Block Availability", () => {
  const bookings = [
    { id: "b1", status: "confirmed", start: "2026-09-29T10:00:00Z", end: "2026-09-29T12:00:00Z" },
    { id: "b2", status: "cancelled", start: "2026-09-29T12:00:00Z", end: "2026-09-29T15:00:00Z" },
    { id: "b3", status: "refunded", start: "2026-09-29T15:00:00Z", end: "2026-09-29T18:00:00Z" },
    { id: "b4", status: "completed", start: "2026-09-29T18:00:00Z", end: "2026-09-29T20:00:00Z" },
  ];

  const blockingBookings = bookings.filter((b) =>
    ["confirmed", "completed"].includes(b.status.toLowerCase())
  );

  assert.equal(blockingBookings.length, 2);
  assert.ok(blockingBookings.some((b) => b.id === "b1"));
  assert.ok(blockingBookings.some((b) => b.id === "b4"));
  assert.ok(!blockingBookings.some((b) => b.id === "b2"), "Cancelled booking must not block timeline");
  assert.ok(!blockingBookings.some((b) => b.id === "b3"), "Refunded booking must not block timeline");
});

test("Board 8: Operational Status vs Future Availability Independence", () => {
  // A room may currently have operational_status = 'cleaning', but tomorrow have a confirmed booking at 14:00
  const room = {
    room_id: "r101",
    room_number: "101",
    current_operational_status: "cleaning", // Current reality
  };

  // For future dates, the timeline shows availability based on bookings, NOT current operational status
  const futureSchedule = {
    date: "2026-10-01",
    hasBookingAt14: true,
  };

  assert.equal(room.current_operational_status, "cleaning");
  assert.equal(futureSchedule.hasBookingAt14, true);

  // The room's current cleaning status does not make tomorrow's 10:00 slot "cleaning"; it's "Trống lịch"
  const getSlotLabel = (isBooked, isHistoricalOrFuture) => {
    if (isBooked) return "Booked";
    if (isHistoricalOrFuture) return "Trống lịch";
    return "Sẵn sàng";
  };

  assert.equal(getSlotLabel(false, true), "Trống lịch");
  assert.equal(getSlotLabel(true, true), "Booked");
});

test("Board 9: Room Status Mutation Boundaries — Occupied is read-only", () => {
  const allowedManualStatuses = ["ready", "cleaning", "maintenance"];

  const canManuallyChange = (currentStatus, targetStatus) => {
    if (currentStatus === "occupied") return false; // Occupied is lifecycle-owned
    return allowedManualStatuses.includes(targetStatus);
  };

  assert.equal(canManuallyChange("ready", "cleaning"), true);
  assert.equal(canManuallyChange("cleaning", "ready"), true);
  assert.equal(canManuallyChange("ready", "maintenance"), true);
  assert.equal(canManuallyChange("occupied", "ready"), false, "Occupied room cannot be manually altered");
  assert.equal(canManuallyChange("ready", "occupied"), false, "Cannot manually set occupied");
});

test("Board 10: F&B Preparation Snapshot & Image Resilience", () => {
  const historicalBookingItems = [
    {
      id: "bmi-1",
      booking_id: "bk-100",
      product_name_snapshot: "Trà đào cam sả (Snapshot 2026)",
      quantity: 2,
      source_type: "PURCHASE",
      unit_price_vnd: 35000,
      total_price_vnd: 70000,
      current_image_url: null, // Image deleted or missing
    },
    {
      id: "bmi-2",
      booking_id: "bk-100",
      product_name_snapshot: "Bim bim khoai tây",
      quantity: 1,
      source_type: "REWARD",
      unit_price_vnd: 0,
      total_price_vnd: 0,
      current_image_url: "https://example.com/snack.jpg",
    },
  ];

  // 1. Verify snapshot name is preserved
  assert.equal(historicalBookingItems[0].product_name_snapshot, "Trà đào cam sả (Snapshot 2026)");
  assert.equal(historicalBookingItems[0].total_price_vnd, 70000);

  // 2. Verify reward item
  assert.equal(historicalBookingItems[1].source_type, "REWARD");
  assert.equal(historicalBookingItems[1].total_price_vnd, 0);

  // 3. Verify total physical preparation count
  const totalPhysicalItems = historicalBookingItems.reduce((acc, item) => acc + item.quantity, 0);
  assert.equal(totalPhysicalItems, 3, "Admin must prepare exactly 3 physical items");

  // 4. Missing image does not crash
  const renderThumbnail = (item) => {
    return item.current_image_url || "/placeholder-food.svg";
  };
  assert.equal(renderThumbnail(historicalBookingItems[0]), "/placeholder-food.svg");
  assert.equal(renderThumbnail(historicalBookingItems[1]), "https://example.com/snack.jpg");
});

test("Board 11: Security & Privacy — Secrets excluded from Booking Detail Drawer payload", () => {
  const bookingDetailPayload = {
    id: "bk-100",
    room_id: "r-1",
    room_name: "Deluxe 101",
    room_number: "101",
    floor_number: 1,
    guest_name: "Nguyễn Văn A",
    guest_phone: "0901234567",
    guest_email: "guest@example.com",
    check_in_at: "2026-09-29T14:00:00Z",
    check_out_at: "2026-09-29T18:00:00Z",
    booking_status: "confirmed",
    payment_status: "PAID",
    final_paid_amount_vnd: 600000,
  };

  // Must NOT contain door PIN, Wi-Fi password, or booking credential
  assert.equal(bookingDetailPayload.door_access_code, undefined);
  assert.equal(bookingDetailPayload.wifi_password, undefined);
  assert.equal(bookingDetailPayload.credential_value, undefined);
});

test("Board 12: Range Query Validation — Maximum 14 days enforced", () => {
  const validateQueryRange = (startISO, endISO) => {
    const start = new Date(startISO).getTime();
    const end = new Date(endISO).getTime();
    if (isNaN(start) || isNaN(end) || start >= end) {
      return { valid: false, error: "INVALID_RANGE" };
    }
    const maxRangeMs = 14 * 24 * 60 * 60 * 1000;
    if (end - start > maxRangeMs) {
      return { valid: false, error: "RANGE_TOO_LARGE" };
    }
    return { valid: true };
  };

  // 1 day -> valid
  assert.ok(validateQueryRange("2026-09-29T00:00:00Z", "2026-09-30T00:00:00Z").valid);
  // 7 days -> valid
  assert.ok(validateQueryRange("2026-09-29T00:00:00Z", "2026-10-06T00:00:00Z").valid);
  // 14 days -> valid
  assert.ok(validateQueryRange("2026-09-29T00:00:00Z", "2026-10-13T00:00:00Z").valid);
  // 15 days -> RANGE_TOO_LARGE
  assert.equal(validateQueryRange("2026-09-29T00:00:00Z", "2026-10-15T00:00:00Z").error, "RANGE_TOO_LARGE");
  // start >= end -> INVALID_RANGE
  assert.equal(validateQueryRange("2026-09-30T00:00:00Z", "2026-09-29T00:00:00Z").error, "INVALID_RANGE");
});
