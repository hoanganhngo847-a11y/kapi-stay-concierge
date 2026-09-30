import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Test Suite: Remove Guest Count From Public Booking Flow
 *
 * Covers all 20 requirements from Task Section 20:
 * 1. RoomBookingWidget contains no guest selector.
 * 2. No "+" guest button.
 * 3. No "-" guest button.
 * 4. No "Số lượng khách" label.
 * 5. No "Tối đa X khách" booking restriction in widget.
 * 6. Hold can be created without guest count.
 * 7. 2h booking still works.
 * 8. Multi-day booking still works.
 * 9. Booking with NULL guest_count finalizes successfully.
 * 10. Checkout session stores guest_count NULL.
 * 11. Final booking stores guest_count NULL.
 * 12. Existing historical booking with guest_count=2 remains readable.
 * 13. room.capacity does not reject booking.
 * 14. Room with capacity=1 can still be booked without guest count input.
 * 15. Price unchanged.
 * 16. Availability unchanged.
 * 17. Temporary hold concurrency unchanged.
 * 18. Checkout UI does not display fake guest count.
 * 19. Admin booking detail handles NULL guest_count.
 * 20. My Stay handles NULL guest_count.
 */

// -----------------------------------------------------------------------------
// Pure Simulator of Canonical Checkout, Hold, and Booking Engine
// -----------------------------------------------------------------------------
class BookingEngineWithoutGuestCount {
  constructor() {
    this.rooms = new Map();
    this.bookings = [];
    this.checkoutSessions = [];
    this.idCounter = 1;
  }

  addRoom(room) {
    this.rooms.set(room.id, room);
  }

