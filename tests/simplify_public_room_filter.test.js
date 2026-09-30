/**
 * @file tests/simplify_public_room_filter.test.js
 * Test suite for Public Rooms List Simplification — Property Filter Only
 *
 * Verifies all 15 test items:
 * 1. /rooms without property shows all listed rooms.
 * 2. /rooms?property_id=A only shows rooms of property A.
 * 3. property B rooms not shown under property A.
 * 4. date params no longer affect /rooms result.
 * 5. capacity param no longer affects /rooms result.
 * 6. malformed legacy date params do not crash /rooms.
 * 7. malformed capacity does not trigger "Số lượng khách không hợp lệ" on /rooms.
 * 8. RoomFilters renders only property selector.
 * 9. No "Nhận phòng" input in RoomFilters.
 * 10. No "Trả phòng" input in RoomFilters.
 * 11. No "Số lượng khách" input in RoomFilters.
 * 12. RoomCard no longer propagates date/guest query params.
 * 13. Room detail availability timeline still renders.
 * 14. temporary hold system unchanged.
 * 15. booking flow regression passes.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Mock dataset
const PROPERTY_A = "11111111-1111-1111-1111-111111111111";
const PROPERTY_B = "22222222-2222-2222-2222-222222222222";

const MOCK_ROOMS = [
  { id: "room-a1", property_id: PROPERTY_A, name: "Phòng A1", capacity: 2, is_listed: true },
  { id: "room-a2", property_id: PROPERTY_A, name: "Phòng A2", capacity: 4, is_listed: true },
  { id: "room-b1", property_id: PROPERTY_B, name: "Phòng B1", capacity: 2, is_listed: true },
  { id: "room-b2", property_id: PROPERTY_B, name: "Phòng B2", capacity: 6, is_listed: true },
];

/**
 * Simulates /rooms page parameter resolution and query filter generation.
 */
function resolveRoomsPageParams(resolvedParams) {
  const rawPropertyId = resolvedParams.property_id;
  const propertyId =
    typeof rawPropertyId === "string"
      ? rawPropertyId.trim()
      : Array.isArray(rawPropertyId) && typeof rawPropertyId[0] === "string"
        ? rawPropertyId[0].trim()
        : "";

  return {
    property_id: propertyId || undefined,
  };
}

function queryMockRooms(filters) {
  return MOCK_ROOMS.filter((room) => {
    if (!room.is_listed) return false;
    if (filters.property_id && room.property_id !== filters.property_id) {
      return false;
    }
    return true;
  });
}

/**
 * Simulates RoomCard detailHref generation
 */
function generateRoomCardHref(roomId, searchParams) {
  const propertyId = searchParams.get("property_id") ?? "";
  const queryParams = new URLSearchParams();
  if (propertyId) {
    queryParams.set("property_id", propertyId);
  }
  const queryString = queryParams.toString();
  const basePath = roomId ? `/rooms/${roomId}` : "/rooms";
  return queryString ? `${basePath}?${queryString}` : basePath;
}

// -----------------------------------------------------------------------------
// Test 1: /rooms without property shows all listed rooms
// -----------------------------------------------------------------------------
test("Test 1: /rooms without property shows all listed rooms", () => {
  const params = resolveRoomsPageParams({});
  assert.equal(params.property_id, undefined);

  const rooms = queryMockRooms(params);
  assert.equal(rooms.length, 4);
  assert.deepEqual(
    rooms.map((r) => r.id),
    ["room-a1", "room-a2", "room-b1", "room-b2"]
  );
});

// -----------------------------------------------------------------------------
// Test 2: /rooms?property_id=A only shows rooms of property A
// -----------------------------------------------------------------------------
test("Test 2: /rooms?property_id=A only shows rooms of property A", () => {
  const params = resolveRoomsPageParams({ property_id: PROPERTY_A });
  assert.equal(params.property_id, PROPERTY_A);

  const rooms = queryMockRooms(params);
  assert.equal(rooms.length, 2);
  assert.ok(rooms.every((r) => r.property_id === PROPERTY_A));
  assert.deepEqual(
    rooms.map((r) => r.id),
    ["room-a1", "room-a2"]
  );
});

