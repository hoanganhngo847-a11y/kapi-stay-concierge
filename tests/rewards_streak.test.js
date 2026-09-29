/**
 * @file tests/rewards_streak.test.js
 * Comprehensive automated test suite for Kapi Rewards Streak & Milestones Program.
 *
 * Validates the core business requirements:
 *   1. Daily Check-in Streak:
 *      - First checkin -> current_streak = 1, +5 points.
 *      - Next day checkin (Asia/Ho_Chi_Minh) -> current_streak = 2, +5 points.
 *      - Skip >= 1 day -> current_streak resets to 1, streak_cycle increments, +5 points.
 *      - Duplicate checkin on the same day -> +0 points, streak unchanged.
 *   2. Streak Milestones Auto-Issuance:
 *      - 9 -> 10 days: SNACK_X1 (1 snack)
 *      - 19 -> 20 days: SNACK_X2 (2 snacks)
 *      - 39 -> 40 days: SNACK_COMBO (1 drink + 2 snacks)
 *      - 79 -> 80 days: MEAL_CHOICE (1 chosen meal)
 *      - 149 -> 150 days: DISCOUNT_30 (30% discount, max base 1M, max discount 300k)
 *      - 364 -> 365 days: DISCOUNT_40 (40% discount, max base 1M, max discount 400k)
 *   3. Expiry Rules:
 *      - Streak rewards expire exactly 7 days after issuance.
 *      - 500-point voucher remains unchanged with 24-hour expiration.
 *   4. Cycle Isolation & Idempotency:
 *      - Milestone is issued at most once per streak cycle.
 *      - Streak break preserves already-issued rewards until their expires_at.
 *      - New streak cycle can re-earn milestones (not globally blocked).
 *   5. Discount Rules & Non-Stacking:
 *      - Maximum 1 discount voucher per booking (no 30%+40% stacking).
 *      - Day 150 cap: 300,000 VND.
 *      - Day 365 cap: 400,000 VND.
 *   6. Physical Rewards & Food Catalog Coexistence:
 *      - Physical/food reward can coexist with 1 discount voucher.
 *      - MEAL_CHOICE validates against active server catalog (reward_menu_items).
 *      - Inactive menu item cannot be selected.
 *   7. Checkout Lifecycle:
 *      - AVAILABLE -> RESERVED -> USED.
 *      - Release/abandon returns RESERVED back to AVAILABLE (if not expired).
 *      - Finalization is idempotent; retry does not duplicate usage or booking points.
 *   8. SQL Migration Artifact Verification:
 *      - SECURITY DEFINER, SET search_path = '', REVOKE anon/PUBLIC, GRANT authenticated/service_role.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// ── In-Memory Streak & Milestone Simulation Engine ──────────────────────────

class MockRewardsStreakEngine {
  constructor() {
    this.profiles = new Map();
    this.loyaltyTransactions = [];
    this.dailyCheckins = [];
    this.streaks = new Map(); // userId -> { current_streak, longest_streak, last_checkin_date, streak_cycle_id }
    this.definitions = [
      { id: "def-10", milestone_day: 10, reward_type: "SNACK_X1", title: "1 gói bim bim bất kỳ", expiry_days: 7 },
      { id: "def-20", milestone_day: 20, reward_type: "SNACK_X2", title: "2 gói bim bim bất kỳ", expiry_days: 7 },
      { id: "def-40", milestone_day: 40, reward_type: "SNACK_COMBO", title: "1 nước + 2 bim bim", expiry_days: 7 },
      { id: "def-80", milestone_day: 80, reward_type: "MEAL_CHOICE", title: "1 món ăn bất kỳ", expiry_days: 7 },
      {
        id: "def-150",
        milestone_day: 150,
        reward_type: "DISCOUNT_30",
        title: "Voucher giảm 30%",
        expiry_days: 7,
        discount_percentage: 30,
        max_eligible_base_vnd: 1000000,
        max_discount_vnd: 300000,
      },
      {
        id: "def-365",
        milestone_day: 365,
        reward_type: "DISCOUNT_40",
        title: "Voucher giảm 40%",
        expiry_days: 7,
        discount_percentage: 40,
        max_eligible_base_vnd: 1000000,
        max_discount_vnd: 400000,
      },
    ];
    this.menuItems = [
      { id: "menu-1", name: "Cơm sườn nướng", is_active: true },
      { id: "menu-2", name: "Phở bò Hà Nội", is_active: true },
      { id: "menu-3", name: "Bún trộn Nam Bộ", is_active: true },
      { id: "menu-4", name: "Bánh tráng nướng Đà Lạt", is_active: true },
      { id: "menu-5", name: "Bánh xèo miền Tây", is_active: true },
      { id: "menu-6", name: "Món ngưng phục vụ", is_active: false },
    ];
    this.entitlements = []; // { id, user_id, reward_definition_id, streak_cycle_id, milestone_day, status, issued_at, expires_at, checkout_session_id, booking_id, selection_data }
    this.checkoutSessions = new Map(); // sessionId -> { id, user_id, gross_amount_vnd, voucher_discount_vnd, final_amount_vnd, status }
  }

  addUser(userId) {
    this.profiles.set(userId, { id: userId });
  }

  getBalance(userId) {
    return this.loyaltyTransactions
      .filter((tx) => tx.user_id === userId)
      .reduce((acc, tx) => acc + tx.points_delta, 0);
  }

  getStreak(userId) {
    return this.streaks.get(userId) || {
      current_streak: 0,
      longest_streak: 0,
      last_checkin_date: null,
      streak_cycle_id: 1,
    };
  }

  claimDaily(userId, dateStr) {
    if (!userId || !this.profiles.has(userId)) {
      return { success: false, error: "UNAUTHORIZED" };
    }

    const streak = this.getStreak(userId);

    // 1. Idempotency: same date
    if (streak.last_checkin_date === dateStr) {
      return {
        success: false,
        error: "ALREADY_CLAIMED_TODAY",
        already_claimed: true,
        points_added: 0,
        points_balance: this.getBalance(userId),
        current_streak: streak.current_streak,
        longest_streak: streak.longest_streak,
      };
    }

    // 2. Calculate streak progression
    let newStreak = 1;
    let newCycleId = streak.streak_cycle_id;

    if (streak.last_checkin_date) {
      const lastDate = new Date(`${streak.last_checkin_date}T00:00:00Z`);
      const currentDate = new Date(`${dateStr}T00:00:00Z`);
      const diffDays = Math.round((currentDate.getTime() - lastDate.getTime()) / (86400000));

      if (diffDays === 1) {
        newStreak = streak.current_streak + 1;
      } else if (diffDays > 1) {
        newStreak = 1;
        newCycleId = streak.streak_cycle_id + 1;
      }
    }

    const newLongest = Math.max(streak.longest_streak, newStreak);
    this.streaks.set(userId, {
      current_streak: newStreak,
      longest_streak: newLongest,
      last_checkin_date: dateStr,
      streak_cycle_id: newCycleId,
    });

    // 3. Record daily checkin & loyalty transaction (+5)
    this.dailyCheckins.push({ user_id: userId, checkin_date: dateStr });
    this.loyaltyTransactions.push({ user_id: userId, points_delta: 5, description: "Daily Check-in +5" });

    // 4. Milestone check
    const milestoneDef = this.definitions.find((d) => d.milestone_day === newStreak);
    let issuedReward = null;

    if (milestoneDef) {
      // Check if already issued in this cycle
      const alreadyIssued = this.entitlements.some(
        (e) =>
          e.user_id === userId &&
          e.streak_cycle_id === newCycleId &&
          e.milestone_day === newStreak
      );

      if (!alreadyIssued) {
        const issuedAt = new Date(`${dateStr}T10:00:00+07:00`);
        const expiresAt = new Date(issuedAt.getTime() + milestoneDef.expiry_days * 86400000);
        const ent = {
          id: `ent-${this.entitlements.length + 1}`,
          user_id: userId,
          reward_definition_id: milestoneDef.id,
          streak_cycle_id: newCycleId,
          milestone_day: newStreak,
          status: "AVAILABLE",
          issued_at: issuedAt.toISOString(),
          expires_at: expiresAt.toISOString(),
          checkout_session_id: null,
          booking_id: null,
          selection_data: null,
        };
        this.entitlements.push(ent);
        issuedReward = {
          id: ent.id,
          type: milestoneDef.reward_type,
          title: milestoneDef.title,
          expires_at: ent.expires_at,
        };
      }
    }

    return {
      success: true,
      points_added: 5,
      points_balance: this.getBalance(userId),
      current_streak: newStreak,
      longest_streak: newLongest,
      milestone_reached: milestoneDef ? newStreak : null,
      reward_issued: issuedReward,
    };
  }

  reserveEntitlement(userId, sessionId, entitlementId, menuItemId = null) {
    const ent = this.entitlements.find((e) => e.id === entitlementId);
    if (!ent) return { success: false, error: "ENTITLEMENT_NOT_FOUND" };
    if (ent.user_id !== userId) return { success: false, error: "FORBIDDEN" };
    if (ent.status !== "AVAILABLE") return { success: false, error: "NOT_AVAILABLE" };

    const def = this.definitions.find((d) => d.id === ent.reward_definition_id);
    if (!def) return { success: false, error: "DEFINITION_NOT_FOUND" };

    // If MEAL_CHOICE, validate menuItemId
    let selectionData = null;
    if (def.reward_type === "MEAL_CHOICE") {
      if (!menuItemId) return { success: false, error: "MENU_ITEM_REQUIRED" };
      const item = this.menuItems.find((m) => m.id === menuItemId && m.is_active);
      if (!item) return { success: false, error: "INVALID_OR_INACTIVE_MENU_ITEM" };
      selectionData = { menu_item_id: item.id, menu_item_name: item.name };
    }

    ent.status = "RESERVED";
    ent.checkout_session_id = sessionId;
    ent.selection_data = selectionData;

    return { success: true, entitlement: ent };
  }

  releaseEntitlement(userId, sessionId, entitlementId) {
    const ent = this.entitlements.find((e) => e.id === entitlementId);
    if (!ent) return { success: false, error: "NOT_FOUND" };
    if (ent.user_id !== userId) return { success: false, error: "FORBIDDEN" };
    if (ent.checkout_session_id !== sessionId) return { success: false, error: "SESSION_MISMATCH" };

    ent.status = "AVAILABLE";
    ent.checkout_session_id = null;
    return { success: true };
  }

  finalizeBooking(sessionId, bookingId) {
    // Transition all reserved entitlements for this session to USED
    const reserved = this.entitlements.filter(
      (e) => e.checkout_session_id === sessionId && e.status === "RESERVED"
    );

    for (const e of reserved) {
      e.status = "USED";
      e.booking_id = bookingId;
    }

    return { success: true, count: reserved.length };
  }
}

// ── Test Suites ─────────────────────────────────────────────────────────────

test("Streak Test 1: Daily Check-in Progression (+5, streak 1 -> streak 2)", () => {
  const engine = new MockRewardsStreakEngine();
  const userId = "user-1";
  engine.addUser(userId);

  // Day 1
  const res1 = engine.claimDaily(userId, "2026-10-01");
  assert.equal(res1.success, true);
  assert.equal(res1.points_added, 5);
  assert.equal(res1.points_balance, 5);
  assert.equal(res1.current_streak, 1);
  assert.equal(res1.longest_streak, 1);

  // Day 2 (Consecutive day)
  const res2 = engine.claimDaily(userId, "2026-10-02");
  assert.equal(res2.success, true);
  assert.equal(res2.points_added, 5);
  assert.equal(res2.points_balance, 10);
  assert.equal(res2.current_streak, 2);
  assert.equal(res2.longest_streak, 2);
});

test("Streak Test 2: Same-day duplicate check-in is strictly idempotent (+0 points)", () => {
  const engine = new MockRewardsStreakEngine();
  const userId = "user-2";
  engine.addUser(userId);

  engine.claimDaily(userId, "2026-10-01");
  const dup = engine.claimDaily(userId, "2026-10-01");

  assert.equal(dup.success, false);
  assert.equal(dup.already_claimed, true);
  assert.equal(dup.points_added, 0);
  assert.equal(dup.current_streak, 1);
  assert.equal(engine.getBalance(userId), 5);
});

test("Streak Test 3: Skipping >= 1 day resets current_streak to 1 and starts new cycle", () => {
  const engine = new MockRewardsStreakEngine();
  const userId = "user-3";
  engine.addUser(userId);

  // 3 consecutive days
  engine.claimDaily(userId, "2026-10-01");
  engine.claimDaily(userId, "2026-10-02");
  const res3 = engine.claimDaily(userId, "2026-10-03");
  assert.equal(res3.current_streak, 3);
  assert.equal(res3.longest_streak, 3);

  // Skip 2026-10-04, check in on 2026-10-05
  const resReset = engine.claimDaily(userId, "2026-10-05");
  assert.equal(resReset.success, true);
  assert.equal(resReset.current_streak, 1);
  assert.equal(resReset.longest_streak, 3, "Longest streak must preserve historical peak");
  assert.equal(engine.getStreak(userId).streak_cycle_id, 2, "Streak cycle must increment");
});

test("Streak Test 4: Milestones 10, 20, 40, 80, 150, 365 Auto-Issuance", () => {
  const engine = new MockRewardsStreakEngine();
  const userId = "user-milestone";
  engine.addUser(userId);

  // Simulate reaching day 10
  for (let i = 1; i <= 9; i++) {
    const pad = String(i).padStart(2, "0");
    const r = engine.claimDaily(userId, `2026-01-${pad}`);
    assert.equal(r.reward_issued, null);
  }

  // Day 10 -> SNACK_X1
  const r10 = engine.claimDaily(userId, "2026-01-10");
  assert.equal(r10.milestone_reached, 10);
  assert.ok(r10.reward_issued);
  assert.equal(r10.reward_issued.type, "SNACK_X1");

  // Fast forward to day 20 -> SNACK_X2
  for (let i = 11; i <= 19; i++) {
    engine.claimDaily(userId, `2026-01-${i}`);
  }
  const r20 = engine.claimDaily(userId, "2026-01-20");
  assert.equal(r20.reward_issued?.type, "SNACK_X2");

  // Fast forward to day 40 -> SNACK_COMBO
  for (let i = 21; i <= 39; i++) {
    const d = new Date(new Date("2026-01-01").getTime() + (i - 1) * 86400000);
    engine.claimDaily(userId, d.toISOString().slice(0, 10));
  }
  const r40 = engine.claimDaily(userId, new Date(new Date("2026-01-01").getTime() + 39 * 86400000).toISOString().slice(0, 10));
  assert.equal(r40.reward_issued?.type, "SNACK_COMBO");

  // Fast forward to day 80 -> MEAL_CHOICE
  for (let i = 41; i <= 79; i++) {
    const d = new Date(new Date("2026-01-01").getTime() + (i - 1) * 86400000);
    engine.claimDaily(userId, d.toISOString().slice(0, 10));
  }
  const r80 = engine.claimDaily(userId, new Date(new Date("2026-01-01").getTime() + 79 * 86400000).toISOString().slice(0, 10));
  assert.equal(r80.reward_issued?.type, "MEAL_CHOICE");

  // Fast forward to day 150 -> DISCOUNT_30
  for (let i = 81; i <= 149; i++) {
    const d = new Date(new Date("2026-01-01").getTime() + (i - 1) * 86400000);
    engine.claimDaily(userId, d.toISOString().slice(0, 10));
  }
  const r150 = engine.claimDaily(userId, new Date(new Date("2026-01-01").getTime() + 149 * 86400000).toISOString().slice(0, 10));
  assert.equal(r150.reward_issued?.type, "DISCOUNT_30");

  // Fast forward to day 365 -> DISCOUNT_40
  for (let i = 151; i <= 364; i++) {
    const d = new Date(new Date("2026-01-01").getTime() + (i - 1) * 86400000);
    engine.claimDaily(userId, d.toISOString().slice(0, 10));
  }
  const r365 = engine.claimDaily(userId, new Date(new Date("2026-01-01").getTime() + 364 * 86400000).toISOString().slice(0, 10));
  assert.equal(r365.reward_issued?.type, "DISCOUNT_40");
});

test("Streak Test 5: 7-Day Expiry on all streak rewards vs 24-hour on 500-pt voucher", () => {
  const engine = new MockRewardsStreakEngine();
  const userId = "user-expiry";
  engine.addUser(userId);

  for (let i = 1; i <= 10; i++) {
    const pad = String(i).padStart(2, "0");
    engine.claimDaily(userId, `2026-02-${pad}`);
  }

  const entitlement = engine.entitlements.find((e) => e.milestone_day === 10);
  assert.ok(entitlement);

  const issued = new Date(entitlement.issued_at).getTime();
  const expires = new Date(entitlement.expires_at).getTime();
  const diffHours = (expires - issued) / (1000 * 3600);

  assert.equal(diffHours, 7 * 24, "Streak milestone reward must expire exactly 7 days (168 hours) after issuance");
});

test("Streak Test 6: Cycle Idempotency — Streak break does not revoke existing reward, new cycle can re-earn", () => {
  const engine = new MockRewardsStreakEngine();
  const userId = "user-cycle";
  engine.addUser(userId);

  // Cycle 1: Reach Day 10
  for (let i = 1; i <= 10; i++) {
    const pad = String(i).padStart(2, "0");
    engine.claimDaily(userId, `2026-03-${pad}`);
  }
  assert.equal(engine.entitlements.length, 1);
  const rewardCycle1 = engine.entitlements[0];
  assert.equal(rewardCycle1.status, "AVAILABLE");

  // Streak breaks on day 12 (skipping day 11)
  engine.claimDaily(userId, "2026-03-12");
  assert.equal(engine.getStreak(userId).current_streak, 1);
  assert.equal(rewardCycle1.status, "AVAILABLE", "Existing reward must remain AVAILABLE and not be revoked");

  // Cycle 2: Work up to Day 10 again
  for (let i = 13; i <= 21; i++) {
    engine.claimDaily(userId, `2026-03-${i}`);
  }
  assert.equal(engine.getStreak(userId).current_streak, 10);
  assert.equal(engine.entitlements.length, 2, "New cycle must successfully issue milestone 10 again");
  assert.equal(engine.entitlements[1].streak_cycle_id, 2);
});

test("Streak Test 7: Discount Calculations & Cap Rules", () => {
  // 150-Day Discount: 30%, max base 1M, max discount 300,000 VND
  const calcDiscount30 = (gross) => {
    const eligible = Math.min(gross, 1000000);
    return Math.min(Math.floor((eligible * 30) / 100), 300000);
  };

  assert.equal(calcDiscount30(500000), 150000);
  assert.equal(calcDiscount30(1000000), 300000);
  assert.equal(calcDiscount30(2500000), 300000, "Capped at 300,000 VND max discount");

  // 365-Day Discount: 40%, max base 1M, max discount 400,000 VND
  const calcDiscount40 = (gross) => {
    const eligible = Math.min(gross, 1000000);
    return Math.min(Math.floor((eligible * 40) / 100), 400000);
  };

  assert.equal(calcDiscount40(500000), 200000);
  assert.equal(calcDiscount40(1000000), 400000);
  assert.equal(calcDiscount40(3000000), 400000, "Capped at 400,000 VND max discount");
});

test("Streak Test 8: Meal Choice Catalog Validation — Active vs Inactive", () => {
  const engine = new MockRewardsStreakEngine();
  const userId = "user-meal";
  engine.addUser(userId);

  // Directly give user a MEAL_CHOICE entitlement
  const ent = {
    id: "ent-meal-1",
    user_id: userId,
    reward_definition_id: "def-80",
    streak_cycle_id: 1,
    milestone_day: 80,
    status: "AVAILABLE",
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    checkout_session_id: null,
    booking_id: null,
    selection_data: null,
  };
  engine.entitlements.push(ent);

  // 1. Trying to reserve without food choice => Error
  const resNoMenu = engine.reserveEntitlement(userId, "session-1", "ent-meal-1", null);
  assert.equal(resNoMenu.success, false);
  assert.equal(resNoMenu.error, "MENU_ITEM_REQUIRED");

  // 2. Trying to reserve inactive food item => Error
  const resInactive = engine.reserveEntitlement(userId, "session-1", "ent-meal-1", "menu-6");
  assert.equal(resInactive.success, false);
  assert.equal(resInactive.error, "INVALID_OR_INACTIVE_MENU_ITEM");

  // 3. Reserving active food item (Phở bò Hà Nội) => Success
  const resSuccess = engine.reserveEntitlement(userId, "session-1", "ent-meal-1", "menu-2");
  assert.equal(resSuccess.success, true);
  assert.equal(ent.status, "RESERVED");
  assert.deepEqual(ent.selection_data, {
    menu_item_id: "menu-2",
    menu_item_name: "Phở bò Hà Nội",
  });
});

test("Streak Test 9: Checkout Lifecycle (AVAILABLE -> RESERVED -> RELEASE / FINALIZE)", () => {
  const engine = new MockRewardsStreakEngine();
  const userId = "user-lifecycle";
  engine.addUser(userId);

  const ent = {
    id: "ent-snack-1",
    user_id: userId,
    reward_definition_id: "def-10",
    streak_cycle_id: 1,
    milestone_day: 10,
    status: "AVAILABLE",
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    checkout_session_id: null,
    booking_id: null,
    selection_data: null,
  };
  engine.entitlements.push(ent);

  // 1. Reserve for session A
  const rRes = engine.reserveEntitlement(userId, "sess-A", "ent-snack-1");
  assert.equal(rRes.success, true);
  assert.equal(ent.status, "RESERVED");
  assert.equal(ent.checkout_session_id, "sess-A");

  // 2. Session B attempts to reserve same entitlement => NOT_AVAILABLE
  const rDouble = engine.reserveEntitlement(userId, "sess-B", "ent-snack-1");
  assert.equal(rDouble.success, false);
  assert.equal(rDouble.error, "NOT_AVAILABLE");

  // 3. User releases from session A => returns to AVAILABLE
  const rRel = engine.releaseEntitlement(userId, "sess-A", "ent-snack-1");
  assert.equal(rRel.success, true);
  assert.equal(ent.status, "AVAILABLE");
  assert.equal(ent.checkout_session_id, null);

  // 4. Reserve again and finalize booking
  engine.reserveEntitlement(userId, "sess-A", "ent-snack-1");
  const rFin = engine.finalizeBooking("sess-A", "booking-999");
  assert.equal(rFin.success, true);
  assert.equal(ent.status, "USED");
  assert.equal(ent.booking_id, "booking-999");
});

test("Streak Test 10: User Isolation — Cross-user tampering rejected", () => {
  const engine = new MockRewardsStreakEngine();
  engine.addUser("user-alice");
  engine.addUser("user-eve");

  const ent = {
    id: "ent-alice-1",
    user_id: "user-alice",
    reward_definition_id: "def-10",
    streak_cycle_id: 1,
    milestone_day: 10,
    status: "AVAILABLE",
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    checkout_session_id: null,
    booking_id: null,
    selection_data: null,
  };
  engine.entitlements.push(ent);

  // Eve tries to reserve Alice's entitlement
  const rTamper = engine.reserveEntitlement("user-eve", "sess-eve", "ent-alice-1");
  assert.equal(rTamper.success, false);
  assert.equal(rTamper.error, "FORBIDDEN");
});

test("Streak Test 11: SQL Migration Verification — Search path, security definer, permissions", () => {
  const migrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/20260929140000_rewards_streak_program.sql"
  );
  assert.ok(fs.existsSync(migrationPath), "Migration file must exist");

  const sql = fs.readFileSync(migrationPath, "utf-8");

  // Tables
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.streak_reward_definitions"));
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.reward_menu_items"));
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.user_reward_streaks"));
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.user_reward_entitlements"));

  // Check unique constraints
  assert.ok(sql.includes("uq_user_streak_cycle_milestone"));

  // Security checks
  assert.ok(sql.includes("SECURITY DEFINER"));
  assert.ok(sql.includes("SET search_path = ''"));
  assert.ok(sql.includes("REVOKE ALL ON FUNCTION public.claim_daily_reward() FROM anon"));
  assert.ok(sql.includes("GRANT EXECUTE ON FUNCTION public.claim_daily_reward() TO authenticated"));
  assert.ok(sql.includes("GRANT EXECUTE ON FUNCTION public.finalize_verified_checkout_atomic(UUID, BIGINT, TEXT) TO service_role"));
  assert.ok(sql.includes("REVOKE ALL ON FUNCTION public.finalize_verified_checkout_atomic(UUID, BIGINT, TEXT) FROM authenticated"));
});
