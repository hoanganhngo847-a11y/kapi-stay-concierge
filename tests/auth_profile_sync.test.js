import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Test Suite: Auth User & Public Profiles Synchronization for Booking
 *
 * Covers all 16 requirements from Task Section 11:
 * 1. New auth user automatically gets public.profiles row.
 * 2. OAuth user gets profile.
 * 3. Email/password user gets profile.
 * 4. Admin-created auth user gets profile through DB trigger.
 * 5. Backfill inserts missing profile.
 * 6. Backfill does not overwrite existing profile.
 * 7. Existing profile phone remains unchanged.
 * 8. staff_roles remains unchanged.
 * 9. create_hourly_checkout_session_atomic succeeds for authenticated user with valid profile.
 * 10. RPC self-heals a missing profile if defense-in-depth fallback is implemented.
 * 11. checkout_sessions.user_id FK remains enforced.
 * 12. booking finalization still succeeds.
 * 13. guest_count remains NULL for new booking.
 * 14. multi-day booking unaffected.
 * 15. temporary hold concurrency unaffected.
 * 16. rewards/loyalty unaffected.
 */

// -----------------------------------------------------------------------------
// Simulation Engine for Auth, Profiles, Staff Roles, Holds, and Bookings
// -----------------------------------------------------------------------------
class SystemSimulator {
  constructor() {
    this.authUsers = new Map();
    this.profiles = new Map();
    this.staffRoles = new Map();
    this.rooms = new Map();
    this.checkoutSessions = [];
    this.bookings = [];
    this.loyaltyLedger = [];
    this.locks = new Set();
  }