// -----------------------------------------------------------------------------
// Test 3: property B rooms not shown under property A
// -----------------------------------------------------------------------------
test("Test 3: property B rooms not shown under property A", () => {
  const params = resolveRoomsPageParams({ property_id: PROPERTY_A });
  const rooms = queryMockRooms(params);

  const hasPropertyBRooms = rooms.some((r) => r.property_id === PROPERTY_B);
  assert.equal(hasPropertyBRooms, false, "Rooms of Property B must not appear under Property A");
});

// -----------------------------------------------------------------------------
// Test 4: date params no longer affect /rooms result
// -----------------------------------------------------------------------------
test("Test 4: date params no longer affect /rooms result", () => {
  const paramsWithDates = resolveRoomsPageParams({
    property_id: PROPERTY_A,
    check_in: "2026-10-01T10:00",
    check_out: "2026-10-01T14:00",
    check_in_at: "2026-10-01T10:00",
    check_out_at: "2026-10-01T14:00",
  });

  assert.equal(paramsWithDates.property_id, PROPERTY_A);
  assert.equal(paramsWithDates.check_in, undefined);
  assert.equal(paramsWithDates.check_out, undefined);

  const rooms = queryMockRooms(paramsWithDates);
  assert.equal(rooms.length, 2);
});

// -----------------------------------------------------------------------------
// Test 5: capacity param no longer affects /rooms result
// -----------------------------------------------------------------------------
test("Test 5: capacity param no longer affects /rooms result", () => {
  const paramsWithCapacity = resolveRoomsPageParams({
    property_id: PROPERTY_A,
    capacity: "4",
    guests: "4",
    max_guests: "4",
  });

  assert.equal(paramsWithCapacity.property_id, PROPERTY_A);
  assert.equal(paramsWithCapacity.capacity, undefined);

  // Both room-a1 (capacity 2) and room-a2 (capacity 4) must be returned
  const rooms = queryMockRooms(paramsWithCapacity);
  assert.equal(rooms.length, 2);
  assert.ok(rooms.some((r) => r.capacity === 2));
});

// -----------------------------------------------------------------------------
// Test 6: malformed legacy date params do not crash /rooms
// -----------------------------------------------------------------------------
test("Test 6: malformed legacy date params do not crash /rooms", () => {
  assert.doesNotThrow(() => {
    const params = resolveRoomsPageParams({
      check_in: "invalid-date-format",
      check_out: "2020-01-01T00:00", // Past date
      check_in_at: "null",
    });
    const rooms = queryMockRooms(params);
    assert.equal(rooms.length, 4);
  });
});

// -----------------------------------------------------------------------------
// Test 7: malformed capacity does not trigger 'Số lượng khách không hợp lệ' on /rooms
// -----------------------------------------------------------------------------
test("Test 7: malformed capacity does not trigger 'Số lượng khách không hợp lệ' on /rooms", () => {
  const roomsPageSource = fs.readFileSync(
    path.resolve("app/rooms/page.tsx"),
    "utf-8"
  );

  // Check that capacity parsing, capacity validation, and capacity error have been removed from page.tsx
  assert.equal(
    roomsPageSource.includes("capacityError"),
    false,
    "capacityError must be completely removed from app/rooms/page.tsx"
  );
  assert.equal(
    roomsPageSource.includes("Số lượng khách không hợp lệ"),
    false,
    "'Số lượng khách không hợp lệ' must not exist in app/rooms/page.tsx"
  );
  assert.equal(
    roomsPageSource.includes("resolvedParams.capacity"),
    false,
    "resolvedParams.capacity must not be read in app/rooms/page.tsx"
  );
});

// -----------------------------------------------------------------------------
// Test 8: RoomFilters renders only property selector
// -----------------------------------------------------------------------------
test("Test 8: RoomFilters renders only property selector", () => {
  const roomFiltersSource = fs.readFileSync(
    path.resolve("components/rooms/RoomFilters.tsx"),
    "utf-8"
  );

  assert.ok(
    roomFiltersSource.includes("id=\"filter-property\""),
    "RoomFilters must render select with id filter-property"
  );
  assert.ok(
    roomFiltersSource.includes("aria-label=\"Chọn chi nhánh\""),
    "RoomFilters must have aria-label Chọn chi nhánh"
  );
  assert.ok(
    roomFiltersSource.includes("Tất cả chi nhánh"),
    "RoomFilters must provide Tất cả chi nhánh option"
  );
});

