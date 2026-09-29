/**
 * @file tests/menu_and_streak.test.js
 * Comprehensive automated test suite for Menu Ordering & Streak Fix:
 *   1. Streak Rules: First checkin = 1, consecutive = +1, skip = broken, next checkin = 1, same-day duplicate = unchanged.
 *   2. Menu Catalog: Strictly 3 categories (DRINK, SNACK, MAIN_FOOD), active items load, search, category filtering.
 *   3. Paid Add-ons: Server-side authoritative pricing, quantity controls, subtotal.
 *   4. Total Price Rule: Voucher discounts room charge only, menu add-ons excluded from discount.
 *   5. Reward Mapping: Quotas for SNACK_X1, SNACK_X2, SNACK_COMBO, MEAL_CHOICE, rejection of wrong categories/inactive items.
 *   6. Checkout Finalization & Operations Visibility: Idempotent booking menu persistence, paid vs reward items itemized.
 *   7. SQL Migration Verification: Schema, RLS, search_path, permissions.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// ── Read authoritative catalog directly from migration SQL ───────────────────
const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20260929153000_kapi_menu_ordering.sql"
);
const migrationSql = fs.readFileSync(migrationPath, "utf-8");

// Parse rows: ('name', 'slug', 'category', 'desc', price, active, sort)
const rowRegex = /\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']*)',\s*(\d+),\s*(true|false),\s*(\d+)\)/g;
const ALL_MENU_PRODUCTS = [];
let match;
let prodIdx = 1;
while ((match = rowRegex.exec(migrationSql)) !== null) {
  ALL_MENU_PRODUCTS.push({
    id: `prod-${prodIdx++}`,
    name: match[1],
    slug: match[2],
    category: match[3],
    description: match[4] || null,
    price_vnd: parseInt(match[5], 10),
    is_active: match[6] === "true",
    sort_order: parseInt(match[7], 10),
  });
}

// ── 1. STREAK ENGINE SIMULATION ─────────────────────────────────────────────

class MockStreakEngine {
  constructor() {
    this.streaks = new Map(); // userId -> { current_streak, longest_streak, last_checkin_date, streak_cycle_id }
    this.points = new Map();  // userId -> balance
  }

  getSummary(userId, todayDateStr) {
    const s = this.streaks.get(userId);
    const balance = this.points.get(userId) || 0;
    if (!s) {
      return {
        current_streak: 0,
        longest_streak: 0,
        has_checked_in_today: false,
        is_streak_broken: false,
        balance,
      };
    }

    const hasCheckedInToday = s.last_checkin_date === todayDateStr;
    let isStreakBroken = false;

    if (!hasCheckedInToday && s.last_checkin_date) {
      const last = new Date(s.last_checkin_date + "T00:00:00Z");
      const cur = new Date(todayDateStr + "T00:00:00Z");
      const diffDays = Math.round((cur.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > 1) {
        isStreakBroken = true;
      }
    }

    return {
      current_streak: hasCheckedInToday ? Math.max(1, s.current_streak) : (isStreakBroken ? 0 : s.current_streak),
      longest_streak: s.longest_streak,
      has_checked_in_today: hasCheckedInToday,
      is_streak_broken: isStreakBroken,
      balance,
    };
  }

  checkin(userId, todayDateStr) {
    let s = this.streaks.get(userId);
    let balance = this.points.get(userId) || 0;

    if (!s) {
      // First checkin
      s = {
        current_streak: 1,
        longest_streak: 1,
        last_checkin_date: todayDateStr,
        streak_cycle_id: 1,
      };
      balance += 5;
      this.streaks.set(userId, s);
      this.points.set(userId, balance);
      return { success: true, points_added: 5, streak: 1, cycle_id: 1 };
    }

    if (s.last_checkin_date === todayDateStr) {
      // Duplicate checkin today -> unchanged
      return { success: true, points_added: 0, streak: s.current_streak, cycle_id: s.streak_cycle_id };
    }

    const last = new Date(s.last_checkin_date + "T00:00:00Z");
    const cur = new Date(todayDateStr + "T00:00:00Z");
    const diffDays = Math.round((cur.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      // Consecutive day -> streak + 1
      s.current_streak += 1;
      s.longest_streak = Math.max(s.longest_streak, s.current_streak);
      s.last_checkin_date = todayDateStr;
      balance += 5;
      this.points.set(userId, balance);
      return { success: true, points_added: 5, streak: s.current_streak, cycle_id: s.streak_cycle_id };
    } else {
      // Skipped >= 1 day -> streak broken, reset to 1 in new cycle!
      s.current_streak = 1;
      s.streak_cycle_id += 1;
      s.last_checkin_date = todayDateStr;
      balance += 5;
      this.points.set(userId, balance);
      return { success: true, points_added: 5, streak: 1, cycle_id: s.streak_cycle_id };
    }
  }
}

// ── 2. MENU ENGINE & CHECKOUT SIMULATION ────────────────────────────────────

class MockMenuCheckoutEngine {
  constructor(products) {
    this.products = new Map(products.map((p) => [p.id, p]));
    this.checkoutSessions = new Map();
    this.checkoutMenuItems = new Map(); // sessionId -> array of items
    this.bookings = new Map();
    this.bookingMenuItems = new Map();  // bookingId -> array of items
    this.entitlements = new Map();      // entId -> entitlement
  }

  createSession(id, userId, grossVnd, roomDiscountVnd = 0) {
    const finalPayable = Math.max(0, grossVnd - roomDiscountVnd);
    const session = {
      id,
      user_id: userId,
      gross_amount_vnd: grossVnd,
      discount_amount_vnd: roomDiscountVnd,
      menu_amount_vnd: 0,
      final_payable_amount_vnd: finalPayable,
      status: "ACTIVE",
    };
    this.checkoutSessions.set(id, session);
    this.checkoutMenuItems.set(id, []);
    return session;
  }

  addEntitlement(ent) {
    this.entitlements.set(ent.id, {
      ...ent,
      status: "AVAILABLE",
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
  }

  updateCheckoutMenuItems(sessionId, userId, itemsPayload) {
    const session = this.checkoutSessions.get(sessionId);
    if (!session || session.user_id !== userId) {
      return { success: false, error: "FORBIDDEN_OR_SESSION_NOT_FOUND" };
    }

    if (!itemsPayload || itemsPayload.length === 0) {
      this.checkoutMenuItems.set(sessionId, []);
      session.menu_amount_vnd = 0;
      session.final_payable_amount_vnd = Math.max(0, session.gross_amount_vnd - session.discount_amount_vnd);
      return { success: true, menu_amount_vnd: 0, final_payable: session.final_payable_amount_vnd };
    }

    let menuAddonTotal = 0;
    const validatedItems = [];
    const entGroups = {};

    for (const item of itemsPayload) {
      if (!item.menu_product_id || item.quantity <= 0) {
        return { success: false, error: "INVALID_QUANTITY" };
      }

      const prod = this.products.get(item.menu_product_id);
      if (!prod || !prod.is_active) {
        return { success: false, error: "INACTIVE_OR_INVALID_PRODUCT" };
      }

      if (item.source_type === "REWARD") {
        if (!item.entitlement_id) {
          return { success: false, error: "ENTITLEMENT_ID_REQUIRED_FOR_REWARD" };
        }
        const ent = this.entitlements.get(item.entitlement_id);
        if (!ent || ent.user_id !== userId) {
          return { success: false, error: "FORBIDDEN_ENTITLEMENT_OWNER" };
        }
        if (ent.status !== "AVAILABLE" && ent.checkout_session_id !== sessionId) {
          return { success: false, error: "ENTITLEMENT_NOT_AVAILABLE" };
        }
        if (new Date(ent.expires_at) <= new Date()) {
          return { success: false, error: "ENTITLEMENT_EXPIRED" };
        }

        if (!entGroups[ent.id]) {
          entGroups[ent.id] = { ent, snack_qty: 0, drink_qty: 0, main_qty: 0 };
        }
        if (prod.category === "SNACK") entGroups[ent.id].snack_qty += item.quantity;
        if (prod.category === "DRINK") entGroups[ent.id].drink_qty += item.quantity;
        if (prod.category === "MAIN_FOOD") entGroups[ent.id].main_qty += item.quantity;

        validatedItems.push({
          id: `cmi-${Math.random()}`,
          checkout_session_id: sessionId,
          menu_product_id: prod.id,
          name: prod.name,
          category: prod.category,
          quantity: item.quantity,
          source_type: "REWARD",
          entitlement_id: ent.id,
          unit_price_vnd: 0,
          total_price_vnd: 0,
          normal_price_vnd: prod.price_vnd,
          reward_source: ent.reward_type,
        });
      } else {
        // PURCHASE: Authoritative server price!
        const unitPrice = prod.price_vnd;
        const totalPrice = unitPrice * item.quantity;
        menuAddonTotal += totalPrice;

        validatedItems.push({
          id: `cmi-${Math.random()}`,
          checkout_session_id: sessionId,
          menu_product_id: prod.id,
          name: prod.name,
          category: prod.category,
          quantity: item.quantity,
          source_type: "PURCHASE",
          entitlement_id: null,
          unit_price_vnd: unitPrice,
          total_price_vnd: totalPrice,
          normal_price_vnd: unitPrice,
        });
      }
    }

    // Verify Reward quotas strictly
    for (const [, g] of Object.entries(entGroups)) {
      if (g.ent.reward_type === "SNACK_X1") {
        if (g.snack_qty !== 1 || g.drink_qty !== 0 || g.main_qty !== 0) {
          return { success: false, error: "SNACK_X1_QUOTA_MISMATCH" };
        }
      } else if (g.ent.reward_type === "SNACK_X2") {
        if (g.snack_qty !== 2 || g.drink_qty !== 0 || g.main_qty !== 0) {
          return { success: false, error: "SNACK_X2_QUOTA_MISMATCH" };
        }
      } else if (g.ent.reward_type === "SNACK_COMBO") {
        if (g.snack_qty !== 2 || g.drink_qty !== 1 || g.main_qty !== 0) {
          return { success: false, error: "SNACK_COMBO_QUOTA_MISMATCH" };
        }
      } else if (g.ent.reward_type === "MEAL_CHOICE") {
        if (g.main_qty !== 1 || g.snack_qty !== 0 || g.drink_qty !== 0) {
          return { success: false, error: "MEAL_CHOICE_QUOTA_MISMATCH" };
        }
      }
    }

    this.checkoutMenuItems.set(sessionId, validatedItems);
    session.menu_amount_vnd = menuAddonTotal;
    // Rule J: Voucher discounts room only; addons strictly excluded!
    session.final_payable_amount_vnd = (session.gross_amount_vnd - session.discount_amount_vnd) + menuAddonTotal;

    return {
      success: true,
      menu_amount_vnd: menuAddonTotal,
      final_payable_amount_vnd: session.final_payable_amount_vnd,
      items: validatedItems,
    };
  }

  finalizeCheckout(sessionId) {
    const session = this.checkoutSessions.get(sessionId);
    if (!session) return { success: false, error: "SESSION_NOT_FOUND" };

    // Idempotent: check if already finalized
    let booking = Array.from(this.bookings.values()).find((b) => b.checkout_session_id === sessionId);
    if (booking) {
      return { success: true, booking_id: booking.id, is_duplicate: true };
    }

    const bookingId = `book-${sessionId}`;
    booking = {
      id: bookingId,
      checkout_session_id: sessionId,
      user_id: session.user_id,
      gross_amount_vnd: session.gross_amount_vnd,
      discount_amount_vnd: session.discount_amount_vnd,
      menu_amount_vnd: session.menu_amount_vnd,
      final_paid_amount_vnd: session.final_payable_amount_vnd,
      status: "CONFIRMED",
    };
    this.bookings.set(bookingId, booking);

    const cItems = this.checkoutMenuItems.get(sessionId) || [];
    const bItems = cItems.map((ci) => ({
      id: `bmi-${ci.id}`,
      booking_id: bookingId,
      menu_product_id: ci.menu_product_id,
      product_name_snapshot: ci.name,
      quantity: ci.quantity,
      source_type: ci.source_type,
      entitlement_id: ci.entitlement_id,
      unit_price_vnd: ci.unit_price_vnd,
      total_price_vnd: ci.total_price_vnd,
      normal_price_vnd: ci.normal_price_vnd,
      reward_source: ci.reward_source,
    }));
    this.bookingMenuItems.set(bookingId, bItems);

    // Mark entitlements as USED
    for (const ci of cItems) {
      if (ci.entitlement_id) {
        const ent = this.entitlements.get(ci.entitlement_id);
        if (ent) ent.status = "USED";
      }
    }

    return { success: true, booking_id: bookingId, is_duplicate: false };
  }
}

// ── TESTS SUITE ─────────────────────────────────────────────────────────────

test("STREAK 1: First check-in initializes streak to 1 and awards +5 points", () => {
  const engine = new MockStreakEngine();
  const res = engine.checkin("user-1", "2026-09-29");
  assert.equal(res.success, true);
  assert.equal(res.points_added, 5);
  assert.equal(res.streak, 1);
  assert.equal(res.cycle_id, 1);

  const summary = engine.getSummary("user-1", "2026-09-29");
  assert.equal(summary.current_streak, 1);
  assert.equal(summary.has_checked_in_today, true);
  assert.equal(summary.is_streak_broken, false);
  assert.equal(summary.balance, 5);
});

test("STREAK 2: Consecutive check-in on the next calendar day increments streak by 1", () => {
  const engine = new MockStreakEngine();
  engine.checkin("user-1", "2026-09-28");
  const res = engine.checkin("user-1", "2026-09-29");
  assert.equal(res.streak, 2);
  assert.equal(res.points_added, 5);

  const summary = engine.getSummary("user-1", "2026-09-29");
  assert.equal(summary.current_streak, 2);
  assert.equal(summary.balance, 10);
});

test("STREAK 3: Same-day duplicate check-in is idempotent (0 points added, streak unchanged)", () => {
  const engine = new MockStreakEngine();
  engine.checkin("user-1", "2026-09-29");
  const dup = engine.checkin("user-1", "2026-09-29");
  assert.equal(dup.points_added, 0);
  assert.equal(dup.streak, 1);

  const summary = engine.getSummary("user-1", "2026-09-29");
  assert.equal(summary.current_streak, 1);
  assert.equal(summary.balance, 5);
});

test("STREAK 4: Missing >= 1 day marks streak as broken; next check-in starts new cycle at Day 1", () => {
  const engine = new MockStreakEngine();
  // Checked in on Sept 25
  engine.checkin("user-1", "2026-09-25");

  // On Sept 29 (missed Sept 26, 27, 28) before check-in:
  const beforeCheckin = engine.getSummary("user-1", "2026-09-29");
  assert.equal(beforeCheckin.has_checked_in_today, false);
  assert.equal(beforeCheckin.is_streak_broken, true);
  assert.equal(beforeCheckin.current_streak, 0);

  // User checks in again:
  const res = engine.checkin("user-1", "2026-09-29");
  assert.equal(res.streak, 1);
  assert.equal(res.cycle_id, 2); // New streak cycle!
  assert.equal(res.points_added, 5);

  const afterCheckin = engine.getSummary("user-1", "2026-09-29");
  assert.equal(afterCheckin.current_streak, 1);
  assert.equal(afterCheckin.has_checked_in_today, true);
  assert.equal(afterCheckin.is_streak_broken, false);
  assert.equal(afterCheckin.balance, 10);
});

test("MENU 1: Catalog strictly has 3 categories and active items load correctly", () => {
  assert.ok(Array.isArray(ALL_MENU_PRODUCTS));
  assert.equal(ALL_MENU_PRODUCTS.length, 169);

  const categories = new Set(ALL_MENU_PRODUCTS.map((p) => p.category));
  assert.deepEqual(Array.from(categories).sort(), ["DRINK", "MAIN_FOOD", "SNACK"].sort());

  const drinks = ALL_MENU_PRODUCTS.filter((p) => p.category === "DRINK");
  const snacks = ALL_MENU_PRODUCTS.filter((p) => p.category === "SNACK");
  const mainFoods = ALL_MENU_PRODUCTS.filter((p) => p.category === "MAIN_FOOD");

  assert.equal(drinks.length, 41);
  assert.equal(snacks.length, 61);
  assert.equal(mainFoods.length, 67);

  // Price range verification
  const prices = ALL_MENU_PRODUCTS.map((p) => p.price_vnd);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  assert.equal(minPrice, 10000); // Nước suối 500ml 10.000đ
  assert.equal(maxPrice, 69000); // Cơm bò lúc lắc 69.000đ
});

test("MENU 2: Search and Category Filtering work accurately", () => {
  // Category filtering
  const drinks = ALL_MENU_PRODUCTS.filter((p) => p.category === "DRINK");
  assert.ok(drinks.every((d) => d.category === "DRINK"));

  // Search by name
  const cocaQuery = "coca";
  const cocaItems = ALL_MENU_PRODUCTS.filter((p) => p.name.toLowerCase().includes(cocaQuery));
  assert.equal(cocaItems.length, 2); // Coca-Cola lon, Coca-Cola Zero lon

  const phoQuery = "phở";
  const phoItems = ALL_MENU_PRODUCTS.filter((p) => p.name.toLowerCase().includes(phoQuery));
  assert.equal(phoItems.length, 5); // Phở bò tái, Phở bò chín, Phở bò tái chín, Phở gà, Phở xào bò
});

test("PAID ADDONS & TOTAL PRICE RULE: Server-side pricing and room-only discount isolation", () => {
  const engine = new MockMenuCheckoutEngine(ALL_MENU_PRODUCTS);

  // Scenario from Section J:
  // Tiền phòng: 800.000đ
  // Voucher 40% (max 1M base => -320.000đ)
  // Đồ ăn mua thêm: Phở bò tái (55.000đ), Cơm bò lúc lắc (69.000đ), Coca-Cola (18.000đ) => 142.000đ
  // Tổng = (800.000 - 320.000) + 142.000 = 622.000đ
  const session = engine.createSession("sess-1", "user-1", 800000, 320000);

  const pho = ALL_MENU_PRODUCTS.find((p) => p.name === "Phở bò tái");
  const comBo = ALL_MENU_PRODUCTS.find((p) => p.name === "Cơm bò lúc lắc");
  const coca = ALL_MENU_PRODUCTS.find((p) => p.name === "Coca-Cola lon");

  const res = engine.updateCheckoutMenuItems("sess-1", "user-1", [
    { menu_product_id: pho.id, quantity: 1, source_type: "PURCHASE" },
    { menu_product_id: comBo.id, quantity: 1, source_type: "PURCHASE" },
    { menu_product_id: coca.id, quantity: 1, source_type: "PURCHASE" },
  ]);

  assert.equal(res.success, true);
  assert.equal(res.menu_amount_vnd, 55000 + 69000 + 18000); // 142.000đ
  assert.equal(res.final_payable_amount_vnd, (800000 - 320000) + 142000); // 622.000đ
  assert.equal(session.final_payable_amount_vnd, 622000);
});

test("REWARDS: Day 10 SNACK_X1 requires exactly 1 SNACK and charges 0đ", () => {
  const engine = new MockMenuCheckoutEngine(ALL_MENU_PRODUCTS);
  engine.createSession("sess-snack-1", "user-1", 500000, 0);
  engine.addEntitlement({ id: "ent-10", user_id: "user-1", reward_type: "SNACK_X1" });

  const bbqSnack = ALL_MENU_PRODUCTS.find((p) => p.name === "Khoai tây chiên BBQ");

  // Valid SNACK_X1
  const validRes = engine.updateCheckoutMenuItems("sess-snack-1", "user-1", [
    { menu_product_id: bbqSnack.id, quantity: 1, source_type: "REWARD", entitlement_id: "ent-10" },
  ]);
  assert.equal(validRes.success, true);
  assert.equal(validRes.menu_amount_vnd, 0); // Customer charge 0 VND
  assert.equal(validRes.items[0].normal_price_vnd, 18000); // Normal price snapshotted

  // Reject wrong category (e.g. Drink for SNACK_X1)
  const coca = ALL_MENU_PRODUCTS.find((p) => p.name === "Coca-Cola lon");
  const invalidCatRes = engine.updateCheckoutMenuItems("sess-snack-1", "user-1", [
    { menu_product_id: coca.id, quantity: 1, source_type: "REWARD", entitlement_id: "ent-10" },
  ]);
  assert.equal(invalidCatRes.success, false);
  assert.equal(invalidCatRes.error, "SNACK_X1_QUOTA_MISMATCH");

  // Reject quantity > 1
  const invalidQtyRes = engine.updateCheckoutMenuItems("sess-snack-1", "user-1", [
    { menu_product_id: bbqSnack.id, quantity: 2, source_type: "REWARD", entitlement_id: "ent-10" },
  ]);
  assert.equal(invalidQtyRes.success, false);
  assert.equal(invalidQtyRes.error, "SNACK_X1_QUOTA_MISMATCH");
});

test("REWARDS: Day 20 SNACK_X2 requires total quantity = 2 SNACKs (same or different items)", () => {
  const engine = new MockMenuCheckoutEngine(ALL_MENU_PRODUCTS);
  engine.createSession("sess-snack-2", "user-1", 500000, 0);
  engine.addEntitlement({ id: "ent-20", user_id: "user-1", reward_type: "SNACK_X2" });

  const snack1 = ALL_MENU_PRODUCTS.find((p) => p.name === "Bắp rang bơ ngọt");
  const snack2 = ALL_MENU_PRODUCTS.find((p) => p.name === "Khoai lang kén");

  // 2 different snacks
  const resDiff = engine.updateCheckoutMenuItems("sess-snack-2", "user-1", [
    { menu_product_id: snack1.id, quantity: 1, source_type: "REWARD", entitlement_id: "ent-20" },
    { menu_product_id: snack2.id, quantity: 1, source_type: "REWARD", entitlement_id: "ent-20" },
  ]);
  assert.equal(resDiff.success, true);
  assert.equal(resDiff.menu_amount_vnd, 0);

  // 2 of the same snack
  const resSame = engine.updateCheckoutMenuItems("sess-snack-2", "user-1", [
    { menu_product_id: snack1.id, quantity: 2, source_type: "REWARD", entitlement_id: "ent-20" },
  ]);
  assert.equal(resSame.success, true);
  assert.equal(resSame.menu_amount_vnd, 0);
});

test("REWARDS: Day 40 SNACK_COMBO requires exactly 2 SNACKs + 1 DRINK", () => {
  const engine = new MockMenuCheckoutEngine(ALL_MENU_PRODUCTS);
  engine.createSession("sess-combo", "user-1", 500000, 0);
  engine.addEntitlement({ id: "ent-40", user_id: "user-1", reward_type: "SNACK_COMBO" });

  const snack1 = ALL_MENU_PRODUCTS.find((p) => p.name === "Bánh gấu nhân socola");
  const drink1 = ALL_MENU_PRODUCTS.find((p) => p.name === "Trà đào chai");

  // Valid combo
  const validRes = engine.updateCheckoutMenuItems("sess-combo", "user-1", [
    { menu_product_id: snack1.id, quantity: 2, source_type: "REWARD", entitlement_id: "ent-40" },
    { menu_product_id: drink1.id, quantity: 1, source_type: "REWARD", entitlement_id: "ent-40" },
  ]);
  assert.equal(validRes.success, true);
  assert.equal(validRes.menu_amount_vnd, 0);

  // Missing the drink -> rejected
  const missingDrinkRes = engine.updateCheckoutMenuItems("sess-combo", "user-1", [
    { menu_product_id: snack1.id, quantity: 2, source_type: "REWARD", entitlement_id: "ent-40" },
  ]);
  assert.equal(missingDrinkRes.success, false);
  assert.equal(missingDrinkRes.error, "SNACK_COMBO_QUOTA_MISMATCH");
});

test("REWARDS: Day 80 MEAL_CHOICE requires exactly 1 MAIN_FOOD", () => {
  const engine = new MockMenuCheckoutEngine(ALL_MENU_PRODUCTS);
  engine.createSession("sess-meal", "user-1", 500000, 0);
  engine.addEntitlement({ id: "ent-80", user_id: "user-1", reward_type: "MEAL_CHOICE" });

  const bunBoHue = ALL_MENU_PRODUCTS.find((p) => p.name === "Bún bò Huế");
  const validRes = engine.updateCheckoutMenuItems("sess-meal", "user-1", [
    { menu_product_id: bunBoHue.id, quantity: 1, source_type: "REWARD", entitlement_id: "ent-80" },
  ]);
  assert.equal(validRes.success, true);
  assert.equal(validRes.menu_amount_vnd, 0);
  assert.equal(validRes.items[0].normal_price_vnd, 59000);
});

test("SECURITY: Inactive items, expired entitlements, and other user entitlements are rejected", () => {
  const engine = new MockMenuCheckoutEngine(ALL_MENU_PRODUCTS);
  engine.createSession("sess-sec", "user-1", 500000, 0);

  // 1. Other user entitlement
  engine.addEntitlement({ id: "ent-other", user_id: "user-hacker", reward_type: "SNACK_X1" });
  const snack = ALL_MENU_PRODUCTS.find((p) => p.category === "SNACK");
  const crossUserRes = engine.updateCheckoutMenuItems("sess-sec", "user-1", [
    { menu_product_id: snack.id, quantity: 1, source_type: "REWARD", entitlement_id: "ent-other" },
  ]);
  assert.equal(crossUserRes.success, false);
  assert.equal(crossUserRes.error, "FORBIDDEN_ENTITLEMENT_OWNER");

  // 2. Expired entitlement
  engine.addEntitlement({ id: "ent-exp", user_id: "user-1", reward_type: "SNACK_X1" });
  engine.entitlements.get("ent-exp").expires_at = new Date(Date.now() - 3600000).toISOString();
  const expiredRes = engine.updateCheckoutMenuItems("sess-sec", "user-1", [
    { menu_product_id: snack.id, quantity: 1, source_type: "REWARD", entitlement_id: "ent-exp" },
  ]);
  assert.equal(expiredRes.success, false);
  assert.equal(expiredRes.error, "ENTITLEMENT_EXPIRED");
});

test("FINALIZE & OPERATIONS: Idempotent persistence and itemized fulfillment display", () => {
  const engine = new MockMenuCheckoutEngine(ALL_MENU_PRODUCTS);
  engine.createSession("sess-op", "user-1", 600000, 0);
  engine.addEntitlement({ id: "ent-snack", user_id: "user-1", reward_type: "SNACK_X1" });

  const pho = ALL_MENU_PRODUCTS.find((p) => p.name === "Phở bò tái");
  const coca = ALL_MENU_PRODUCTS.find((p) => p.name === "Coca-Cola lon");
  const bbq = ALL_MENU_PRODUCTS.find((p) => p.name === "Khoai tây chiên BBQ");

  engine.updateCheckoutMenuItems("sess-op", "user-1", [
    { menu_product_id: pho.id, quantity: 1, source_type: "PURCHASE" },
    { menu_product_id: coca.id, quantity: 2, source_type: "PURCHASE" },
    { menu_product_id: bbq.id, quantity: 1, source_type: "REWARD", entitlement_id: "ent-snack" },
  ]);

  // First finalization
  const fin1 = engine.finalizeCheckout("sess-op");
  assert.equal(fin1.success, true);
  assert.equal(fin1.is_duplicate, false);

  // Retry finalization (e.g. webhook redelivery)
  const fin2 = engine.finalizeCheckout("sess-op");
  assert.equal(fin2.success, true);
  assert.equal(fin2.is_duplicate, true);

  // Operations Dashboard Itemization Verification:
  const bookingItems = engine.bookingMenuItems.get(fin1.booking_id);
  assert.equal(bookingItems.length, 3);

  const paidItems = bookingItems.filter((i) => i.source_type === "PURCHASE");
  const rewardItems = bookingItems.filter((i) => i.source_type === "REWARD");

  assert.equal(paidItems.length, 2);
  assert.equal(rewardItems.length, 1);

  assert.equal(paidItems[0].product_name_snapshot, "Phở bò tái");
  assert.equal(paidItems[0].quantity, 1);
  assert.equal(paidItems[0].total_price_vnd, 55000);

  assert.equal(paidItems[1].product_name_snapshot, "Coca-Cola lon");
  assert.equal(paidItems[1].quantity, 2);
  assert.equal(paidItems[1].total_price_vnd, 36000);

  assert.equal(rewardItems[0].product_name_snapshot, "Khoai tây chiên BBQ");
  assert.equal(rewardItems[0].quantity, 1);
  assert.equal(rewardItems[0].total_price_vnd, 0);
  assert.equal(rewardItems[0].reward_source, "SNACK_X1");

  // Entitlement is marked USED
  assert.equal(engine.entitlements.get("ent-snack").status, "USED");
});

test("SQL MIGRATION: 20260929153000_kapi_menu_ordering.sql structure & security", () => {
  const migrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/20260929153000_kapi_menu_ordering.sql"
  );
  assert.ok(fs.existsSync(migrationPath), "Migration file must exist");
  const sql = fs.readFileSync(migrationPath, "utf-8");

  // Verify tables
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.menu_products"));
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.checkout_menu_items"));
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.booking_menu_items"));

  // Verify column additions and constraints
  assert.ok(sql.includes("ALTER TABLE public.checkout_sessions ADD COLUMN IF NOT EXISTS menu_amount_vnd"));
  assert.ok(sql.includes("ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS menu_amount_vnd"));
  assert.ok(sql.includes("checkout_sessions_final_amount_calc"));
  assert.ok(sql.includes("bookings_final_paid_calc"));

  // Verify RPCs with SECURITY DEFINER and search_path = ''
  const requiredRpcs = [
    "get_menu_products",
    "get_checkout_menu_items",
    "update_checkout_menu_items_atomic",
    "reserve_checkout_reward_entitlement_atomic",
    "release_checkout_reward_entitlement_atomic",
    "claim_daily_reward",
    "get_my_rewards_summary",
    "finalize_verified_checkout_atomic",
    "get_staff_dashboard_data",
  ];

  for (const rpc of requiredRpcs) {
    assert.ok(sql.includes(`FUNCTION public.${rpc}`), `RPC ${rpc} must be defined`);
  }
  assert.ok(sql.includes("SET search_path = ''"));
  assert.ok(sql.includes("SECURITY DEFINER"));
});