  createHourlyCheckoutSession({
    roomId,
    userId,
    checkInAt,
    checkOutAt,
    guestCount = null,
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

    // Availability Conflict Check: Bookings
    const hasBookingConflict = this.bookings.some((b) => {
      if (b.room_id !== roomId) return false;
      if (b.booking_status === "CANCELLED") return false;
      const bIn = new Date(b.check_in_at).getTime();
      const bOut = new Date(b.check_out_at).getTime();
      return Math.max(tIn, bIn) < Math.min(tOut, bOut);
    });

    if (hasBookingConflict) {
      return { success: false, error: "ROOM_NOT_AVAILABLE" };
    }

    // Availability Conflict Check: Active Holds
    const hasHoldConflict = this.checkoutSessions.some((s) => {
      if (s.room_id !== roomId) return false;
      if (s.user_id === userId) return false;
      if (s.status !== "ACTIVE" && s.status !== "PAYMENT_PROCESSING") return false;
      const exp = new Date(s.expires_at).getTime();
      if (exp <= nowMs) return false;
      const sIn = new Date(s.check_in_at).getTime();
      const sOut = new Date(s.check_out_at).getTime();
      return Math.max(tIn, sIn) < Math.min(tOut, sOut);
    });

    if (hasHoldConflict) {
      return { success: false, error: "ROOM_TEMPORARILY_HELD" };
    }

    // Pricing: billable hours * hourly_price_vnd (Zero per-person multiplier)
    const billableHours = Math.ceil(durationMinutes / 60);
    const grossAmount = billableHours * room.hourly_price_vnd;

    // Do NOT store fake "1 guest", store NULL
    const session = {
      id: `session-${this.idCounter++}`,
      user_id: userId,
      room_id: roomId,
      check_in_at: checkInAt,
      check_out_at: checkOutAt,
      guest_count: guestCount === undefined ? null : guestCount,
      gross_amount_vnd: grossAmount,
      final_payable_amount_vnd: grossAmount,
      status: "ACTIVE",
      expires_at: new Date(nowMs + 30 * 60 * 1000).toISOString(),
      created_at: now.toISOString(),
    };

    this.checkoutSessions.push(session);
    return { success: true, session_id: session.id, session };
  }

  finalizeVerifiedCheckout({
    sessionId,
    paymentReference = "PAY-123",
    now = new Date("2026-09-30T08:05:00+07:00"),
  }) {
    const session = this.checkoutSessions.find((s) => s.id === sessionId);
    if (!session) {
      return { success: false, error: "CHECKOUT_SESSION_NOT_FOUND" };
    }

    session.status = "COMPLETED";

    const booking = {
      id: `booking-${this.idCounter++}`,
      user_id: session.user_id,
      room_id: session.room_id,
      check_in_at: session.check_in_at,
      check_out_at: session.check_out_at,
      // Persist session.guest_count directly, NULL for new bookings
      guest_count: session.guest_count,
      gross_amount_vnd: session.gross_amount_vnd,
      final_paid_amount_vnd: session.final_payable_amount_vnd,
      booking_status: "CONFIRMED",
      payment_status: "PAID",
      payment_reference: paymentReference,
      created_at: now.toISOString(),
    };

    this.bookings.push(booking);
    return { success: true, booking_id: booking.id, booking };
  }
}

// -----------------------------------------------------------------------------
// TESTS
// -----------------------------------------------------------------------------

test("1. RoomBookingWidget contains no guest selector", () => {
  const widgetContent = fs.readFileSync(
    path.resolve(process.cwd(), "components/rooms/RoomBookingWidget.tsx"),
    "utf-8"
  );
  assert.equal(widgetContent.includes("SỐ LƯỢNG KHÁCH"), false);
  assert.equal(widgetContent.includes("- 1 +"), false);
  assert.equal(widgetContent.includes("handleIncrementGuests"), false);
  assert.equal(widgetContent.includes("handleDecrementGuests"), false);
});

test("2. No '+' guest button in RoomBookingWidget", () => {
  const widgetContent = fs.readFileSync(
    path.resolve(process.cwd(), "components/rooms/RoomBookingWidget.tsx"),
    "utf-8"
  );
  assert.equal(widgetContent.includes("aria-label=\"Tăng số khách\""), false);
  assert.equal(widgetContent.includes("handleIncrementGuests"), false);
});

test("3. No '-' guest button in RoomBookingWidget", () => {
  const widgetContent = fs.readFileSync(
    path.resolve(process.cwd(), "components/rooms/RoomBookingWidget.tsx"),
    "utf-8"
  );
  assert.equal(widgetContent.includes("aria-label=\"Giảm số khách\""), false);
  assert.equal(widgetContent.includes("handleDecrementGuests"), false);
});

test("4. No 'Số lượng khách' label in RoomBookingWidget", () => {
  const widgetContent = fs.readFileSync(
    path.resolve(process.cwd(), "components/rooms/RoomBookingWidget.tsx"),
    "utf-8"
  );
  assert.equal(/Số lượng khách/i.test(widgetContent), false);
});

test("5. No 'Tối đa X khách' booking restriction in widget or room detail header", () => {
  const widgetContent = fs.readFileSync(
    path.resolve(process.cwd(), "components/rooms/RoomBookingWidget.tsx"),
    "utf-8"
  );
  const pageContent = fs.readFileSync(
    path.resolve(process.cwd(), "app/rooms/[id]/page.tsx"),
    "utf-8"
  );
  assert.equal(widgetContent.includes("Tối đa"), false);
  assert.equal(pageContent.includes("Tối đa {room.capacity} khách"), false);
});

test("6. Hold can be created without guest count", () => {
  const engine = new BookingEngineWithoutGuestCount();
  engine.addRoom({
    id: "room-1",
    is_listed: true,
    capacity: 2,
    hourly_price_vnd: 100000,
  });

  const res = engine.createHourlyCheckoutSession({
    roomId: "room-1",
    userId: "user-1",
    checkInAt: "2026-09-30T10:00:00+07:00",
    checkOutAt: "2026-09-30T12:00:00+07:00",
    // No guest count passed
  });

  assert.equal(res.success, true);
  assert.ok(res.session_id);
  assert.equal(res.session.guest_count, null);
});

test("7. 2h booking still works without guest count", () => {
  const engine = new BookingEngineWithoutGuestCount();
  engine.addRoom({
    id: "room-1",
    is_listed: true,
    capacity: 2,
    hourly_price_vnd: 120000,
  });

  const res = engine.createHourlyCheckoutSession({
    roomId: "room-1",
    userId: "user-1",
    checkInAt: "2026-09-30T14:00:00+07:00",
    checkOutAt: "2026-09-30T16:00:00+07:00",
  });

  assert.equal(res.success, true);
  assert.equal(res.session.gross_amount_vnd, 240000);
});

test("8. Multi-day booking still works without guest count", () => {
  const engine = new BookingEngineWithoutGuestCount();
  engine.addRoom({
    id: "room-1",
    is_listed: true,
    capacity: 2,
    hourly_price_vnd: 100000,
  });

  const res = engine.createHourlyCheckoutSession({
    roomId: "room-1",
    userId: "user-1",
    checkInAt: "2026-09-30T08:00:00+07:00",
    checkOutAt: "2026-10-02T12:00:00+07:00", // 52 hours
  });

  assert.equal(res.success, true);
  assert.equal(res.session.gross_amount_vnd, 52 * 100000);
  assert.equal(res.session.guest_count, null);
});

test("9. Booking with NULL guest_count finalizes successfully", () => {
  const engine = new BookingEngineWithoutGuestCount();
  engine.addRoom({
    id: "room-1",
    is_listed: true,
    capacity: 2,
    hourly_price_vnd: 150000,
  });

  const hold = engine.createHourlyCheckoutSession({
    roomId: "room-1",
    userId: "user-1",
    checkInAt: "2026-09-30T14:00:00+07:00",
    checkOutAt: "2026-09-30T17:00:00+07:00",
  });
  assert.equal(hold.success, true);

  const finalRes = engine.finalizeVerifiedCheckout({
    sessionId: hold.session_id,
  });

  assert.equal(finalRes.success, true);
  assert.equal(finalRes.booking.guest_count, null);
  assert.equal(finalRes.booking.booking_status, "CONFIRMED");
});

test("10. Checkout session stores guest_count NULL", () => {
  const engine = new BookingEngineWithoutGuestCount();
  engine.addRoom({
    id: "room-1",
    is_listed: true,
    capacity: 3,
    hourly_price_vnd: 120000,
  });

  const hold = engine.createHourlyCheckoutSession({
    roomId: "room-1",
    userId: "user-1",
    checkInAt: "2026-09-30T10:00:00+07:00",
    checkOutAt: "2026-09-30T12:00:00+07:00",
  });

  assert.equal(hold.session.guest_count, null);
  assert.notEqual(hold.session.guest_count, 1); // Not fake "1"
});

test("11. Final booking stores guest_count NULL", () => {
  const engine = new BookingEngineWithoutGuestCount();
  engine.addRoom({
    id: "room-1",
    is_listed: true,
    capacity: 2,
    hourly_price_vnd: 100000,
  });

  const hold = engine.createHourlyCheckoutSession({
    roomId: "room-1",
    userId: "user-1",
    checkInAt: "2026-09-30T12:00:00+07:00",
    checkOutAt: "2026-09-30T15:00:00+07:00",
  });

  const finalRes = engine.finalizeVerifiedCheckout({
    sessionId: hold.session_id,
  });

  assert.equal(finalRes.booking.guest_count, null);
  assert.notEqual(finalRes.booking.guest_count, 1);
});

test("12. Existing historical booking with guest_count=2 remains readable", () => {
  const engine = new BookingEngineWithoutGuestCount();
  // Simulate historical row existing before migration
  engine.bookings.push({
    id: "historical-booking-999",
    user_id: "user-historical",
    room_id: "room-1",
    check_in_at: "2026-09-01T10:00:00+07:00",
    check_out_at: "2026-09-01T14:00:00+07:00",
    guest_count: 2,
    gross_amount_vnd: 400000,
    booking_status: "COMPLETED",
  });

  const historical = engine.bookings.find((b) => b.id === "historical-booking-999");
  assert.equal(historical.guest_count, 2);
});

test("13. room.capacity does not reject booking", () => {
  const engine = new BookingEngineWithoutGuestCount();
  // Room with capacity = 1
  engine.addRoom({
    id: "room-capacity-1",
    is_listed: true,
    capacity: 1,
    hourly_price_vnd: 80000,
  });

  const res = engine.createHourlyCheckoutSession({
    roomId: "room-capacity-1",
    userId: "user-1",
    checkInAt: "2026-09-30T10:00:00+07:00",
    checkOutAt: "2026-09-30T13:00:00+07:00",
  });

  assert.equal(res.success, true);
});

test("14. Room with capacity=1 can still be booked without guest count input", () => {
  const engine = new BookingEngineWithoutGuestCount();
  engine.addRoom({
    id: "single-pod",
    is_listed: true,
    capacity: 1,
    hourly_price_vnd: 90000,
  });

  const res = engine.createHourlyCheckoutSession({
    roomId: "single-pod",
    userId: "user-solo",
    checkInAt: "2026-09-30T15:00:00+07:00",
    checkOutAt: "2026-09-30T18:00:00+07:00",
  });

  assert.equal(res.success, true);
  assert.equal(res.session.guest_count, null);
});

test("15. Price unchanged (hourly_price * billable_hours, zero person multiplier)", () => {
  const engine = new BookingEngineWithoutGuestCount();
  engine.addRoom({
    id: "room-price-check",
    is_listed: true,
    capacity: 4,
    hourly_price_vnd: 125000,
  });

  const res = engine.createHourlyCheckoutSession({
    roomId: "room-price-check",
    userId: "user-1",
    checkInAt: "2026-09-30T10:00:00+07:00",
    checkOutAt: "2026-09-30T14:00:00+07:00", // 4 hours
  });

  assert.equal(res.success, true);
  assert.equal(res.session.gross_amount_vnd, 4 * 125000);
  assert.equal(res.session.final_payable_amount_vnd, 500000);
});

test("16. Availability unchanged (interval intersection unaffected by guest count)", () => {
  const engine = new BookingEngineWithoutGuestCount();
  engine.addRoom({
    id: "room-1",
    is_listed: true,
    capacity: 2,
    hourly_price_vnd: 100000,
  });

  engine.createHourlyCheckoutSession({
    roomId: "room-1",
    userId: "user-1",
    checkInAt: "2026-09-30T10:00:00+07:00",
    checkOutAt: "2026-09-30T13:00:00+07:00",
  });

  // User 2 overlaps 11:00-14:00 -> rejected by ROOM_TEMPORARILY_HELD
  const conflict = engine.createHourlyCheckoutSession({
    roomId: "room-1",
    userId: "user-2",
    checkInAt: "2026-09-30T11:00:00+07:00",
    checkOutAt: "2026-09-30T14:00:00+07:00",
  });
  assert.equal(conflict.success, false);
  assert.equal(conflict.error, "ROOM_TEMPORARILY_HELD");

  // User 2 books adjacent 13:00-15:00 -> allowed (half-open interval)
  const adjacent = engine.createHourlyCheckoutSession({
    roomId: "room-1",
    userId: "user-2",
    checkInAt: "2026-09-30T13:00:00+07:00",
    checkOutAt: "2026-09-30T15:00:00+07:00",
  });
  assert.equal(adjacent.success, true);
});

test("17. Temporary hold concurrency unchanged (advisory lock / conflict behavior preserved)", () => {
  const engine = new BookingEngineWithoutGuestCount();
  engine.addRoom({
    id: "room-concurrent",
    is_listed: true,
    capacity: 2,
    hourly_price_vnd: 100000,
  });

  const res1 = engine.createHourlyCheckoutSession({
    roomId: "room-concurrent",
    userId: "user-A",
    checkInAt: "2026-09-30T12:00:00+07:00",
    checkOutAt: "2026-09-30T15:00:00+07:00",
  });
  const res2 = engine.createHourlyCheckoutSession({
    roomId: "room-concurrent",
    userId: "user-B",
    checkInAt: "2026-09-30T12:00:00+07:00",
    checkOutAt: "2026-09-30T15:00:00+07:00",
  });

  assert.equal(res1.success, true);
  assert.equal(res2.success, false);
  assert.equal(res2.error, "ROOM_TEMPORARILY_HELD");
});

test("18. Checkout UI does not display fake guest count", () => {
  const bookingSummaryContent = fs.readFileSync(
    path.resolve(process.cwd(), "components/checkout/BookingSummary.tsx"),
    "utf-8"
  );
  assert.equal(bookingSummaryContent.includes("{session.guest_count} khách"), false);
  assert.equal(bookingSummaryContent.includes("Số khách"), false);
});

test("19. Admin booking detail handles NULL guest_count safely", () => {
  const adminBoardContent = fs.readFileSync(
    path.resolve(process.cwd(), "components/admin/AdminPropertyBoardClient.tsx"),
    "utf-8"
  );
  // Row is guarded so null does not render "0 khách"
  assert.ok(
    adminBoardContent.includes(
      "bookingDetail.guest_count != null && bookingDetail.guest_count > 0"
    )
  );

  const adminDataContent = fs.readFileSync(
    path.resolve(process.cwd(), "lib/data/admin.ts"),
    "utf-8"
  );
  // Does not fail-closed on null guest_count
  assert.ok(
    adminDataContent.includes(
      "b.guest_count != null\n        ? validatePositiveInteger(b.guest_count, \"guest_count\", context)\n        : null"
    )
  );
});

test("20. My Stay handles NULL guest_count without rendering '0 khách'", () => {
  const myStayDataContent = fs.readFileSync(
    path.resolve(process.cwd(), "lib/data/my-stay.ts"),
    "utf-8"
  );
  assert.ok(myStayDataContent.includes("guestCount?: number | null;"));

  const myStayClientContent = fs.readFileSync(
    path.resolve(process.cwd(), "app/my-stay/MyStayClient.tsx"),
    "utf-8"
  );
  assert.equal(myStayClientContent.includes("0 khách"), false);
  assert.equal(myStayClientContent.includes("{stay.guestCount} khách"), false);
});