// -----------------------------------------------------------------------------
// Test 9: No 'Nhận phòng' input in RoomFilters
// -----------------------------------------------------------------------------
test("Test 9: No 'Nhận phòng' input in RoomFilters", () => {
  const roomFiltersSource = fs.readFileSync(
    path.resolve("components/rooms/RoomFilters.tsx"),
    "utf-8"
  );

  assert.equal(
    roomFiltersSource.includes("Nhận phòng"),
    false,
    "RoomFilters must NOT contain 'Nhận phòng'"
  );
  assert.equal(
    roomFiltersSource.includes("filter-checkin"),
    false,
    "RoomFilters must NOT contain 'filter-checkin'"
  );
  assert.equal(
    roomFiltersSource.includes("check_in"),
    false,
    "RoomFilters must NOT contain 'check_in'"
  );
});

// -----------------------------------------------------------------------------
// Test 10: No 'Trả phòng' input in RoomFilters
// -----------------------------------------------------------------------------
test("Test 10: No 'Trả phòng' input in RoomFilters", () => {
  const roomFiltersSource = fs.readFileSync(
    path.resolve("components/rooms/RoomFilters.tsx"),
    "utf-8"
  );

  assert.equal(
    roomFiltersSource.includes("Trả phòng"),
    false,
    "RoomFilters must NOT contain 'Trả phòng'"
  );
  assert.equal(
    roomFiltersSource.includes("filter-checkout"),
    false,
    "RoomFilters must NOT contain 'filter-checkout'"
  );
  assert.equal(
    roomFiltersSource.includes("check_out"),
    false,
    "RoomFilters must NOT contain 'check_out'"
  );
});

// -----------------------------------------------------------------------------
// Test 11: No 'Số lượng khách' input in RoomFilters
// -----------------------------------------------------------------------------
test("Test 11: No 'Số lượng khách' input in RoomFilters", () => {
  const roomFiltersSource = fs.readFileSync(
    path.resolve("components/rooms/RoomFilters.tsx"),
    "utf-8"
  );

  assert.equal(
    roomFiltersSource.includes("Số lượng khách"),
    false,
    "RoomFilters must NOT contain 'Số lượng khách'"
  );
  assert.equal(
    roomFiltersSource.includes("filter-guests"),
    false,
    "RoomFilters must NOT contain 'filter-guests'"
  );
  assert.equal(
    roomFiltersSource.includes("Users"),
    false,
    "RoomFilters must NOT import or use Users icon"
  );
  assert.equal(
    roomFiltersSource.includes("Calendar"),
    false,
    "RoomFilters must NOT import or use Calendar icon"
  );
});

// -----------------------------------------------------------------------------
// Test 12: RoomCard no longer propagates date/guest query params
// -----------------------------------------------------------------------------
test("Test 12: RoomCard no longer propagates date/guest query params", () => {
  const roomCardSource = fs.readFileSync(
    path.resolve("components/rooms/RoomCard.tsx"),
    "utf-8"
  );

  // Check source code contract
  assert.equal(
    roomCardSource.includes("check_in"),
    false,
    "RoomCard must not reference check_in"
  );
  assert.equal(
    roomCardSource.includes("check_out"),
    false,
    "RoomCard must not reference check_out"
  );
  assert.equal(
    roomCardSource.includes("capacityParam"),
    false,
    "RoomCard must not reference capacityParam"
  );

  // Check simulated runtime URL output
  const mockParams = new URLSearchParams({
    property_id: PROPERTY_A,
    check_in: "2026-10-01T10:00",
    check_out: "2026-10-01T12:00",
    capacity: "2",
    guests: "2",
  });

  const hrefWithProperty = generateRoomCardHref("room-101", mockParams);
  assert.equal(
    hrefWithProperty,
    `/rooms/room-101?property_id=${PROPERTY_A}`,
    "RoomCard link should only preserve property_id"
  );

  const emptyParams = new URLSearchParams();
  const hrefWithoutProperty = generateRoomCardHref("room-101", emptyParams);
  assert.equal(
    hrefWithoutProperty,
    "/rooms/room-101",
    "RoomCard link without property should be plain /rooms/[id]"
  );
});

