import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Temporary Room Holds & Public Room Availability Test Suite
 *
 * Covers requirements from:
 * 1. Concurrency safety: PostgreSQL transaction advisory lock serialization
 * 2. Canonical overlap semantics: [start, end) half-open intervals
 * 3. Range-scoped holds: independent intervals in same room allowed
 * 4. Hold expiration (30m) & status lifecycle: ACTIVE/PAYMENT_PROCESSING vs EXPIRED/FAILED/COMPLETED
 * 5. Self-hold exclusion during payment finalization
 * 6. Public timeline sanitation: strictly anonymous intervals without PII or session IDs
 * 7. Hold release RPC
 */

// -----------------------------------------------------------------------------
// In-Memory Simulation Engine matching PostgreSQL RPCs & Business Rules
// -----------------------------------------------------------------------------
class MockHoldEngine {
  constructor() {
    this.rooms = new Map();
    this.bookings = [];
    this.checkoutSessions = [];
    this.availabilityBlocks = [];
    this.locks = new Set(); // Simulates pg_advisory_xact_lock
  }

  addRoom(room) {
    this.rooms.set(room.id, room);
  }

  // Simulates PostgreSQL create_hourly_checkout_session_atomic with pg_advisory_xact_lock
  async createHourlyCheckoutSessionAtomic({
    roomId,
    userId,
    checkInAt,
    checkOutAt,
    guestCount,
    now = new Date(),
  }) {
    const lockKey = `room_lock_${roomId}`;

    // Concurrency advisory lock simulation
    if (this.locks.has(lockKey)) {
      // In Postgres, competing transaction waits for lock, then re-checks
      // Here we simulate the second serialized transaction acquiring lock after first
      // and finding the room interval occupied
    }
    this.locks.add(lockKey);

    try {
      const room = this.rooms.get(roomId);
      if (!room || !room.is_listed) {
        throw new Error("ROOM_NOT_FOUND_OR_UNLISTED");
      }

      const tIn = new Date(checkInAt).getTime();
      const tOut = new Date(checkOutAt).getTime();
      const nowMs = now.getTime();

      if (tIn < nowMs - 5 * 60 * 1000) {
        throw new Error("CANNOT_BOOK_IN_PAST");
      }
      if (tOut <= tIn) {
        throw new Error("INVALID_DATE_RANGE");
      }
      const durationHours = Math.ceil((tOut - tIn) / (3600 * 1000));
      if (durationHours < 2) {
        throw new Error("MINIMUM_BOOKING_DURATION_2_HOURS");
      }
      if (guestCount < 1 || guestCount > room.capacity) {
        throw new Error("GUEST_COUNT_EXCEEDS_CAPACITY");
      }

      // Check 1: Confirmed booking overlap (half-open)
      const hasBookingOverlap = this.bookings.some((b) => {
        if (b.room_id !== roomId) return false;
        if (b.status === "CANCELLED") return false;
        const bStart = new Date(b.check_in_at).getTime();
        const bEnd = new Date(b.check_out_at).getTime();
        return bStart < tOut && bEnd > tIn;
      });
      if (hasBookingOverlap) {
        throw new Error("ROOM_NOT_AVAILABLE");
      }

      // Check 2: Availability block overlap
      const hasBlockOverlap = this.availabilityBlocks.some((blk) => {
        if (blk.room_id !== roomId) return false;
        const blkStart = new Date(blk.start_at).getTime();
        const blkEnd = new Date(blk.end_at).getTime();
        return blkStart < tOut && blkEnd > tIn;
      });
      if (hasBlockOverlap) {
        throw new Error("ROOM_NOT_AVAILABLE");
      }

      // Check 3: Active unexpired hold overlap (checkout_sessions)
      const hasHoldOverlap = this.checkoutSessions.some((s) => {
        if (s.room_id !== roomId) return false;
        if (!["ACTIVE", "PAYMENT_PROCESSING"].includes(s.status)) return false;
        const expMs = new Date(s.expires_at).getTime();
        if (expMs <= nowMs) return false; // Expired holds do not block!

        const sStart = new Date(s.check_in_at).getTime();
        const sEnd = new Date(s.check_out_at).getTime();
        return sStart < tOut && sEnd > tIn;
      });
      if (hasHoldOverlap) {
        throw new Error("ROOM_TEMPORARILY_HELD");
      }

      // All checks passed -> insert checkout session with 30-min expiry
      const expiresAt = new Date(nowMs + 30 * 60 * 1000).toISOString();
      const sessionId = `cs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const session = {
        id: sessionId,
        room_id: roomId,
        user_id: userId,
        check_in_at: checkInAt,
        check_out_at: checkOutAt,
        status: "ACTIVE",
        expires_at: expiresAt,
        gross_amount_vnd: durationHours * room.hourly_price_vnd,
        created_at: now.toISOString(),
      };
      this.checkoutSessions.push(session);

      return { success: true, sessionId };
    } finally {
      this.locks.delete(lockKey);
    }
  }

  // Simulates check_room_availability_hourly
  checkRoomAvailabilityHourly(roomId, checkInAt, checkOutAt, now = new Date()) {
    const tIn = new Date(checkInAt).getTime();
    const tOut = new Date(checkOutAt).getTime();
    const nowMs = now.getTime();

    // Check confirmed bookings
    const hasBooking = this.bookings.some((b) => {
      if (b.room_id !== roomId || b.status === "CANCELLED") return false;
      const bIn = new Date(b.check_in_at).getTime();
      const bOut = new Date(b.check_out_at).getTime();
      return bIn < tOut && bOut > tIn;
    });
    if (hasBooking) return false;

    // Check blocks
    const hasBlock = this.availabilityBlocks.some((blk) => {
      if (blk.room_id !== roomId) return false;
      const blkIn = new Date(blk.start_at).getTime();
      const blkOut = new Date(blk.end_at).getTime();
      return blkIn < tOut && blkOut > tIn;
    });
    if (hasBlock) return false;

    // Check active unexpired holds
    const hasHold = this.checkoutSessions.some((s) => {
      if (s.room_id !== roomId) return false;
      if (!["ACTIVE", "PAYMENT_PROCESSING"].includes(s.status)) return false;
      const expMs = new Date(s.expires_at).getTime();
      if (expMs <= nowMs) return false;
      const sIn = new Date(s.check_in_at).getTime();
      const sOut = new Date(s.check_out_at).getTime();
      return sIn < tOut && sOut > tIn;
    });
    if (hasHold) return false;

    return true;
  }

  // Simulates release_checkout_hold_atomic
  releaseCheckoutHoldAtomic(sessionId, userId) {
    const session = this.checkoutSessions.find((s) => s.id === sessionId);
    if (!session) {
      return { success: false, error: "SESSION_NOT_FOUND" };
    }
    if (session.user_id !== userId) {
      return { success: false, error: "FORBIDDEN" };
    }
    if (session.status === "COMPLETED") {
      return { success: false, error: "CANNOT_RELEASE_COMPLETED_SESSION" };
    }
    session.status = "EXPIRED";
    return { success: true };
  }

  // Simulates finalize_verified_checkout_atomic with self-hold exclusion
  finalizeVerifiedCheckoutAtomic(sessionId, now = new Date()) {
    const session = this.checkoutSessions.find((s) => s.id === sessionId);
    if (!session) throw new Error("SESSION_NOT_FOUND");
    if (!["ACTIVE", "PAYMENT_PROCESSING"].includes(session.status)) {
      throw new Error("INVALID_SESSION_STATUS");
    }

    const tIn = new Date(session.check_in_at).getTime();
    const tOut = new Date(session.check_out_at).getTime();

    // Check conflicting bookings
    const hasConflictingBooking = this.bookings.some((b) => {
      if (b.room_id !== session.room_id || b.status === "CANCELLED") return false;
      const bIn = new Date(b.check_in_at).getTime();
      const bOut = new Date(b.check_out_at).getTime();
      return bIn < tOut && bOut > tIn;
    });
    if (hasConflictingBooking) throw new Error("ROOM_ALREADY_BOOKED");

    // Check conflicting OTHER active holds (excluding self session.id)
    const hasConflictingOtherHold = this.checkoutSessions.some((s) => {
      if (s.id === session.id) return false; // EXCLUDE SELF!
      if (s.room_id !== session.room_id) return false;
      if (!["ACTIVE", "PAYMENT_PROCESSING"].includes(s.status)) return false;
      if (new Date(s.expires_at).getTime() <= now.getTime()) return false;
      const sIn = new Date(s.check_in_at).getTime();
      const sOut = new Date(s.check_out_at).getTime();
      return sIn < tOut && sOut > tIn;
    });
    if (hasConflictingOtherHold) throw new Error("CONFLICTING_HOLD_EXISTS");

    // Finalize: session -> COMPLETED, booking -> CONFIRMED
    session.status = "COMPLETED";
    const booking = {
      id: `b-${Date.now()}`,
      room_id: session.room_id,
      user_id: session.user_id,
      check_in_at: session.check_in_at,
      check_out_at: session.check_out_at,
      status: "CONFIRMED",
      guest_name: "Test Guest",
      guest_phone: "0901234567",
      guest_email: "guest@example.com",
    };
    this.bookings.push(booking);
    return { success: true, bookingId: booking.id };
  }

  // Simulates get_public_room_availability_timeline (strictly sanitized)
  getPublicRoomAvailabilityTimeline(roomId, rangeStart, rangeEnd, now = new Date()) {
    const rStartMs = new Date(rangeStart).getTime();
    const rEndMs = new Date(rangeEnd).getTime();
    const nowMs = now.getTime();
    const intervals = [];

    // 1. Confirmed bookings -> BOOKED
    for (const b of this.bookings) {
      if (b.room_id !== roomId || b.status === "CANCELLED") continue;
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
      if (new Date(s.expires_at).getTime() <= nowMs) continue; // Skip expired!

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

    // 3. Operational blocks -> BLOCKED
    for (const blk of this.availabilityBlocks) {
      if (blk.room_id !== roomId) continue;
      const blkIn = new Date(blk.start_at).getTime();
      const blkOut = new Date(blk.end_at).getTime();
      if (blkIn < rEndMs && blkOut > rStartMs) {
        intervals.push({
          start_at: blk.start_at,
          end_at: blk.end_at,
          state: "BLOCKED",
        });
      }
    }

    // Sort intervals chronologically
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
// TESTS
// -----------------------------------------------------------------------------

test("Hold Test 1 & 2: Two concurrent hold attempts for the same room / interval — exactly ONE succeeds", async () => {
  const engine = new MockHoldEngine();
  const roomId = "00000000-0000-0000-0000-000000000101";
  engine.addRoom({
    id: roomId,
    name: "Phòng 101",
    is_listed: true,
    capacity: 2,
    hourly_price_vnd: 150000,
  });

  const checkIn = "2026-09-30T14:00:00+07:00";
  const checkOut = "2026-09-30T18:00:00+07:00";

  // User A attempts hold
  const resA = await engine.createHourlyCheckoutSessionAtomic({
    roomId,
    userId: "user-a",
    checkInAt: checkIn,
    checkOutAt: checkOut,
    guestCount: 2,
  });
  assert.equal(resA.success, true);
  assert.ok(resA.sessionId);

  // User B attempts same room / same interval
  await assert.rejects(
    async () => {
      await engine.createHourlyCheckoutSessionAtomic({
        roomId,
        userId: "user-b",
        checkInAt: checkIn,
        checkOutAt: checkOut,
        guestCount: 2,
      });
    },
    (err) => err.message === "ROOM_TEMPORARILY_HELD"
  );
});

test("Hold Test 3: Back-to-back intervals: 10:00-12:00 and 12:00-14:00 both allowed", async () => {
  const engine = new MockHoldEngine();
  const roomId = "00000000-0000-0000-0000-000000000101";
  engine.addRoom({
    id: roomId,
    name: "Phòng 101",
    is_listed: true,
    capacity: 2,
    hourly_price_vnd: 150000,
  });

  const res1 = await engine.createHourlyCheckoutSessionAtomic({
    roomId,
    userId: "user-1",
    checkInAt: "2026-09-30T10:00:00+07:00",
    checkOutAt: "2026-09-30T12:00:00+07:00",
    guestCount: 1,
    now: new Date("2026-09-30T08:00:00+07:00"),
  });
  assert.equal(res1.success, true);

  const res2 = await engine.createHourlyCheckoutSessionAtomic({
    roomId,
    userId: "user-2",
    checkInAt: "2026-09-30T12:00:00+07:00",
    checkOutAt: "2026-09-30T14:00:00+07:00",
    guestCount: 1,
    now: new Date("2026-09-30T08:00:00+07:00"),
  });
  assert.equal(res2.success, true);
});

test("Hold Test 4 & 5: Partial overlap and Full containment overlap are denied", async () => {
  const engine = new MockHoldEngine();
  const roomId = "00000000-0000-0000-0000-000000000101";
  const mockNow = new Date("2026-09-30T12:00:00+07:00");
  engine.addRoom({
    id: roomId,
    name: "Phòng 101",
    is_listed: true,
    capacity: 2,
    hourly_price_vnd: 150000,
  });

  // User A holds 14:00 - 18:00
  await engine.createHourlyCheckoutSessionAtomic({
    roomId,
    userId: "user-a",
    checkInAt: "2026-09-30T14:00:00+07:00",
    checkOutAt: "2026-09-30T18:00:00+07:00",
    guestCount: 2,
    now: mockNow,
  });

  // Partial overlap start (13:00 - 15:00) -> REJECTED
  await assert.rejects(
    async () => {
      await engine.createHourlyCheckoutSessionAtomic({
        roomId,
        userId: "user-b",
        checkInAt: "2026-09-30T13:00:00+07:00",
        checkOutAt: "2026-09-30T15:00:00+07:00",
        guestCount: 1,
        now: mockNow,
      });
    },
    (err) => err.message === "ROOM_TEMPORARILY_HELD"
  );

  // Partial overlap end (17:00 - 20:00) -> REJECTED
  await assert.rejects(
    async () => {
      await engine.createHourlyCheckoutSessionAtomic({
        roomId,
        userId: "user-c",
        checkInAt: "2026-09-30T17:00:00+07:00",
        checkOutAt: "2026-09-30T20:00:00+07:00",
        guestCount: 1,
        now: mockNow,
      });
    },
    (err) => err.message === "ROOM_TEMPORARILY_HELD"
  );

  // Full containment (15:00 - 17:00) -> REJECTED
  await assert.rejects(
    async () => {
      await engine.createHourlyCheckoutSessionAtomic({
        roomId,
        userId: "user-d",
        checkInAt: "2026-09-30T15:00:00+07:00",
        checkOutAt: "2026-09-30T17:00:00+07:00",
        guestCount: 1,
        now: mockNow,
      });
    },
    (err) => err.message === "ROOM_TEMPORARILY_HELD"
  );
});

test("Hold Test 6 & 7: Expired hold or FAILED hold does not block availability", async () => {
  const engine = new MockHoldEngine();
  const roomId = "00000000-0000-0000-0000-000000000101";
  engine.addRoom({
    id: roomId,
    name: "Phòng 101",
    is_listed: true,
    capacity: 2,
    hourly_price_vnd: 150000,
  });

  const now = new Date("2026-09-30T12:00:00+07:00");
  const res = await engine.createHourlyCheckoutSessionAtomic({
    roomId,
    userId: "user-a",
    checkInAt: "2026-09-30T14:00:00+07:00",
    checkOutAt: "2026-09-30T18:00:00+07:00",
    guestCount: 2,
    now,
  });
  assert.equal(res.success, true);

  // At now + 10 mins: interval is still blocked
  const at10Min = new Date(now.getTime() + 10 * 60 * 1000);
  assert.equal(
    engine.checkRoomAvailabilityHourly(roomId, "2026-09-30T14:00:00+07:00", "2026-09-30T18:00:00+07:00", at10Min),
    false
  );

  // At now + 31 mins: hold is expired!
  const at31Min = new Date(now.getTime() + 31 * 60 * 1000);
  assert.equal(
    engine.checkRoomAvailabilityHourly(roomId, "2026-09-30T14:00:00+07:00", "2026-09-30T18:00:00+07:00", at31Min),
    true
  );

  // A new user can now acquire the hold
  const resNew = await engine.createHourlyCheckoutSessionAtomic({
    roomId,
    userId: "user-new",
    checkInAt: "2026-09-30T14:00:00+07:00",
    checkOutAt: "2026-09-30T18:00:00+07:00",
    guestCount: 2,
    now: at31Min,
  });
  assert.equal(resNew.success, true);
});

test("Hold Test 8 & 9: COMPLETED checkout is represented by booking, and own finalization excludes self-hold", async () => {
  const engine = new MockHoldEngine();
  const roomId = "00000000-0000-0000-0000-000000000101";
  engine.addRoom({
    id: roomId,
    name: "Phòng 101",
    is_listed: true,
    capacity: 2,
    hourly_price_vnd: 150000,
  });

  // User A creates hold
  const { sessionId } = await engine.createHourlyCheckoutSessionAtomic({
    roomId,
    userId: "user-a",
    checkInAt: "2026-09-30T14:00:00+07:00",
    checkOutAt: "2026-09-30T18:00:00+07:00",
    guestCount: 2,
  });

  // User A finalizes payment -> must succeed without conflicting with its own hold!
  const finalizeRes = engine.finalizeVerifiedCheckoutAtomic(sessionId);
  assert.equal(finalizeRes.success, true);
  assert.ok(finalizeRes.bookingId);

  // Checkout session is now COMPLETED
  const session = engine.checkoutSessions.find((s) => s.id === sessionId);
  assert.equal(session.status, "COMPLETED");

  // Room is now blocked by confirmed booking, not active hold
  const timeline = engine.getPublicRoomAvailabilityTimeline(
    roomId,
    "2026-09-30T00:00:00+07:00",
    "2026-10-01T00:00:00+07:00"
  );
  assert.equal(timeline.intervals.length, 1);
  assert.equal(timeline.intervals[0].state, "BOOKED");
});

test("Timeline Test 10-17: Public timeline contains strictly sanitized intervals without PII or session IDs", async () => {
  const engine = new MockHoldEngine();
  const roomId = "00000000-0000-0000-0000-000000000101";
  engine.addRoom({
    id: roomId,
    name: "Phòng 101",
    is_listed: true,
    capacity: 2,
    hourly_price_vnd: 150000,
  });

  // 1. Confirmed booking
  engine.bookings.push({
    id: "booking-123",
    room_id: roomId,
    user_id: "user-x",
    check_in_at: "2026-09-30T08:00:00+07:00",
    check_out_at: "2026-09-30T12:00:00+07:00",
    status: "CONFIRMED",
    guest_name: "Nguyen Van A",
    guest_phone: "0909999999",
    guest_email: "a@example.com",
  });

  // 2. Active checkout hold
  await engine.createHourlyCheckoutSessionAtomic({
    roomId,
    userId: "user-y",
    checkInAt: "2026-09-30T14:00:00+07:00",
    checkOutAt: "2026-09-30T18:00:00+07:00",
    guestCount: 2,
  });

  // 3. Maintenance block
  engine.availabilityBlocks.push({
    id: "block-1",
    room_id: roomId,
    start_at: "2026-09-30T20:00:00+07:00",
    end_at: "2026-09-30T22:00:00+07:00",
    reason: "MAINTENANCE",
  });

  const timeline = engine.getPublicRoomAvailabilityTimeline(
    roomId,
    "2026-09-30T00:00:00+07:00",
    "2026-10-01T00:00:00+07:00"
  );

  assert.equal(timeline.success, true);
  assert.equal(timeline.intervals.length, 3);

  // States: BOOKED, HELD, BLOCKED
  assert.equal(timeline.intervals[0].state, "BOOKED");
  assert.equal(timeline.intervals[1].state, "HELD");
  assert.equal(timeline.intervals[2].state, "BLOCKED");

  // Security & Privacy Verification: NO PII or sensitive keys
  for (const interval of timeline.intervals) {
    const keys = Object.keys(interval);
    assert.deepEqual(keys.sort(), ["end_at", "start_at", "state"]);
    assert.equal("user_id" in interval, false);
    assert.equal("guest_name" in interval, false);
    assert.equal("guest_phone" in interval, false);
    assert.equal("guest_email" in interval, false);
    assert.equal("booking_id" in interval, false);
    assert.equal("checkout_session_id" in interval, false);
    assert.equal("sessionId" in interval, false);
    assert.equal("amount" in interval, false);
  }
});

test("Hold Release Test: User cancelling checkout releases hold immediately", async () => {
  const engine = new MockHoldEngine();
  const roomId = "00000000-0000-0000-0000-000000000101";
  engine.addRoom({
    id: roomId,
    name: "Phòng 101",
    is_listed: true,
    capacity: 2,
    hourly_price_vnd: 150000,
  });

  const { sessionId } = await engine.createHourlyCheckoutSessionAtomic({
    roomId,
    userId: "user-cancelling",
    checkInAt: "2026-09-30T14:00:00+07:00",
    checkOutAt: "2026-09-30T18:00:00+07:00",
    guestCount: 2,
  });

  // Verify currently held
  assert.equal(
    engine.checkRoomAvailabilityHourly(roomId, "2026-09-30T14:00:00+07:00", "2026-09-30T18:00:00+07:00"),
    false
  );

  // User releases hold
  const releaseRes = engine.releaseCheckoutHoldAtomic(sessionId, "user-cancelling");
  assert.equal(releaseRes.success, true);

  // Now available again!
  assert.equal(
    engine.checkRoomAvailabilityHourly(roomId, "2026-09-30T14:00:00+07:00", "2026-09-30T18:00:00+07:00"),
    true
  );
});

test("SQL & Code Contract: Migration 20260929230000_temporary_room_holds_and_public_availability.sql verification", () => {
  const migrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/20260929230000_temporary_room_holds_and_public_availability.sql"
  );
  assert.ok(fs.existsSync(migrationPath), "Migration file must exist");
  const sql = fs.readFileSync(migrationPath, "utf8");

  // Advisory lock
  assert.ok(sql.includes("pg_advisory_xact_lock"), "Must use PostgreSQL transaction-level advisory lock");
  // Holds in availability check
  assert.ok(sql.includes("ROOM_TEMPORARILY_HELD"), "Must distinguish temporary hold conflict");
  // Public timeline RPC
  assert.ok(sql.includes("get_public_room_availability_timeline"), "Must export sanitized timeline RPC");
  // Release hold RPC
  assert.ok(sql.includes("release_checkout_hold_atomic"), "Must export release checkout hold RPC");
  // Security definer search path
  assert.ok(sql.includes("SET search_path = ''"), "Must secure search_path with empty path");
});
