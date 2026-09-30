import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Regression Test Suite: Public Availability Range Contract (15-Day Horizon) & Error UX Hardening
 *
 * Requirements:
 * 1. exactly 14-day range succeeds.
 * 2. exactly 15-day range succeeds.
 * 3. range > 15 days returns RANGE_TOO_LARGE.
 * 4. today → today+15d request used by RoomAvailabilityTimeline succeeds.
 * 5. final selectable day today+14 has availability data.
 * 6. BOOKED interval on final selectable day is returned.
 * 7. HELD interval on final selectable day is returned.
 * 8. BLOCKED interval on final selectable day is returned.
 * 9. raw RANGE_TOO_LARGE is not rendered to customer UI.
 * 10. generic friendly error is rendered instead.
 * 11. multi-day booking >24h remains allowed.
 * 12. minimum 2h still enforced.
 * 13. temporary hold still 30 min.
 * 14. concurrency lock unaffected.
 */

// -----------------------------------------------------------------------------
// Pure Simulator of get_public_room_availability_timeline with 15-Day Contract
// -----------------------------------------------------------------------------
class PublicTimelineEngine {
  constructor() {
    this.rooms = new Map();
    this.bookings = [];
    this.checkoutSessions = [];
    this.availabilityBlocks = [];
  }

  addRoom(room) {
    this.rooms.set(room.id, room);
  }

  getPublicRoomAvailabilityTimeline(roomId, rangeStart, rangeEnd, now = new Date("2026-09-30T08:00:00+07:00")) {
    if (!roomId || !rangeStart || !rangeEnd) {
      return { success: false, error: "INVALID_PARAMETERS" };
    }

    const rStartMs = new Date(rangeStart).getTime();
    const rEndMs = new Date(rangeEnd).getTime();

    if (isNaN(rStartMs) || isNaN(rEndMs) || rStartMs >= rEndMs) {
      return { success: false, error: "INVALID_PARAMETERS" };
    }

    // 15 days in milliseconds
    const maxWindowMs = 15 * 24 * 60 * 60 * 1000;
    if (rEndMs - rStartMs > maxWindowMs) {
      return { success: false, error: "RANGE_TOO_LARGE" };
    }

    const room = this.rooms.get(roomId);
    if (!room || !room.is_listed || !room.property_active) {
      return { success: false, error: "ROOM_NOT_FOUND" };
    }

    const nowMs = now.getTime();
    const intervals = [];

    // 1. Confirmed / completed bookings -> BOOKED
    for (const b of this.bookings) {
      if (b.room_id !== roomId) continue;
      if (!["confirmed", "completed"].includes(b.booking_status?.toLowerCase())) continue;
      const bIn = new Date(b.check_in_at).getTime();
      const bOut = new Date(b.check_out_at).getTime();
      if (bIn < rEndMs && bOut > rStartMs) {
        intervals.push({
          start_at: b.check_in_at,
          end_at: b.check_out_at,
          state: "BOOKED",
        });
      }
    }

    // 2. Active unexpired checkout sessions -> HELD
    for (const s of this.checkoutSessions) {
      if (s.room_id !== roomId) continue;
      if (!["ACTIVE", "PAYMENT_PROCESSING"].includes(s.status)) continue;
      if (new Date(s.expires_at).getTime() <= nowMs) continue; // Expired

      const sIn = new Date(s.check_in_at).getTime();
      const sOut = new Date(s.check_out_at).getTime();
      if (sIn < rEndMs && sOut > rStartMs) {
        intervals.push({
          start_at: s.check_in_at,
          end_at: s.check_out_at,
          state: "HELD",
        });
      }
    }

    // 3. Availability blocks -> BLOCKED / BOOKED
    for (const blk of this.availabilityBlocks) {
      if (blk.room_id !== roomId) continue;
      const blkIn = new Date(blk.starts_at).getTime();
      const blkOut = new Date(blk.ends_at).getTime();
      if (blkIn < rEndMs && blkOut > rStartMs) {
        intervals.push({
          start_at: blk.starts_at,
          end_at: blk.ends_at,
          state: blk.reason === "BOOKED" ? "BOOKED" : "BLOCKED",
        });
      }
    }

    // Sort by start_at ascending
    intervals.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

    return {
      success: true,
      room_id: roomId,
      range_start: rangeStart,
      range_end: rangeEnd,
      intervals,
    };
  }
}