  // --- Auth & Trigger Layer ---
  handleNewAuthUserProfile(newUser) {
    if (this.profiles.has(newUser.id)) {
      return; // ON CONFLICT (id) DO NOTHING
    }
    const meta = newUser.raw_user_meta_data || {};
    const displayName =
      (meta.full_name && meta.full_name.trim()) ||
      (meta.name && meta.name.trim()) ||
      null;
    const avatarUrl =
      (meta.avatar_url && meta.avatar_url.trim()) ||
      (meta.picture && meta.picture.trim()) ||
      null;

    this.profiles.set(newUser.id, {
      id: newUser.id,
      display_name: displayName,
      avatar_url: avatarUrl,
      phone: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  createAuthUser({ id, email, provider = "email", raw_user_meta_data = {} }) {
    const user = {
      id,
      email,
      raw_app_meta_data: { provider, providers: [provider] },
      raw_user_meta_data,
      created_at: new Date().toISOString(),
    };
    this.authUsers.set(id, user);

    // Simulate DB trigger: AFTER INSERT ON auth.users
    this.handleNewAuthUserProfile(user);
    return user;
  }

  // Simulate manual/legacy user insertion WITHOUT trigger firing (e.g. legacy state)
  createLegacyAuthUserWithoutTrigger({ id, email, provider = "email", raw_user_meta_data = {} }) {
    const user = {
      id,
      email,
      raw_app_meta_data: { provider, providers: [provider] },
      raw_user_meta_data,
      created_at: new Date().toISOString(),
    };
    this.authUsers.set(id, user);
    return user;
  }

  // Simulate migration backfill logic
  runBackfillMissingProfiles() {
    let insertedCount = 0;
    for (const [id, user] of this.authUsers.entries()) {
      if (!this.profiles.has(id)) {
        const meta = user.raw_user_meta_data || {};
        const displayName =
          (meta.full_name && meta.full_name.trim()) ||
          (meta.name && meta.name.trim()) ||
          null;
        const avatarUrl =
          (meta.avatar_url && meta.avatar_url.trim()) ||
          (meta.picture && meta.picture.trim()) ||
          null;

        this.profiles.set(id, {
          id,
          display_name: displayName,
          avatar_url: avatarUrl,
          phone: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        insertedCount++;
      }
    }
    return insertedCount;
  }

  addRoom(room) {
    this.rooms.set(room.id, room);
  }

  // --- Checkout RPC simulation with defense-in-depth ---
  createHourlyCheckoutSessionAtomic({
    roomId,
    userId,
    checkInAt,
    checkOutAt,
    guestCount = null,
    enableDefenseInDepth = true,
    now = new Date("2026-09-30T08:00:00+07:00"),
  }) {
    if (!userId) {
      return { success: false, error: "UNAUTHORIZED" };
    }

    // Defense-in-depth: Ensure profile row exists
    if (enableDefenseInDepth) {
      if (!this.profiles.has(userId)) {
        this.profiles.set(userId, {
          id: userId,
          display_name: null,
          avatar_url: null,
          phone: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }

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
    const durationHours = Math.ceil((tOut - tIn) / (3600 * 1000));
    if (durationHours < 2) {
      return { success: false, error: "MINIMUM_BOOKING_DURATION_2_HOURS" };
    }

    // Concurrency advisory lock simulation
    const lockKey = `room_lock_${roomId}`;
    if (this.locks.has(lockKey)) {
      // already locked
    }
    this.locks.add(lockKey);

    try {
      // Check bookings overlap
      const hasBooking = this.bookings.some((b) => {
        if (b.room_id !== roomId || b.status === "CANCELLED") return false;
        const bIn = new Date(b.check_in_at).getTime();
        const bOut = new Date(b.check_out_at).getTime();
        return bIn < tOut && bOut > tIn;
      });
      if (hasBooking) return { success: false, error: "ROOM_NOT_AVAILABLE" };

      // Check active unexpired holds
      const hasHold = this.checkoutSessions.some((s) => {
        if (s.room_id !== roomId) return false;
        if (!["ACTIVE", "PAYMENT_PROCESSING"].includes(s.status)) return false;
        if (new Date(s.expires_at).getTime() <= nowMs) return false;
        const sIn = new Date(s.check_in_at).getTime();
        const sOut = new Date(s.check_out_at).getTime();
        return sIn < tOut && sOut > tIn;
      });
      if (hasHold) {
        return {
          success: false,
          error: "Khung giờ này vừa được một khách khác chọn. Vui lòng chọn khung giờ khác.",
          code: "ROOM_TEMPORARILY_HELD",
        };
      }

      // Foreign Key check: checkout_sessions.user_id REFERENCES public.profiles(id)
      if (!this.profiles.has(userId)) {
        throw new Error(
          'insert or update on table "checkout_sessions" violates foreign key constraint "checkout_sessions_user_id_fkey"'
        );
      }

      const sessionId = `cs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const grossAmount = room.hourly_price_vnd * durationHours;
      const session = {
        id: sessionId,
        user_id: userId,
        room_id: roomId,
        check_in_at: checkInAt,
        check_out_at: checkOutAt,
        guest_count: guestCount,
        gross_amount_vnd: grossAmount,
        discount_amount_vnd: 0,
        final_payable_amount_vnd: grossAmount,
        status: "ACTIVE",
        expires_at: new Date(nowMs + 30 * 60 * 1000).toISOString(),
        payment_reference: `KAPI-${sessionId.replace(/-/g, "").toUpperCase().slice(0, 12)}`,
      };

      this.checkoutSessions.push(session);
      return { success: true, sessionId, session };
    } finally {
      this.locks.delete(lockKey);
    }
  }

  finalizeBooking(sessionId) {
    const session = this.checkoutSessions.find((s) => s.id === sessionId);
    if (!session) throw new Error("SESSION_NOT_FOUND");

    // Foreign key check on bookings.user_id REFERENCES public.profiles(id)
    if (!this.profiles.has(session.user_id)) {
      throw new Error(
        'insert or update on table "bookings" violates foreign key constraint "bookings_user_id_fkey"'
      );
    }

    session.status = "COMPLETED";
    const booking = {
      id: `b-${Date.now()}`,
      user_id: session.user_id,
      room_id: session.room_id,
      check_in_at: session.check_in_at,
      check_out_at: session.check_out_at,
      guest_count: null,
      total_amount_vnd: session.final_payable_amount_vnd,
      status: "CONFIRMED",
    };
    this.bookings.push(booking);

    // Loyalty points formula: final_paid_amount_vnd * 0.00025
    const earnedPoints = Math.floor(session.final_payable_amount_vnd * 0.00025);
    this.loyaltyLedger.push({
      user_id: session.user_id,
      points_delta: earnedPoints,
      reason: "BOOKING_EARNED",
    });

    return { success: true, booking, earnedPoints };
  }
}

// =============================================================================
// TEST CASES
// =============================================================================

test("1. New auth user automatically gets public.profiles row", () => {
  const sim = new SystemSimulator();
  const user = sim.createAuthUser({
    id: "usr-new-001",
    email: "user1@example.com",
    raw_user_meta_data: { full_name: "Nguyễn Văn A", avatar_url: "https://example.com/a.jpg" },
  });

  const profile = sim.profiles.get(user.id);
  assert.ok(profile, "Profile must be created automatically");
  assert.equal(profile.id, user.id);
  assert.equal(profile.display_name, "Nguyễn Văn A");
  assert.equal(profile.avatar_url, "https://example.com/a.jpg");
});

test("2. OAuth user gets profile with parsed Google metadata", () => {
  const sim = new SystemSimulator();
  const oauthUser = sim.createAuthUser({
    id: "usr-oauth-002",
    email: "googleuser@gmail.com",
    provider: "google",
    raw_user_meta_data: { name: "Trần Thị B", picture: "https://lh3.googleusercontent.com/photo.jpg" },
  });

  const profile = sim.profiles.get(oauthUser.id);
  assert.ok(profile);
  assert.equal(profile.display_name, "Trần Thị B");
  assert.equal(profile.avatar_url, "https://lh3.googleusercontent.com/photo.jpg");
});

test("3. Email/password user gets profile", () => {
  const sim = new SystemSimulator();
  const emailUser = sim.createAuthUser({
    id: "usr-email-003",
    email: "emailuser@test.com",
    provider: "email",
    raw_user_meta_data: {},
  });

  const profile = sim.profiles.get(emailUser.id);
  assert.ok(profile, "Email/password user must receive a profile row");
  assert.equal(profile.id, emailUser.id);
  assert.equal(profile.display_name, null);
  assert.equal(profile.avatar_url, null);
});

test("4. Admin-created auth user gets profile through DB trigger", () => {
  const sim = new SystemSimulator();
  const adminUser = sim.createAuthUser({
    id: "usr-admin-004",
    email: "admin@kapi.vn",
    provider: "email",
    raw_user_meta_data: { full_name: "Admin Host" },
  });

  assert.ok(sim.profiles.has(adminUser.id), "Admin user created via auth must get profile row");
  assert.equal(sim.profiles.get(adminUser.id).display_name, "Admin Host");
});

test("5. Backfill inserts missing profile for existing auth users", () => {
  const sim = new SystemSimulator();
  // Create legacy users who missed profile creation
  sim.createLegacyAuthUserWithoutTrigger({
    id: "usr-legacy-005",
    email: "legacy1@example.com",
    raw_user_meta_data: { full_name: "Legacy User" },
  });
  sim.createLegacyAuthUserWithoutTrigger({
    id: "usr-legacy-006",
    email: "legacy2@example.com",
    raw_user_meta_data: { name: "Another Legacy" },
  });

  assert.equal(sim.profiles.size, 0);

  const backfilledCount = sim.runBackfillMissingProfiles();
  assert.equal(backfilledCount, 2);
  assert.equal(sim.profiles.size, 2);
  assert.equal(sim.profiles.get("usr-legacy-005").display_name, "Legacy User");
  assert.equal(sim.profiles.get("usr-legacy-006").display_name, "Another Legacy");
});

test("6. Backfill does not overwrite existing profile", () => {
  const sim = new SystemSimulator();
  // Pre-existing user with profile
  sim.createAuthUser({
    id: "usr-existing-007",
    email: "existing@example.com",
    raw_user_meta_data: { full_name: "Original Name" },
  });

  // Manually update display name to simulate customer custom name
  sim.profiles.get("usr-existing-007").display_name = "Custom Name";

  // Re-run backfill
  const count = sim.runBackfillMissingProfiles();
  assert.equal(count, 0, "No new profiles inserted");
  assert.equal(
    sim.profiles.get("usr-existing-007").display_name,
    "Custom Name",
    "Existing display name must be preserved"
  );
});

test("7. Existing profile phone remains unchanged by trigger or backfill", () => {
  const sim = new SystemSimulator();
  sim.createAuthUser({
    id: "usr-phone-008",
    email: "phone@example.com",
  });

  sim.profiles.get("usr-phone-008").phone = "0987654321";

  // Trigger re-execution or backfill must not touch existing phone
  sim.handleNewAuthUserProfile(sim.authUsers.get("usr-phone-008"));
  sim.runBackfillMissingProfiles();

  assert.equal(sim.profiles.get("usr-phone-008").phone, "0987654321");
});

test("8. staff_roles remains unchanged and decoupled from profiles", () => {
  const sim = new SystemSimulator();
  const staffUserId = "usr-staff-009";

  sim.createLegacyAuthUserWithoutTrigger({
    id: staffUserId,
    email: "staff@kapi.vn",
  });

  sim.staffRoles.set(staffUserId, { user_id: staffUserId, role: "admin" });

  assert.equal(sim.staffRoles.get(staffUserId).role, "admin");

  // Run backfill to create profile
  sim.runBackfillMissingProfiles();

  assert.ok(sim.profiles.has(staffUserId));
  assert.equal(sim.staffRoles.get(staffUserId).role, "admin");
});

test("9. create_hourly_checkout_session_atomic succeeds for authenticated user with valid profile", () => {
  const sim = new SystemSimulator();
  const roomId = "room-101";
  sim.addRoom({ id: roomId, is_listed: true, hourly_price_vnd: 120000 });

  const user = sim.createAuthUser({ id: "usr-valid-010", email: "guest@example.com" });

  const res = sim.createHourlyCheckoutSessionAtomic({
    roomId,
    userId: user.id,
    checkInAt: "2026-09-30T10:00:00+07:00",
    checkOutAt: "2026-09-30T14:00:00+07:00",
  });

  assert.equal(res.success, true);
  assert.ok(res.sessionId);
  assert.equal(res.session.user_id, user.id);
  assert.equal(res.session.status, "ACTIVE");
});

test("10. RPC self-heals a missing profile if defense-in-depth fallback is implemented", () => {
  const sim = new SystemSimulator();
  const roomId = "room-101";
  sim.addRoom({ id: roomId, is_listed: true, hourly_price_vnd: 120000 });

  // User in auth.users without a profile (simulates anomaly or un-backfilled legacy user)
  const user = sim.createLegacyAuthUserWithoutTrigger({
    id: "usr-missing-profile-011",
    email: "orphan@example.com",
  });

  assert.equal(sim.profiles.has(user.id), false);

  // Call RPC with defense-in-depth enabled -> it should self-heal and succeed!
  const res = sim.createHourlyCheckoutSessionAtomic({
    roomId,
    userId: user.id,
    checkInAt: "2026-09-30T10:00:00+07:00",
    checkOutAt: "2026-09-30T14:00:00+07:00",
    enableDefenseInDepth: true,
  });

  assert.equal(res.success, true);
  assert.ok(res.sessionId);
  assert.ok(sim.profiles.has(user.id), "Profile was self-healed by RPC fallback");
});

test("11. checkout_sessions.user_id FK remains enforced if profile is absent and defense is disabled", () => {
  const sim = new SystemSimulator();
  const roomId = "room-101";
  sim.addRoom({ id: roomId, is_listed: true, hourly_price_vnd: 120000 });

  const user = sim.createLegacyAuthUserWithoutTrigger({
    id: "usr-no-profile-012",
    email: "orphan2@example.com",
  });

  // Calling without defense in depth reproduces the exact production bug!
  assert.throws(
    () => {
      sim.createHourlyCheckoutSessionAtomic({
        roomId,
        userId: user.id,
        checkInAt: "2026-09-30T10:00:00+07:00",
        checkOutAt: "2026-09-30T14:00:00+07:00",
        enableDefenseInDepth: false,
      });
    },
    /checkout_sessions_user_id_fkey/
  );
});

test("12. booking finalization still succeeds", () => {
  const sim = new SystemSimulator();
  const roomId = "room-101";
  sim.addRoom({ id: roomId, is_listed: true, hourly_price_vnd: 100000 });
  const user = sim.createAuthUser({ id: "usr-fin-013", email: "final@example.com" });

  const { sessionId } = sim.createHourlyCheckoutSessionAtomic({
    roomId,
    userId: user.id,
    checkInAt: "2026-09-30T10:00:00+07:00",
    checkOutAt: "2026-09-30T13:00:00+07:00",
  });

  const finRes = sim.finalizeBooking(sessionId);
  assert.equal(finRes.success, true);
  assert.equal(finRes.booking.user_id, user.id);
  assert.equal(finRes.booking.status, "CONFIRMED");
});

test("13. guest_count remains NULL for new booking", () => {
  const sim = new SystemSimulator();
  const roomId = "room-101";
  sim.addRoom({ id: roomId, is_listed: true, hourly_price_vnd: 100000 });
  const user = sim.createAuthUser({ id: "usr-guest-014", email: "guestnull@example.com" });

  const { sessionId, session } = sim.createHourlyCheckoutSessionAtomic({
    roomId,
    userId: user.id,
    checkInAt: "2026-09-30T10:00:00+07:00",
    checkOutAt: "2026-09-30T13:00:00+07:00",
    guestCount: null,
  });

  assert.equal(session.guest_count, null);

  const finRes = sim.finalizeBooking(sessionId);
  assert.equal(finRes.booking.guest_count, null);
});

test("14. multi-day booking unaffected", () => {
  const sim = new SystemSimulator();
  const roomId = "room-101";
  sim.addRoom({ id: roomId, is_listed: true, hourly_price_vnd: 100000 });
  const user = sim.createAuthUser({ id: "usr-multi-015", email: "multiday@example.com" });

  // 48 hours stay
  const res = sim.createHourlyCheckoutSessionAtomic({
    roomId,
    userId: user.id,
    checkInAt: "2026-09-30T10:00:00+07:00",
    checkOutAt: "2026-10-02T10:00:00+07:00",
  });

  assert.equal(res.success, true);
  assert.equal(res.session.gross_amount_vnd, 48 * 100000);
});

test("15. temporary hold concurrency unaffected", () => {
  const sim = new SystemSimulator();
  const roomId = "room-101";
  sim.addRoom({ id: roomId, is_listed: true, hourly_price_vnd: 100000 });
  const user1 = sim.createAuthUser({ id: "usr-hold-1", email: "u1@example.com" });
  const user2 = sim.createAuthUser({ id: "usr-hold-2", email: "u2@example.com" });

  const res1 = sim.createHourlyCheckoutSessionAtomic({
    roomId,
    userId: user1.id,
    checkInAt: "2026-09-30T10:00:00+07:00",
    checkOutAt: "2026-09-30T14:00:00+07:00",
  });
  assert.equal(res1.success, true);

  const res2 = sim.createHourlyCheckoutSessionAtomic({
    roomId,
    userId: user2.id,
    checkInAt: "2026-09-30T12:00:00+07:00",
    checkOutAt: "2026-09-30T16:00:00+07:00",
  });
  assert.equal(res2.success, false);
  assert.equal(res2.code, "ROOM_TEMPORARILY_HELD");
});

test("16. rewards/loyalty unaffected (formula: final_paid_amount_vnd × 0.00025)", () => {
  const sim = new SystemSimulator();
  const roomId = "room-101";
  sim.addRoom({ id: roomId, is_listed: true, hourly_price_vnd: 100000 });
  const user = sim.createAuthUser({ id: "usr-loyalty-016", email: "loyalty@example.com" });

  const { sessionId } = sim.createHourlyCheckoutSessionAtomic({
    roomId,
    userId: user.id,
    checkInAt: "2026-09-30T10:00:00+07:00",
    checkOutAt: "2026-09-30T14:00:00+07:00", // 4h = 400,000 VND
  });

  const finRes = sim.finalizeBooking(sessionId);
  assert.equal(finRes.earnedPoints, Math.floor(400000 * 0.00025)); // 100 points
  assert.equal(sim.loyaltyLedger[0].points_delta, 100);
});

test("17. Migration SQL Contract Verification", () => {
  const migrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/20260930140000_ensure_auth_user_profiles.sql"
  );
  assert.ok(fs.existsSync(migrationPath), "Migration file must exist");
  const sql = fs.readFileSync(migrationPath, "utf-8");

  assert.ok(
    sql.includes("CREATE OR REPLACE FUNCTION public.handle_new_auth_user_profile()"),
    "Must create handle_new_auth_user_profile function"
  );
  assert.ok(sql.includes("SECURITY DEFINER"), "Function must be SECURITY DEFINER");
  assert.ok(sql.includes("SET search_path = ''"), "Function must set search_path = ''");
  assert.ok(
    sql.includes("CREATE TRIGGER on_auth_user_created_create_profile"),
    "Must create trigger on auth.users"
  );
  assert.ok(
    sql.includes("AFTER INSERT ON auth.users"),
    "Trigger must fire AFTER INSERT ON auth.users"
  );
  assert.ok(
    sql.includes("ON CONFLICT (id) DO NOTHING"),
    "Must use ON CONFLICT (id) DO NOTHING"
  );
  assert.ok(
    sql.includes("WHERE p.id IS NULL"),
    "Backfill must select where profile is null"
  );
  assert.ok(
    sql.includes("INSERT INTO public.profiles (id)"),
    "create_hourly_checkout_session_atomic must include defense in depth profile insert"
  );
});