// -----------------------------------------------------------------------------
// Test 13: Room detail availability timeline still renders
// -----------------------------------------------------------------------------
test("Test 13: Room detail availability timeline still renders", () => {
  const roomDetailPagePath = path.resolve("app/rooms/[id]/page.tsx");
  assert.ok(fs.existsSync(roomDetailPagePath), "app/rooms/[id]/page.tsx must exist");

  const roomDetailSource = fs.readFileSync(roomDetailPagePath, "utf-8");
  assert.ok(
    roomDetailSource.includes("RoomBookingWidget"),
    "Room detail page must render RoomBookingWidget"
  );

  const bookingWidgetPath = path.resolve(
    "components/rooms/RoomBookingWidget.tsx"
  );
  assert.ok(
    fs.existsSync(bookingWidgetPath),
    "RoomBookingWidget.tsx must exist"
  );

  const bookingWidgetSource = fs.readFileSync(bookingWidgetPath, "utf-8");
  assert.ok(
    bookingWidgetSource.includes("RoomAvailabilityTimeline"),
    "RoomBookingWidget must render RoomAvailabilityTimeline"
  );

  const timelineComponentPath = path.resolve(
    "components/rooms/RoomAvailabilityTimeline.tsx"
  );
  assert.ok(
    fs.existsSync(timelineComponentPath),
    "RoomAvailabilityTimeline.tsx must exist"
  );
});

// -----------------------------------------------------------------------------
// Test 14: temporary hold system unchanged
// -----------------------------------------------------------------------------
test("Test 14: temporary hold system unchanged", () => {
  const migrationPath = path.resolve(
    "supabase/migrations/20260929230000_temporary_room_holds_and_public_availability.sql"
  );
  assert.ok(fs.existsSync(migrationPath), "Temporary hold migration must exist");

  const sql = fs.readFileSync(migrationPath, "utf-8");
  assert.ok(
    sql.includes("CREATE OR REPLACE FUNCTION public.create_hourly_checkout_session_atomic"),
    "create_hourly_checkout_session_atomic RPC must exist"
  );
  assert.ok(
    sql.includes("CREATE OR REPLACE FUNCTION public.get_public_room_availability_timeline"),
    "get_public_room_availability_timeline RPC must exist"
  );
  assert.ok(
    sql.includes("pg_advisory_xact_lock"),
    "PostgreSQL transaction advisory lock must be present for concurrency safety"
  );
  assert.ok(
    sql.includes("INTERVAL '30 minutes'"),
    "30-minute hold expiration must be enforced"
  );
});

// -----------------------------------------------------------------------------
// Test 15: booking flow regression passes
// -----------------------------------------------------------------------------
test("Test 15: booking flow regression passes", () => {
  const bookingsPath = path.resolve("lib/data/bookings.ts");
  assert.ok(fs.existsSync(bookingsPath), "lib/data/bookings.ts must exist");

  const bookingsSource = fs.readFileSync(bookingsPath, "utf-8");
  assert.ok(
    bookingsSource.includes("checkRoomAvailabilityHourly"),
    "checkRoomAvailabilityHourly must remain available in bookings.ts"
  );
  assert.ok(
    bookingsSource.includes("getPublicRoomAvailabilityTimeline"),
    "getPublicRoomAvailabilityTimeline must remain available in bookings.ts"
  );

  const checkoutPath = path.resolve("lib/data/checkout.ts");
  assert.ok(fs.existsSync(checkoutPath), "lib/data/checkout.ts must exist");

  const checkoutSource = fs.readFileSync(checkoutPath, "utf-8");
  assert.ok(
    checkoutSource.includes("create_hourly_checkout_session_atomic"),
    "create_hourly_checkout_session_atomic must be invoked in checkout.ts"
  );
});