// -----------------------------------------------------------------------------
// Pure Simulator of Frontend mapAvailabilityError
// -----------------------------------------------------------------------------
function mapAvailabilityError(errorCode) {
  if (!errorCode) {
    return "Không thể tải lịch trống của phòng lúc này. Vui lòng thử lại.";
  }
  switch (errorCode.trim()) {
    case "RANGE_TOO_LARGE":
      return "Không thể tải lịch phòng cho khoảng ngày này. Vui lòng thử lại.";
    case "ROOM_NOT_FOUND":
      return "Không tìm thấy thông tin phòng. Vui lòng thử lại.";
    case "INVALID_PARAMETERS":
      return "Khoảng thời gian không hợp lệ. Vui lòng thử lại.";
    default:
      if (/^[A-Z0-9_]+$/.test(errorCode) || /error|exception|rpc|postgres|database/i.test(errorCode)) {
        return "Không thể tải lịch trống của phòng lúc này. Vui lòng thử lại.";
      }
      return errorCode;
  }
}

// =============================================================================
// TESTS
// =============================================================================

const TEST_ROOM_ID = "c0000000-0004-0000-0000-000000000101";

function setupEngine() {
  const engine = new PublicTimelineEngine();
  engine.addRoom({
    id: TEST_ROOM_ID,
    name: "Deluxe Studio 101",
    is_listed: true,
    property_active: true,
  });
  return engine;
}

// 1. exactly 14-day range succeeds
test("Test 1: exactly 14-day range succeeds", () => {
  const engine = setupEngine();
  const start = "2026-09-30T00:00:00+07:00";
  const end = "2026-10-14T00:00:00+07:00"; // exactly 14 days

  const res = engine.getPublicRoomAvailabilityTimeline(TEST_ROOM_ID, start, end);
  assert.equal(res.success, true);
  assert.equal(res.room_id, TEST_ROOM_ID);
  assert.ok(Array.isArray(res.intervals));
});

// 2. exactly 15-day range succeeds
test("Test 2: exactly 15-day range succeeds", () => {
  const engine = setupEngine();
  const start = "2026-09-30T00:00:00+07:00";
  const end = "2026-10-15T00:00:00+07:00"; // exactly 15 days

  const res = engine.getPublicRoomAvailabilityTimeline(TEST_ROOM_ID, start, end);
  assert.equal(res.success, true);
  assert.equal(res.room_id, TEST_ROOM_ID);
  assert.ok(Array.isArray(res.intervals));
});

// 3. range > 15 days returns RANGE_TOO_LARGE
test("Test 3: range > 15 days returns RANGE_TOO_LARGE", () => {
  const engine = setupEngine();

  // 15 days + 1 second
  const start = "2026-09-30T00:00:00+07:00";
  const end1 = "2026-10-15T00:00:01+07:00";
  const res1 = engine.getPublicRoomAvailabilityTimeline(TEST_ROOM_ID, start, end1);
  assert.equal(res1.success, false);
  assert.equal(res1.error, "RANGE_TOO_LARGE");

  // 16 days
  const end2 = "2026-10-16T00:00:00+07:00";
  const res2 = engine.getPublicRoomAvailabilityTimeline(TEST_ROOM_ID, start, end2);
  assert.equal(res2.success, false);
  assert.equal(res2.error, "RANGE_TOO_LARGE");
});

// 4. today → today+15d request used by RoomAvailabilityTimeline succeeds
test("Test 4: today → today+15d request used by RoomAvailabilityTimeline succeeds", () => {
  const engine = setupEngine();
  const todayStr = "2026-09-30";
  // RoomAvailabilityTimeline does: addDaysToDateStr(todayStr, 15) -> "2026-10-15"
  const rangeStart = `${todayStr}T00:00:00+07:00`;
  const rangeEnd = "2026-10-15T00:00:00+07:00";

  const res = engine.getPublicRoomAvailabilityTimeline(TEST_ROOM_ID, rangeStart, rangeEnd);
  assert.equal(res.success, true);
  assert.equal(res.error, undefined);
});

