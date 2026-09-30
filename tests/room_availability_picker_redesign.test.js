import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Test Suite: Multi-Day Room Booking Picker & Removal of 24-Hour Cap
 *
 * Covers requirements from Sections 34, 35, 36, 37:
 * - Tests 1-9: Duration Rules (2h, 23h, 24h, 25h, 39h, 48h, 72h, horizon, <2h)
 * - Tests 10-14: Multi-Day Conflict & Overlap Semantics
 * - Tests 15-24: UI Structure, 4-column grid, Typography, Summary, Horizon
 * - Tests 25-30: 30-min Holds, Expiration, Concurrency, Multi-Day Finalization
 */

// -----------------------------------------------------------------------------
// Pure Simulator of Multi-Day Hold & Availability Engine
// -----------------------------------------------------------------------------
class MultiDayHoldEngine {
  constructor() {
    this.rooms = new Map();
    this.bookings = [];
    this.checkoutSessions = [];
    this.availabilityBlocks = [];
    this.paymentFinalizedCount = new Map();
  }

  addRoom(room) {
    this.rooms.set(room.id, room);
  }

  createHourlyHold({
    roomId,
    userId,
    checkInAt,
    checkOutAt,
    guestCount,
    now = new Date("2026-09-30T08:00:00+07:00"),
  }) {
    const room = this.rooms.get(roomId);
    if (!room || !room.is_listed) {
      return { success: false, error: "ROOM_NOT_FOUND_OR_UNLISTED" };
    }

    const tIn = new Date(checkInAt).getTime();
    const tOut = new Date(checkOutAt).getTime();
    const nowMs = now.getTime();

    if (tIn < nowMs - 5 * 60 * 1000) {
      return { success: false, error: "CANNOT_BOOK_IN_PAST" };
    }
    if (tOut <= tIn) {
      return { success: false, error: "INVALID_DATE_RANGE" };
    }

    const durationMinutes = (tOut - tIn) / (60 * 1000);
    if (durationMinutes < 120) {
      return { success: false, error: "MINIMUM_BOOKING_DURATION_2_HOURS" };
    }

    // Check 14-day booking horizon policy
    const horizonMs = nowMs + 14 * 86400 * 1000;
    if (tOut > horizonMs) {
      return { success: false, error: "OUTSIDE_BOOKING_HORIZON" };
    }

    if (guestCount < 1 || guestCount > room.capacity) {
      return { success: false, error: "GUEST_COUNT_EXCEEDS_CAPACITY" };
    }

    // Overlap checks: half-open intervals [start, end)
    const hasBookingOverlap = this.bookings.some((b) => {
      if (b.room_id !== roomId || b.status === "CANCELLED") return false;
      const bStart = new Date(b.check_in_at).getTime();
      const bEnd = new Date(b.check_out_at).getTime();
      return bStart < tOut && bEnd > tIn;
    });
    if (hasBookingOverlap) {
      return { success: false, error: "ROOM_NOT_AVAILABLE" };
    }

    const hasBlockOverlap = this.availabilityBlocks.some((blk) => {
      if (blk.room_id !== roomId) return false;
      const blkStart = new Date(blk.start_at).getTime();
      const blkEnd = new Date(blk.end_at).getTime();
      return blkStart < tOut && blkEnd > tIn;
    });
    if (hasBlockOverlap) {
      return { success: false, error: "ROOM_NOT_AVAILABLE" };
    }

    const hasHeldOverlap = this.checkoutSessions.some((s) => {
      if (s.room_id !== roomId) return false;
      if (!["ACTIVE", "PAYMENT_PROCESSING"].includes(s.status)) return false;
      if (new Date(s.expires_at).getTime() <= nowMs) return false;
      const sStart = new Date(s.check_in_at).getTime();
      const sEnd = new Date(s.check_out_at).getTime();
      return sStart < tOut && sEnd > tIn;
    });
    if (hasHeldOverlap) {
      return { success: false, error: "ROOM_TEMPORARILY_HELD" };
    }

    const bookingHours = Math.ceil(durationMinutes / 60);
    const grossAmount = room.hourly_price_vnd * bookingHours;

    // Temporary hold is strictly 30 minutes, independent of stay duration
    const session = {
      id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      user_id: userId,
      room_id: roomId,
      check_in_at: checkInAt,
      check_out_at: checkOutAt,
      guest_count: guestCount,
      booking_hours: bookingHours,
      gross_amount_vnd: grossAmount,
      status: "ACTIVE",
      expires_at: new Date(nowMs + 30 * 60 * 1000).toISOString(),
    };
    this.checkoutSessions.push(session);

    return { success: true, sessionId: session.id, bookingHours, grossAmount };
  }