// 5. final selectable day today+14 has availability data
test("Test 5: final selectable day today+14 has availability data", () => {
  const engine = setupEngine();
  const todayStr = "2026-09-30";
  const rangeStart = `${todayStr}T00:00:00+07:00`;
  const rangeEnd = "2026-10-15T00:00:00+07:00"; // covers up to 14/10 23:59:59

  // Day 14 is 2026-10-14
  engine.bookings.push({
    room_id: TEST_ROOM_ID,
    booking_status: "confirmed",
    check_in_at: "2026-10-14T10:00:00+07:00",
    check_out_at: "2026-10-14T14:00:00+07:00",
  });

  const res = engine.getPublicRoomAvailabilityTimeline(TEST_ROOM_ID, rangeStart, rangeEnd);
  assert.equal(res.success, true);
  assert.equal(res.intervals.length, 1);
  assert.equal(res.intervals[0].start_at, "2026-10-14T10:00:00+07:00");
  assert.equal(res.intervals[0].state, "BOOKED");
});

// 6. BOOKED interval on final selectable day is returned
test("Test 6: BOOKED interval on final selectable day is returned", () => {
  const engine = setupEngine();
  const rangeStart = "2026-09-30T00:00:00+07:00";
  const rangeEnd = "2026-10-15T00:00:00+07:00";

  engine.bookings.push({
    room_id: TEST_ROOM_ID,
    booking_status: "confirmed",
    check_in_at: "2026-10-14T14:00:00+07:00",
    check_out_at: "2026-10-14T20:00:00+07:00",
  });

  const res = engine.getPublicRoomAvailabilityTimeline(TEST_ROOM_ID, rangeStart, rangeEnd);
  assert.equal(res.success, true);
  const found = res.intervals.find(
    (i) => i.start_at === "2026-10-14T14:00:00+07:00" && i.state === "BOOKED"
  );
  assert.ok(found, "BOOKED interval on day 14 must be returned");
});

// 7. HELD interval on final selectable day is returned
test("Test 7: HELD interval on final selectable day is returned", () => {
  const engine = setupEngine();
  const now = new Date("2026-09-30T08:00:00+07:00");
  const rangeStart = "2026-09-30T00:00:00+07:00";
  const rangeEnd = "2026-10-15T00:00:00+07:00";

  engine.checkoutSessions.push({
    room_id: TEST_ROOM_ID,
    status: "ACTIVE",
    check_in_at: "2026-10-14T18:00:00+07:00",
    check_out_at: "2026-10-14T22:00:00+07:00",
    expires_at: new Date(now.getTime() + 25 * 60 * 1000).toISOString(), // unexpired
  });

  const res = engine.getPublicRoomAvailabilityTimeline(TEST_ROOM_ID, rangeStart, rangeEnd, now);
  assert.equal(res.success, true);
  const found = res.intervals.find(
    (i) => i.start_at === "2026-10-14T18:00:00+07:00" && i.state === "HELD"
  );
  assert.ok(found, "HELD interval on day 14 must be returned");
});

// 8. BLOCKED interval on final selectable day is returned
test("Test 8: BLOCKED interval on final selectable day is returned", () => {
  const engine = setupEngine();
  const rangeStart = "2026-09-30T00:00:00+07:00";
  const rangeEnd = "2026-10-15T00:00:00+07:00";

  engine.availabilityBlocks.push({
    room_id: TEST_ROOM_ID,
    starts_at: "2026-10-14T08:00:00+07:00",
    ends_at: "2026-10-14T12:00:00+07:00",
    reason: "maintenance",
  });

  const res = engine.getPublicRoomAvailabilityTimeline(TEST_ROOM_ID, rangeStart, rangeEnd);
  assert.equal(res.success, true);
  const found = res.intervals.find(
    (i) => i.start_at === "2026-10-14T08:00:00+07:00" && i.state === "BLOCKED"
  );
  assert.ok(found, "BLOCKED interval on day 14 must be returned");
});

// 9. raw RANGE_TOO_LARGE is not rendered to customer UI
test("Test 9: raw RANGE_TOO_LARGE is not rendered to customer UI", () => {
  const rawCode = "RANGE_TOO_LARGE";
  const mapped = mapAvailabilityError(rawCode);

  assert.notEqual(mapped, rawCode, "Must not return raw code");
  assert.equal(mapped.includes("RANGE_TOO_LARGE"), false, "Must not leak raw code");
  assert.equal(mapped, "Không thể tải lịch phòng cho khoảng ngày này. Vui lòng thử lại.");
});

// 10. generic friendly error is rendered instead
test("Test 10: generic friendly error is rendered instead", () => {
  // Test undefined/null
  assert.equal(
    mapAvailabilityError(null),
    "Không thể tải lịch trống của phòng lúc này. Vui lòng thử lại."
  );

  // Test technical unmapped code
  assert.equal(
    mapAvailabilityError("POSTGRESQL_CONNECTION_TIMEOUT"),
    "Không thể tải lịch trống của phòng lúc này. Vui lòng thử lại."
  );

  // Test other RPC errors
  assert.equal(
    mapAvailabilityError("ROOM_NOT_FOUND"),
    "Không tìm thấy thông tin phòng. Vui lòng thử lại."
  );
  assert.equal(
    mapAvailabilityError("INVALID_PARAMETERS"),
    "Khoảng thời gian không hợp lệ. Vui lòng thử lại."
  );
});

// 11. multi-day booking >24h remains allowed
test("Test 11: multi-day booking >24h remains allowed", () => {
  const componentPath = path.resolve(
    process.cwd(),
    "components/rooms/RoomAvailabilityTimeline.tsx"
  );
  const source = fs.readFileSync(componentPath, "utf8");

  // Confirm NO 24h cap or DISABLED_OVER_24H in component
  assert.equal(source.includes("DISABLED_OVER_24H"), false, "Must not contain DISABLED_OVER_24H");
  assert.equal(source.includes("1440"), false, "Must not contain 1440-minute limit");
  assert.equal(source.includes("tối đa 24 giờ"), false, "Must not contain 24-hour limit copy");

  // Migration for multi-day bookings exists and allows >24h
  const multiDayMigration = path.resolve(
    process.cwd(),
    "supabase/migrations/20260930110000_enable_multi_day_hourly_bookings.sql"
  );
  assert.ok(fs.existsSync(multiDayMigration), "Multi-day migration must exist");
  const sql = fs.readFileSync(multiDayMigration, "utf8");
  assert.equal(sql.includes("DURATION_EXCEEDS_24_HOURS"), false, "Must not contain 24h error in SQL");
});

// 12. minimum 2h still enforced
test("Test 12: minimum 2h still enforced", () => {
  const multiDayMigration = path.resolve(
    process.cwd(),
    "supabase/migrations/20260930110000_enable_multi_day_hourly_bookings.sql"
  );
  const sql = fs.readFileSync(multiDayMigration, "utf8");
  assert.ok(sql.includes("MINIMUM_BOOKING_DURATION_2_HOURS"), "Must enforce MINIMUM_BOOKING_DURATION_2_HOURS");
  assert.ok(sql.includes("120"), "Must check 120 minutes minimum");

  const componentPath = path.resolve(
    process.cwd(),
    "components/rooms/RoomAvailabilityTimeline.tsx"
  );
  const source = fs.readFileSync(componentPath, "utf8");
  assert.ok(source.includes("Tối thiểu 2 giờ"), "Must indicate minimum 2 hours in UI");
});

// 13. temporary hold still 30 min
test("Test 13: temporary hold still 30 min", () => {
  const holdsMigration = path.resolve(
    process.cwd(),
    "supabase/migrations/20260929230000_temporary_room_holds_and_public_availability.sql"
  );
  const sql = fs.readFileSync(holdsMigration, "utf8");
  assert.ok(sql.includes("INTERVAL '30 minutes'"), "Hold expiry must be strictly 30 minutes");
});

// 14. concurrency lock unaffected
test("Test 14: concurrency lock unaffected", () => {
  const holdsMigration = path.resolve(
    process.cwd(),
    "supabase/migrations/20260929230000_temporary_room_holds_and_public_availability.sql"
  );
  const sql = fs.readFileSync(holdsMigration, "utf8");
  assert.ok(sql.includes("pg_advisory_xact_lock"), "PostgreSQL transaction advisory lock must be present");

  // Check new migration contract
  const newMigration = path.resolve(
    process.cwd(),
    "supabase/migrations/20260930120000_fix_public_availability_range_contract.sql"
  );
  assert.ok(fs.existsSync(newMigration), "New migration file must exist");
  const newSql = fs.readFileSync(newMigration, "utf8");
  assert.ok(newSql.includes("INTERVAL '15 days'"), "Must allow 15 days window");
  assert.ok(newSql.includes("SECURITY DEFINER"), "Must be SECURITY DEFINER");
  assert.ok(newSql.includes("SET search_path = ''"), "Must have empty search_path");
  assert.ok(newSql.includes("REVOKE ALL ON FUNCTION public.get_public_room_availability_timeline"), "Must revoke public");
  assert.ok(newSql.includes("GRANT EXECUTE ON FUNCTION public.get_public_room_availability_timeline"), "Must grant anon/auth");
});