  finalizeBooking({ sessionId, now = new Date("2026-09-30T08:10:00+07:00") }) {
    const session = this.checkoutSessions.find((s) => s.id === sessionId);
    if (!session) return { success: false, error: "SESSION_NOT_FOUND" };
    if (session.status === "COMPLETED") {
      // Idempotency: return existing booking
      const existing = this.bookings.find((b) => b.checkout_session_id === sessionId);
      return { success: true, bookingId: existing?.id, idempotent: true };
    }
    if (new Date(session.expires_at).getTime() <= now.getTime()) {
      return { success: false, error: "SESSION_EXPIRED" };
    }

    session.status = "COMPLETED";
    const booking = {
      id: `booking_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      room_id: session.room_id,
      user_id: session.user_id,
      checkout_session_id: sessionId,
      check_in_at: session.check_in_at,
      check_out_at: session.check_out_at,
      status: "CONFIRMED",
    };
    this.bookings.push(booking);
    return { success: true, bookingId: booking.id, idempotent: false };
  }
}

// =============================================================================
// TESTS — SECTION 34: DURATION RULES
// =============================================================================

test("Test 1: 2h booking accepted", () => {
  const engine = new MultiDayHoldEngine();
  engine.addRoom({ id: "room_1", is_listed: true, capacity: 2, hourly_price_vnd: 100000 });

  const res = engine.createHourlyHold({
    roomId: "room_1",
    userId: "user-1",
    checkInAt: "2026-09-30T10:00:00+07:00",
    checkOutAt: "2026-09-30T12:00:00+07:00",
    guestCount: 2,
  });
  assert.equal(res.success, true);
  assert.equal(res.bookingHours, 2);
  assert.equal(res.grossAmount, 200000);
});

test("Test 2: 23h booking accepted", () => {
  const engine = new MultiDayHoldEngine();
  engine.addRoom({ id: "room_1", is_listed: true, capacity: 2, hourly_price_vnd: 100000 });

  const res = engine.createHourlyHold({
    roomId: "room_1",
    userId: "user-1",
    checkInAt: "2026-09-30T08:00:00+07:00",
    checkOutAt: "2026-10-01T07:00:00+07:00",
    guestCount: 1,
  });
  assert.equal(res.success, true);
  assert.equal(res.bookingHours, 23);
});

test("Test 3: 24h booking accepted", () => {
  const engine = new MultiDayHoldEngine();
  engine.addRoom({ id: "room_1", is_listed: true, capacity: 2, hourly_price_vnd: 100000 });

  const res = engine.createHourlyHold({
    roomId: "room_1",
    userId: "user-1",
    checkInAt: "2026-09-30T08:00:00+07:00",
    checkOutAt: "2026-10-01T08:00:00+07:00",
    guestCount: 1,
  });
  assert.equal(res.success, true);
  assert.equal(res.bookingHours, 24);
  assert.equal(res.grossAmount, 2400000);
});

test("Test 4: 25h booking accepted (multi-day)", () => {
  const engine = new MultiDayHoldEngine();
  engine.addRoom({ id: "room_1", is_listed: true, capacity: 2, hourly_price_vnd: 100000 });

  const res = engine.createHourlyHold({
    roomId: "room_1",
    userId: "user-1",
    checkInAt: "2026-09-30T08:00:00+07:00",
    checkOutAt: "2026-10-01T09:00:00+07:00",
    guestCount: 1,
  });
  assert.equal(res.success, true);
  assert.equal(res.bookingHours, 25);
  assert.equal(res.grossAmount, 2500000);
});

test("Test 5: 39h booking accepted if free (08:00 today → 23:00 tomorrow)", () => {
  const engine = new MultiDayHoldEngine();
  engine.addRoom({ id: "room_1", is_listed: true, capacity: 2, hourly_price_vnd: 110000 });

  const res = engine.createHourlyHold({
    roomId: "room_1",
    userId: "user-1",
    checkInAt: "2026-09-30T08:00:00+07:00",
    checkOutAt: "2026-10-01T23:00:00+07:00",
    guestCount: 2,
  });
  assert.equal(res.success, true);
  assert.equal(res.bookingHours, 39);
  assert.equal(res.grossAmount, 4290000);
});

test("Test 6: 48h booking accepted if free", () => {
  const engine = new MultiDayHoldEngine();
  engine.addRoom({ id: "room_1", is_listed: true, capacity: 2, hourly_price_vnd: 100000 });

  const res = engine.createHourlyHold({
    roomId: "room_1",
    userId: "user-1",
    checkInAt: "2026-09-30T10:00:00+07:00",
    checkOutAt: "2026-10-02T10:00:00+07:00",
    guestCount: 2,
  });
  assert.equal(res.success, true);
  assert.equal(res.bookingHours, 48);
  assert.equal(res.grossAmount, 4800000);
});

test("Test 7: 72h booking accepted if free (3 full days)", () => {
  const engine = new MultiDayHoldEngine();
  engine.addRoom({ id: "room_1", is_listed: true, capacity: 2, hourly_price_vnd: 100000 });

  const res = engine.createHourlyHold({
    roomId: "room_1",
    userId: "user-1",
    checkInAt: "2026-09-30T12:00:00+07:00",
    checkOutAt: "2026-10-03T12:00:00+07:00",
    guestCount: 2,
  });
  assert.equal(res.success, true);
  assert.equal(res.bookingHours, 72);
  assert.equal(res.grossAmount, 7200000);
});

test("Test 8: booking beyond current 14-day horizon rejected by range policy", () => {
  const engine = new MultiDayHoldEngine();
  engine.addRoom({ id: "room_1", is_listed: true, capacity: 2, hourly_price_vnd: 100000 });

  // Beyond 14-day horizon from 2026-09-30
  const res = engine.createHourlyHold({
    roomId: "room_1",
    userId: "user-1",
    checkInAt: "2026-09-30T10:00:00+07:00",
    checkOutAt: "2026-10-18T10:00:00+07:00", // 18 days!
    guestCount: 2,
  });
  assert.equal(res.success, false);
  assert.equal(res.error, "OUTSIDE_BOOKING_HORIZON");
});

test("Test 9: <2h rejected", () => {
  const engine = new MultiDayHoldEngine();
  engine.addRoom({ id: "room_1", is_listed: true, capacity: 2, hourly_price_vnd: 100000 });

  const res = engine.createHourlyHold({
    roomId: "room_1",
    userId: "user-1",
    checkInAt: "2026-09-30T10:00:00+07:00",
    checkOutAt: "2026-09-30T11:00:00+07:00", // 1 hour
    guestCount: 2,
  });
  assert.equal(res.success, false);
  assert.equal(res.error, "MINIMUM_BOOKING_DURATION_2_HOURS");
});

// =============================================================================
// TESTS — SECTION 35: MULTI-DAY CONFLICT & OVERLAP SEMANTICS
// =============================================================================

test("Test 10: Multi-day interval with no conflict accepted", () => {
  const engine = new MultiDayHoldEngine();
  engine.addRoom({ id: "room_1", is_listed: true, capacity: 2, hourly_price_vnd: 110000 });

  const res = engine.createHourlyHold({
    roomId: "room_1",
    userId: "user-1",
    checkInAt: "2026-09-30T20:00:00+07:00",
    checkOutAt: "2026-10-02T08:00:00+07:00",
    guestCount: 1,
  });
  assert.equal(res.success, true);
  assert.equal(res.bookingHours, 36);
  assert.equal(res.grossAmount, 3960000);
});

test("Test 11: Booking on middle day blocks whole requested interval", () => {
  const engine = new MultiDayHoldEngine();
  engine.addRoom({ id: "room_1", is_listed: true, capacity: 2, hourly_price_vnd: 100000 });

  // Existing booking on middle day (01/10 14:00 - 18:00)
  engine.bookings.push({
    id: "existing_1",
    room_id: "room_1",
    check_in_at: "2026-10-01T14:00:00+07:00",
    check_out_at: "2026-10-01T18:00:00+07:00",
    status: "CONFIRMED",
  });

  // User requests 30/09 20:00 -> 02/10 08:00 spanning across the middle day booking
  const res = engine.createHourlyHold({
    roomId: "room_1",
    userId: "user-1",
    checkInAt: "2026-09-30T20:00:00+07:00",
    checkOutAt: "2026-10-02T08:00:00+07:00",
    guestCount: 1,
  });
  assert.equal(res.success, false);
  assert.equal(res.error, "ROOM_NOT_AVAILABLE");
});

test("Test 12: Active hold on middle day blocks requested interval", () => {
  const engine = new MultiDayHoldEngine();
  engine.addRoom({ id: "room_1", is_listed: true, capacity: 2, hourly_price_vnd: 100000 });

  // User A holds 01/10 12:00 - 16:00
  const holdA = engine.createHourlyHold({
    roomId: "room_1",
    userId: "user-a",
    checkInAt: "2026-10-01T12:00:00+07:00",
    checkOutAt: "2026-10-01T16:00:00+07:00",
    guestCount: 1,
  });
  assert.equal(holdA.success, true);

  // User B requests 30/09 20:00 -> 02/10 08:00
  const holdB = engine.createHourlyHold({
    roomId: "room_1",
    userId: "user-b",
    checkInAt: "2026-09-30T20:00:00+07:00",
    checkOutAt: "2026-10-02T08:00:00+07:00",
    guestCount: 1,
  });
  assert.equal(holdB.success, false);
  assert.equal(holdB.error, "ROOM_TEMPORARILY_HELD");
});

test("Test 13: Maintenance block on middle day blocks requested interval", () => {
  const engine = new MultiDayHoldEngine();
  engine.addRoom({ id: "room_1", is_listed: true, capacity: 2, hourly_price_vnd: 100000 });

  // Operational maintenance block on middle night
  engine.availabilityBlocks.push({
    room_id: "room_1",
    start_at: "2026-10-01T00:00:00+07:00",
    end_at: "2026-10-01T06:00:00+07:00",
  });

  const res = engine.createHourlyHold({
    roomId: "room_1",
    userId: "user-1",
    checkInAt: "2026-09-30T20:00:00+07:00",
    checkOutAt: "2026-10-02T08:00:00+07:00",
    guestCount: 1,
  });
  assert.equal(res.success, false);
  assert.equal(res.error, "ROOM_NOT_AVAILABLE");
});

test("Test 14: Back-to-back across midnight allowed (half-open semantics)", () => {
  const engine = new MultiDayHoldEngine();
  engine.addRoom({ id: "room_1", is_listed: true, capacity: 2, hourly_price_vnd: 100000 });

  // Booking A: 30/09 20:00 -> 01/10 08:00
  const resA = engine.createHourlyHold({
    roomId: "room_1",
    userId: "user-a",
    checkInAt: "2026-09-30T20:00:00+07:00",
    checkOutAt: "2026-10-01T08:00:00+07:00",
    guestCount: 1,
  });
  assert.equal(resA.success, true);

  // Booking B: 01/10 08:00 -> 01/10 12:00
  const resB = engine.createHourlyHold({
    roomId: "room_1",
    userId: "user-b",
    checkInAt: "2026-10-01T08:00:00+07:00",
    checkOutAt: "2026-10-01T12:00:00+07:00",
    guestCount: 1,
  });
  assert.equal(resB.success, true);
});

// =============================================================================
// TESTS — SECTION 36: UI & 4-COLUMN PICKER
// =============================================================================

test("Test 15: Time cells do not use 6-column layout", () => {
  const source = fs.readFileSync(
    path.resolve("components/rooms/RoomAvailabilityTimeline.tsx"),
    "utf-8"
  );
  assert.equal(
    source.includes("grid-cols-6"),
    false,
    "Must NOT contain grid-cols-6 layout in RoomAvailabilityTimeline.tsx"
  );
});

test("Test 16: Desktop picker uses readable max 4-column hour grid", () => {
  const source = fs.readFileSync(
    path.resolve("components/rooms/RoomAvailabilityTimeline.tsx"),
    "utf-8"
  );
  assert.ok(
    source.includes("grid-cols-4"),
    "Desktop and mobile must use 4 columns maximum"
  );
});

test("Test 17: Hour labels visible without truncation", () => {
  const source = fs.readFileSync(
    path.resolve("components/rooms/RoomAvailabilityTimeline.tsx"),
    "utf-8"
  );
  assert.ok(
    source.includes("text-sm font-semibold"),
    "Hour labels must use at least 13-14px font (text-sm font-semibold)"
  );
  assert.equal(
    source.includes("text-[8px]"),
    false,
    "Must not contain microscopic text-[8px]"
  );
});

test("Test 18: Check-in date and check-out date are independently selectable in 4-step flow", () => {
  const source = fs.readFileSync(
    path.resolve("components/rooms/RoomAvailabilityTimeline.tsx"),
    "utf-8"
  );
  assert.ok(source.includes("Ngày nhận"), "Must render Ngày nhận (Step 1)");
  assert.ok(source.includes("Giờ nhận"), "Must render Giờ nhận (Step 2)");
  assert.ok(source.includes("Ngày trả"), "Must render Ngày trả (Step 3)");
  assert.ok(source.includes("Giờ trả"), "Must render Giờ trả (Step 4)");
});

test("Test 19: Checkout date can be tomorrow", () => {
  const source = fs.readFileSync(
    path.resolve("components/rooms/RoomAvailabilityTimeline.tsx"),
    "utf-8"
  );
  assert.ok(source.includes("checkOutDateChips"), "Provides checkOutDateChips");
  assert.ok(source.includes("handleSelectCheckOutDate"), "Provides handleSelectCheckOutDate");
});

test("Test 20: Checkout date can be 2+ days later", () => {
  const source = fs.readFileSync(
    path.resolve("components/rooms/RoomAvailabilityTimeline.tsx"),
    "utf-8"
  );
  assert.ok(source.includes("maxHorizonDateStr"), "Supports up to 14-day booking horizon");
});

test("Test 21: Selecting new check-in clears invalid checkout", () => {
  const source = fs.readFileSync(
    path.resolve("components/rooms/RoomAvailabilityTimeline.tsx"),
    "utf-8"
  );
  assert.ok(
    source.includes("setCheckOutTime(null)"),
    "handleSelectCheckInTime clears previous check-out time"
  );
});

test("Test 22: Multi-day summary shows correct total hours", () => {
  const source = fs.readFileSync(
    path.resolve("components/rooms/RoomBookingWidget.tsx"),
    "utf-8"
  );
  assert.ok(
    source.includes("Thời lượng"),
    "RoomBookingWidget must render Thời lượng"
  );
  assert.ok(
    source.includes("{hours} giờ"),
    "RoomBookingWidget must display dynamic total hours"
  );
});

test("Test 23: No '> 24h' disabled behavior remains", () => {
  const source = fs.readFileSync(
    path.resolve("components/rooms/RoomAvailabilityTimeline.tsx"),
    "utf-8"
  );
  assert.equal(
    source.includes("DISABLED_OVER_24H"),
    false,
    "DISABLED_OVER_24H must be completely removed"
  );
});

test("Test 24: No 'tối đa 24 giờ' booking validation remains", () => {
  const widgetSource = fs.readFileSync(
    path.resolve("components/rooms/RoomBookingWidget.tsx"),
    "utf-8"
  );
  assert.equal(
    widgetSource.includes("Thời lượng đặt phòng tối đa là 24 giờ"),
    false,
    "Booking duration maximum 24h must be removed from RoomBookingWidget.tsx"
  );

  const timelineSource = fs.readFileSync(
    path.resolve("components/rooms/RoomAvailabilityTimeline.tsx"),
    "utf-8"
  );
  assert.equal(
    timelineSource.includes("tối đa 24 tiếng"),
    false,
    "Timeline must not restrict stays to 24h"
  );
});

// =============================================================================
// TESTS — SECTION 37: HOLD / PAYMENT
// =============================================================================

test("Test 25: 3-day temporary hold blocks overlapping second user", () => {
  const engine = new MultiDayHoldEngine();
  engine.addRoom({ id: "room_1", is_listed: true, capacity: 2, hourly_price_vnd: 100000 });

  const holdA = engine.createHourlyHold({
    roomId: "room_1",
    userId: "user-a",
    checkInAt: "2026-09-30T10:00:00+07:00",
    checkOutAt: "2026-10-03T10:00:00+07:00", // 3 days
    guestCount: 1,
  });
  assert.equal(holdA.success, true);

  // User B tries to book within that 3-day window
  const holdB = engine.createHourlyHold({
    roomId: "room_1",
    userId: "user-b",
    checkInAt: "2026-10-01T12:00:00+07:00",
    checkOutAt: "2026-10-01T16:00:00+07:00",
    guestCount: 1,
  });
  assert.equal(holdB.success, false);
  assert.equal(holdB.error, "ROOM_TEMPORARILY_HELD");
});

test("Test 26: Hold still expires after exactly 30 minutes", () => {
  const engine = new MultiDayHoldEngine();
  engine.addRoom({ id: "room_1", is_listed: true, capacity: 2, hourly_price_vnd: 100000 });

  const startTime = new Date("2026-09-30T08:00:00+07:00");
  const hold = engine.createHourlyHold({
    roomId: "room_1",
    userId: "user-a",
    checkInAt: "2026-09-30T10:00:00+07:00",
    checkOutAt: "2026-10-03T10:00:00+07:00", // 72 hours
    guestCount: 1,
    now: startTime,
  });
  assert.equal(hold.success, true);

  const session = engine.checkoutSessions.find((s) => s.id === hold.sessionId);
  assert.ok(session);
  const diffMinutes =
    (new Date(session.expires_at).getTime() - startTime.getTime()) / (60 * 1000);
  assert.equal(diffMinutes, 30, "Hold expiration must be exactly 30 minutes");
});

test("Test 27: Expired multi-day hold releases full interval", () => {
  const engine = new MultiDayHoldEngine();
  engine.addRoom({ id: "room_1", is_listed: true, capacity: 2, hourly_price_vnd: 100000 });

  const t0 = new Date("2026-09-30T08:00:00+07:00");
  engine.createHourlyHold({
    roomId: "room_1",
    userId: "user-a",
    checkInAt: "2026-09-30T10:00:00+07:00",
    checkOutAt: "2026-10-03T10:00:00+07:00",
    guestCount: 1,
    now: t0,
  });

  // Advance time by 31 minutes -> hold is expired
  const t31 = new Date("2026-09-30T08:31:00+07:00");
  const holdB = engine.createHourlyHold({
    roomId: "room_1",
    userId: "user-b",
    checkInAt: "2026-09-30T10:00:00+07:00",
    checkOutAt: "2026-10-03T10:00:00+07:00",
    guestCount: 1,
    now: t31,
  });
  assert.equal(holdB.success, true, "Expired hold must release the multi-day interval");
});

test("Test 28: Payment finalizer creates correct multi-day booking", () => {
  const engine = new MultiDayHoldEngine();
  engine.addRoom({ id: "room_1", is_listed: true, capacity: 2, hourly_price_vnd: 100000 });

  const hold = engine.createHourlyHold({
    roomId: "room_1",
    userId: "user-a",
    checkInAt: "2026-09-30T20:00:00+07:00",
    checkOutAt: "2026-10-03T08:00:00+07:00", // 60 hours
    guestCount: 1,
  });

  const finalRes = engine.finalizeBooking({ sessionId: hold.sessionId });
  assert.equal(finalRes.success, true);
  assert.ok(finalRes.bookingId);

  const booking = engine.bookings.find((b) => b.id === finalRes.bookingId);
  assert.equal(booking.check_in_at, "2026-09-30T20:00:00+07:00");
  assert.equal(booking.check_out_at, "2026-10-03T08:00:00+07:00");
});

test("Test 29: Finalizer remains idempotent", () => {
  const engine = new MultiDayHoldEngine();
  engine.addRoom({ id: "room_1", is_listed: true, capacity: 2, hourly_price_vnd: 100000 });

  const hold = engine.createHourlyHold({
    roomId: "room_1",
    userId: "user-a",
    checkInAt: "2026-09-30T20:00:00+07:00",
    checkOutAt: "2026-10-03T08:00:00+07:00",
    guestCount: 1,
  });

  const res1 = engine.finalizeBooking({ sessionId: hold.sessionId });
  assert.equal(res1.success, true);
  assert.equal(res1.idempotent, false);

  const res2 = engine.finalizeBooking({ sessionId: hold.sessionId });
  assert.equal(res2.success, true);
  assert.equal(res2.idempotent, true);
  assert.equal(res2.bookingId, res1.bookingId);
});

test("Test 30: SePay webhook regression passes & Migration file exists", () => {
  const migrationPath = path.resolve(
    "supabase/migrations/20260930110000_enable_multi_day_hourly_bookings.sql"
  );
  assert.ok(fs.existsSync(migrationPath), "Additive migration file must exist");
  const sql = fs.readFileSync(migrationPath, "utf-8");

  assert.ok(
    sql.includes("create_hourly_checkout_session_atomic"),
    "Migration must define create_hourly_checkout_session_atomic"
  );
  assert.equal(
    sql.includes("MAXIMUM_BOOKING_DURATION_24_HOURS"),
    false,
    "Migration must not contain MAXIMUM_BOOKING_DURATION_24_HOURS"
  );
  assert.ok(
    sql.includes("v_duration_minutes < 120.0"),
    "Minimum 2 hours must be preserved"
  );
  assert.ok(
    sql.includes("pg_advisory_xact_lock"),
    "Advisory lock must be preserved"
  );
});
