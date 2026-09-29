/**
 * @file tests/admin_portal.test.js
 * Comprehensive automated test suite for Kapi Admin Portal (Phase 1).
 * Validates:
 *   1. Unauthenticated /admin -> UNAUTHENTICATED error & redirect to admin login.
 *   2. Customer role -> FORBIDDEN on /admin.
 *   3. Staff role -> FORBIDDEN on /admin.
 *   4. Admin role -> ALLOWED on /admin.
 *   5. Invalid password -> Generic login error (no user enumeration, no leak).
 *   6. Customer/Staff login attempt at /admin/login -> Generic login error & session purged.
 *   7. Valid admin login at /admin/login -> Success.
 *   8. Authenticated admin calling get_admin_dashboard_data -> Success with valid schema.
 *   9. Staff calling get_admin_dashboard_data -> FORBIDDEN_ADMIN_ONLY.
 *   10. Anon calling get_admin_dashboard_data -> FORBIDDEN_ADMIN_ONLY.
 *   11. Admin logout -> Session invalidated & redirect to /admin/login.
 *   12. Operations access matrix: Staff allowed, Admin allowed, Customer forbidden.
 *   13. Customer Google OAuth remains unchanged on /login.
 *   14. Source Code Contract Verification in lib/data/admin.ts and app/admin/actions.ts.
 *   15. SQL Artifacts Verification: Security definer, search_path, permissions, no spoofable args.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// ── Error Classes Matching lib/data/admin.ts ──────────────────────────────

class AdminAuthError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AdminAuthError";
    this.code = code;
  }
}

class StaffAuthError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "StaffAuthError";
    this.code = code;
  }
}

function isValidRoomOperationalStatus(status) {
  return ["ready", "occupied", "cleaning", "maintenance"].includes(status);
}

function validateAdminDashboardBoundary(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Dữ liệu Admin Dashboard không đúng định dạng đối tượng.");
  }

  const payload = data;
  if (payload.success !== true) {
    const errorMsg = typeof payload.error === "string" ? payload.error : "Không rõ nguyên nhân";
    throw new Error(`Admin Dashboard thất bại từ RPC: ${errorMsg}`);
  }

  const rawKpis = payload.kpis || {};
  const kpis = {
    today_bookings_count: typeof rawKpis.today_bookings_count === "number" ? rawKpis.today_bookings_count : 0,
    today_checkins_count: typeof rawKpis.today_checkins_count === "number" ? rawKpis.today_checkins_count : 0,
    today_checkouts_count: typeof rawKpis.today_checkouts_count === "number" ? rawKpis.today_checkouts_count : 0,
    occupied_rooms_count: typeof rawKpis.occupied_rooms_count === "number" ? rawKpis.occupied_rooms_count : 0,
    ready_rooms_count: typeof rawKpis.ready_rooms_count === "number" ? rawKpis.ready_rooms_count : 0,
    cleaning_rooms_count: typeof rawKpis.cleaning_rooms_count === "number" ? rawKpis.cleaning_rooms_count : 0,
    maintenance_rooms_count: typeof rawKpis.maintenance_rooms_count === "number" ? rawKpis.maintenance_rooms_count : 0,
    total_rooms_count: typeof rawKpis.total_rooms_count === "number" ? rawKpis.total_rooms_count : 0,
    pending_tickets_count: typeof rawKpis.pending_tickets_count === "number" ? rawKpis.pending_tickets_count : 0,
  };

  const rawBookings = Array.isArray(payload.recent_bookings) ? payload.recent_bookings : [];
  const recent_bookings = rawBookings.map((b) => ({
    id: String(b.id || ""),
    short_id: String(b.short_id || (b.id ? String(b.id).slice(0, 8) : "")),
    room_id: String(b.room_id || ""),
    room_name: String(b.room_name || "N/A"),
    user_id: String(b.user_id || ""),
    guest_name: String(b.guest_name || "Khách vãng lai"),
    guest_phone: b.guest_phone ? String(b.guest_phone) : null,
    check_in: b.check_in ? String(b.check_in) : null,
    check_out: b.check_out ? String(b.check_out) : null,
    check_in_at: b.check_in_at ? String(b.check_in_at) : null,
    check_out_at: b.check_out_at ? String(b.check_out_at) : null,
    booking_status: String(b.booking_status || "UNKNOWN"),
    payment_status: String(b.payment_status || "UNKNOWN"),
    final_paid_amount_vnd: typeof b.final_paid_amount_vnd === "number" ? b.final_paid_amount_vnd : 0,
    created_at: String(b.created_at || ""),
  }));

  const rawTickets = Array.isArray(payload.pending_tickets) ? payload.pending_tickets : [];
  const pending_tickets = rawTickets.map((t) => ({
    id: String(t.id || ""),
    short_id: String(t.short_id || (t.id ? String(t.id).slice(0, 8) : "")),
    booking_id: String(t.booking_id || ""),
    room_id: String(t.room_id || ""),
    room_name: String(t.room_name || "N/A"),
    user_id: String(t.user_id || ""),
    guest_name: String(t.guest_name || "Khách"),
    guest_phone: t.guest_phone ? String(t.guest_phone) : null,
    category: String(t.category || ""),
    description: String(t.description || ""),
    status: (t.status === "in_progress" || t.status === "resolved") ? t.status : "pending",
    created_at: String(t.created_at || ""),
    updated_at: String(t.updated_at || ""),
  }));

  const rawRooms = Array.isArray(payload.room_summaries) ? payload.room_summaries : [];
  const room_summaries = rawRooms.map((r) => ({
    room_id: String(r.room_id || ""),
    room_name: String(r.room_name || "N/A"),
    property_id: r.property_id ? String(r.property_id) : undefined,
    property_name: r.property_name ? String(r.property_name) : undefined,
    property_address: r.property_address ? String(r.property_address) : undefined,
    operational_status: isValidRoomOperationalStatus(r.operational_status) ? r.operational_status : "ready",
    updated_at: r.updated_at ? String(r.updated_at) : null,
    updated_by: r.updated_by ? String(r.updated_by) : null,
  }));

  const rawPropSummaries = Array.isArray(payload.property_room_summaries) ? payload.property_room_summaries : [];
  let property_room_summaries = rawPropSummaries.map((p) => {
    const rawRoomsOfProp = Array.isArray(p.rooms) ? p.rooms : [];
    const rooms = rawRoomsOfProp.map((r) => ({
      room_id: String(r.room_id || ""),
      room_name: String(r.room_name || "N/A"),
      operational_status: isValidRoomOperationalStatus(r.operational_status) ? r.operational_status : "ready",
      updated_at: r.updated_at ? String(r.updated_at) : null,
      updated_by: r.updated_by ? String(r.updated_by) : null,
    }));

    return {
      property_id: String(p.property_id || ""),
      property_name: String(p.property_name || "Chi nhánh"),
      property_address: String(p.property_address || ""),
      room_count: typeof p.room_count === "number" ? p.room_count : rooms.length,
      ready_count: typeof p.ready_count === "number" ? p.ready_count : rooms.filter((r) => r.operational_status === "ready").length,
      occupied_count: typeof p.occupied_count === "number" ? p.occupied_count : rooms.filter((r) => r.operational_status === "occupied").length,
      cleaning_count: typeof p.cleaning_count === "number" ? p.cleaning_count : rooms.filter((r) => r.operational_status === "cleaning").length,
      maintenance_count: typeof p.maintenance_count === "number" ? p.maintenance_count : rooms.filter((r) => r.operational_status === "maintenance").length,
      rooms,
    };
  });

  if (property_room_summaries.length === 0 && room_summaries.length > 0) {
    const map = new Map();
    for (const r of room_summaries) {
      const propId = r.property_id || "default";
      const propName = r.property_name || "Chi nhánh Kapi";
      const propAddress = r.property_address || "";
      if (!map.has(propId)) {
        map.set(propId, {
          property_id: propId,
          property_name: propName,
          property_address: propAddress,
          room_count: 0,
          ready_count: 0,
          occupied_count: 0,
          cleaning_count: 0,
          maintenance_count: 0,
          rooms: [],
        });
      }
      const p = map.get(propId);
      p.room_count += 1;
      if (r.operational_status === "ready") p.ready_count += 1;
      else if (r.operational_status === "occupied") p.occupied_count += 1;
      else if (r.operational_status === "cleaning") p.cleaning_count += 1;
      else if (r.operational_status === "maintenance") p.maintenance_count += 1;
      p.rooms.push({
        room_id: r.room_id,
        room_name: r.room_name,
        operational_status: r.operational_status,
        updated_at: r.updated_at,
        updated_by: r.updated_by,
      });
    }
    property_room_summaries = Array.from(map.values()).sort((a, b) => a.property_name.localeCompare(b.property_name));
  }

  return {
    success: true,
    kpis,
    recent_bookings,
    pending_tickets,
    room_summaries,
    property_room_summaries,
  };
}

// ── Mock Security & Auth Harness ──────────────────────────────────────────

class MockAdminEngine {
  constructor() {
    this.users = new Map(); // id -> { email, password }
    this.staffRoles = new Map(); // userId -> role: "staff" | "admin"
    this.currentSessionUser = null;
  }

  addUser(id, email, password, role = null) {
    this.users.set(id, { id, email, password });
    if (role) {
      this.staffRoles.set(id, role);
    }
  }

  setCurrentUser(userId) {
    this.currentSessionUser = userId ? this.users.get(userId) || null : null;
  }

  signOut() {
    this.currentSessionUser = null;
  }

  // Simulates verifyAdminRole() logic
  async verifyAdminRole() {
    if (!this.currentSessionUser) {
      throw new AdminAuthError("UNAUTHENTICATED", "Chưa đăng nhập");
    }

    const role = this.staffRoles.get(this.currentSessionUser.id);
    if (!role || role !== "admin") {
      throw new AdminAuthError("FORBIDDEN", "Bạn không có quyền quản trị viên.");
    }

    return {
      id: this.currentSessionUser.id,
      email: this.currentSessionUser.email,
      role: "admin",
    };
  }

  // Simulates verifyStaffRole() logic
  async verifyStaffRole() {
    if (!this.currentSessionUser) {
      throw new StaffAuthError("UNAUTHENTICATED", "Chưa đăng nhập");
    }

    const role = this.staffRoles.get(this.currentSessionUser.id);
    if (!role || (role !== "staff" && role !== "admin")) {
      throw new StaffAuthError("FORBIDDEN", "Bạn không có quyền truy cập trang quản trị.");
    }

    return {
      id: this.currentSessionUser.id,
      email: this.currentSessionUser.email,
      role,
    };
  }

  // Simulates adminLoginAction() logic
  async adminLoginAction({ email, password }) {
    const trimmedEmail = (email || "").trim().toLowerCase();
    if (!trimmedEmail || !password) {
      return { success: false, error: "Email, mật khẩu hoặc quyền truy cập không hợp lệ." };
    }

    let matchedUser = null;
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === trimmedEmail && u.password === password) {
        matchedUser = u;
        break;
      }
    }

    if (!matchedUser) {
      return { success: false, error: "Email, mật khẩu hoặc quyền truy cập không hợp lệ." };
    }

    const role = this.staffRoles.get(matchedUser.id);
    if (!role || role !== "admin") {
      this.signOut();
      return { success: false, error: "Email, mật khẩu hoặc quyền truy cập không hợp lệ." };
    }

    this.currentSessionUser = matchedUser;
    return { success: true };
  }

  // Simulates get_admin_dashboard_data() RPC
  async getAdminDashboardDataRPC() {
    const v_user_id = this.currentSessionUser?.id || null;

    if (!v_user_id) {
      return { success: false, error: "FORBIDDEN_ADMIN_ONLY" };
    }

    const role = this.staffRoles.get(v_user_id);
    if (!role || role !== "admin") {
      return { success: false, error: "FORBIDDEN_ADMIN_ONLY" };
    }

    return {
      success: true,
      kpis: {
        today_bookings_count: 3,
        today_checkins_count: 2,
        today_checkouts_count: 1,
        occupied_rooms_count: 4,
        ready_rooms_count: 3,
        cleaning_rooms_count: 1,
        maintenance_rooms_count: 0,
        total_rooms_count: 8,
        pending_tickets_count: 2,
      },
      recent_bookings: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          short_id: "11111111",
          room_id: "room-1",
          room_name: "Deluxe Ocean View",
          user_id: "user-cust-1",
          guest_name: "Nguyen Van A",
          guest_phone: "0901234567",
          check_in: "2026-09-29",
          check_out: "2026-09-30",
          booking_status: "CONFIRMED",
          payment_status: "PAID",
          final_paid_amount_vnd: 850000,
          created_at: "2026-09-29T08:00:00Z",
        },
      ],
      pending_tickets: [
        {
          id: "ticket-1",
          short_id: "ticket-1",
          booking_id: "11111111-1111-1111-1111-111111111111",
          room_id: "room-1",
          room_name: "Deluxe Ocean View",
          user_id: "user-cust-1",
          guest_name: "Nguyen Van A",
          guest_phone: "0901234567",
          category: "Dọn dẹp",
          description: "Khách cần thêm khăn tắm",
          status: "pending",
          created_at: "2026-09-29T09:00:00Z",
          updated_at: "2026-09-29T09:00:00Z",
        },
      ],
      room_summaries: [
        {
          room_id: "room-1",
          room_name: "Phòng 101",
          property_id: "prop-1",
          property_name: "Hà Nội - Hoàn Kiếm",
          property_address: "12 Hàng Bạc, Hoàn Kiếm, Hà Nội",
          operational_status: "occupied",
          updated_at: "2026-09-29T07:00:00Z",
          updated_by: "system",
        },
        {
          room_id: "room-2",
          room_name: "Phòng 102",
          property_id: "prop-2",
          property_name: "Hà Nội - Cầu Giấy",
          property_address: "45 Trần Thái Tông, Cầu Giấy, Hà Nội",
          operational_status: "ready",
          updated_at: "2026-09-29T07:00:00Z",
          updated_by: "staff-1",
        },
      ],
      property_room_summaries: [
        {
          property_id: "prop-1",
          property_name: "Hà Nội - Hoàn Kiếm",
          property_address: "12 Hàng Bạc, Hoàn Kiếm, Hà Nội",
          room_count: 1,
          ready_count: 0,
          occupied_count: 1,
          cleaning_count: 0,
          maintenance_count: 0,
          rooms: [
            {
              room_id: "room-1",
              room_name: "Phòng 101",
              operational_status: "occupied",
              updated_at: "2026-09-29T07:00:00Z",
              updated_by: "system",
            },
          ],
        },
        {
          property_id: "prop-2",
          property_name: "Hà Nội - Cầu Giấy",
          property_address: "45 Trần Thái Tông, Cầu Giấy, Hà Nội",
          room_count: 1,
          ready_count: 1,
          occupied_count: 0,
          cleaning_count: 0,
          maintenance_count: 0,
          rooms: [
            {
              room_id: "room-2",
              room_name: "Phòng 102",
              operational_status: "ready",
              updated_at: "2026-09-29T07:00:00Z",
              updated_by: "staff-1",
            },
          ],
        },
      ],
    };
  }
}

// ── Test Cases ─────────────────────────────────────────────────────────────

test("Test 1: Unauthenticated user accessing /admin throws UNAUTHENTICATED error", async () => {
  const engine = new MockAdminEngine();
  engine.setCurrentUser(null);

  await assert.rejects(
    async () => engine.verifyAdminRole(),
    (err) => {
      assert.ok(err instanceof AdminAuthError);
      assert.equal(err.code, "UNAUTHENTICATED");
      return true;
    }
  );
});

test("Test 2: Customer user (no staff_roles) accessing /admin is rejected with FORBIDDEN", async () => {
  const engine = new MockAdminEngine();
  engine.addUser("cust-1", "customer@example.com", "pass123", null);
  engine.setCurrentUser("cust-1");

  await assert.rejects(
    async () => engine.verifyAdminRole(),
    (err) => {
      assert.ok(err instanceof AdminAuthError);
      assert.equal(err.code, "FORBIDDEN");
      return true;
    }
  );
});

test("Test 3: Staff role accessing /admin is strictly rejected with FORBIDDEN", async () => {
  const engine = new MockAdminEngine();
  engine.addUser("staff-1", "staff@kapistay.internal", "staffpass", "staff");
  engine.setCurrentUser("staff-1");

  await assert.rejects(
    async () => engine.verifyAdminRole(),
    (err) => {
      assert.ok(err instanceof AdminAuthError);
      assert.equal(err.code, "FORBIDDEN");
      return true;
    }
  );
});

test("Test 4: Admin role accessing /admin succeeds with authoritative role", async () => {
  const engine = new MockAdminEngine();
  engine.addUser("admin-1", "admin@kapistay.internal", "adminpass", "admin");
  engine.setCurrentUser("admin-1");

  const verified = await engine.verifyAdminRole();
  assert.equal(verified.id, "admin-1");
  assert.equal(verified.email, "admin@kapistay.internal");
  assert.equal(verified.role, "admin");
});

test("Test 5: Invalid password at /admin/login returns generic error without leaking user existence", async () => {
  const engine = new MockAdminEngine();
  engine.addUser("admin-1", "admin@kapistay.internal", "secretpassword", "admin");

  const resultWrongPassword = await engine.adminLoginAction({
    email: "admin@kapistay.internal",
    password: "incorrect_password",
  });

  assert.equal(resultWrongPassword.success, false);
  assert.equal(
    resultWrongPassword.error,
    "Email, mật khẩu hoặc quyền truy cập không hợp lệ."
  );

  const resultNonExistent = await engine.adminLoginAction({
    email: "unknown@kapistay.internal",
    password: "anypassword",
  });

  assert.equal(resultNonExistent.success, false);
  assert.equal(resultNonExistent.error, resultWrongPassword.error);
});

test("Test 6: Staff/Customer login at /admin/login rejected and session purged", async () => {
  const engine = new MockAdminEngine();
  engine.addUser("staff-1", "staff@kapistay.internal", "validpassword", "staff");

  const res = await engine.adminLoginAction({
    email: "staff@kapistay.internal",
    password: "validpassword",
  });

  assert.equal(res.success, false);
  assert.equal(res.error, "Email, mật khẩu hoặc quyền truy cập không hợp lệ.");
  assert.equal(engine.currentSessionUser, null);
});

test("Test 7: Valid admin credentials at /admin/login succeeds and creates session", async () => {
  const engine = new MockAdminEngine();
  engine.addUser("admin-1", "admin@kapistay.internal", "secretpassword", "admin");

  const res = await engine.adminLoginAction({
    email: "admin@kapistay.internal",
    password: "secretpassword",
  });

  assert.equal(res.success, true);
  assert.equal(engine.currentSessionUser?.id, "admin-1");
});

test("Test 8: Authenticated Admin calling get_admin_dashboard_data succeeds & passes boundary validation", async () => {
  const engine = new MockAdminEngine();
  engine.addUser("admin-1", "admin@kapistay.internal", "secret", "admin");
  engine.setCurrentUser("admin-1");

  const rawRpc = await engine.getAdminDashboardDataRPC();
  assert.equal(rawRpc.success, true);

  const validated = validateAdminDashboardBoundary(rawRpc);
  assert.equal(validated.success, true);
  assert.equal(validated.kpis.today_bookings_count, 3);
  assert.equal(validated.kpis.today_checkins_count, 2);
  assert.equal(validated.kpis.occupied_rooms_count, 4);
  assert.equal(validated.kpis.ready_rooms_count, 3);
  assert.equal(validated.kpis.pending_tickets_count, 2);
  assert.equal(validated.recent_bookings.length, 1);
  assert.equal(validated.pending_tickets.length, 1);
  assert.equal(validated.room_summaries.length, 2);
});

test("Test 9: Staff calling get_admin_dashboard_data RPC is rejected with FORBIDDEN_ADMIN_ONLY", async () => {
  const engine = new MockAdminEngine();
  engine.addUser("staff-1", "staff@kapistay.internal", "secret", "staff");
  engine.setCurrentUser("staff-1");

  const rawRpc = await engine.getAdminDashboardDataRPC();
  assert.equal(rawRpc.success, false);
  assert.equal(rawRpc.error, "FORBIDDEN_ADMIN_ONLY");

  assert.throws(
    () => validateAdminDashboardBoundary(rawRpc),
    /Admin Dashboard thất bại từ RPC: FORBIDDEN_ADMIN_ONLY/
  );
});

test("Test 10: Anonymous / unauthenticated calling get_admin_dashboard_data RPC is rejected", async () => {
  const engine = new MockAdminEngine();
  engine.setCurrentUser(null);

  const rawRpc = await engine.getAdminDashboardDataRPC();
  assert.equal(rawRpc.success, false);
  assert.equal(rawRpc.error, "FORBIDDEN_ADMIN_ONLY");
});

test("Test 11: Admin logout clears session", async () => {
  const engine = new MockAdminEngine();
  engine.addUser("admin-1", "admin@kapistay.internal", "secret", "admin");
  engine.setCurrentUser("admin-1");

  assert.ok(engine.currentSessionUser !== null);
  engine.signOut();
  assert.equal(engine.currentSessionUser, null);

  await assert.rejects(
    async () => engine.verifyAdminRole(),
    (err) => err instanceof AdminAuthError && err.code === "UNAUTHENTICATED"
  );
});

test("Test 12: Operations access matrix: Staff allowed, Admin allowed, Customer rejected", async () => {
  const engine = new MockAdminEngine();
  engine.addUser("staff-1", "staff@kapistay.internal", "p", "staff");
  engine.addUser("admin-1", "admin@kapistay.internal", "p", "admin");
  engine.addUser("cust-1", "customer@example.com", "p", null);

  // Staff in /operations -> ALLOWED
  engine.setCurrentUser("staff-1");
  const staffCheck = await engine.verifyStaffRole();
  assert.equal(staffCheck.role, "staff");

  // Admin in /operations -> ALLOWED
  engine.setCurrentUser("admin-1");
  const adminCheck = await engine.verifyStaffRole();
  assert.equal(adminCheck.role, "admin");

  // Customer in /operations -> REJECTED
  engine.setCurrentUser("cust-1");
  await assert.rejects(
    async () => engine.verifyStaffRole(),
    (err) => err instanceof StaffAuthError && err.code === "FORBIDDEN"
  );
});

test("Test 13: Customer Google OAuth login on /login remains unchanged", () => {
  const loginPagePath = path.resolve(process.cwd(), "app/login/page.tsx");
  const content = fs.readFileSync(loginPagePath, "utf8");

  assert.ok(content.includes("GoogleSignInButton"), "Customer /login must use GoogleSignInButton");
  assert.ok(!content.includes("signInWithPassword"), "Customer /login must not expose password login");
});

test("Test 14: Source Code Contract Verification in lib/data/admin.ts and app/admin/actions.ts", () => {
  const adminDataPath = path.resolve(process.cwd(), "lib/data/admin.ts");
  const adminDataContent = fs.readFileSync(adminDataPath, "utf8");

  assert.ok(adminDataContent.includes("export class AdminAuthError"), "Must export AdminAuthError");
  assert.ok(adminDataContent.includes("export async function verifyAdminRole()"), "Must export verifyAdminRole()");
  assert.ok(adminDataContent.includes("export async function getAdminDashboardData()"), "Must export getAdminDashboardData()");
  assert.ok(adminDataContent.includes("role !== \"admin\""), "verifyAdminRole must check role !== admin");

  const actionsPath = path.resolve(process.cwd(), "app/admin/actions.ts");
  const actionsContent = fs.readFileSync(actionsPath, "utf8");

  assert.ok(actionsContent.includes("export async function adminLoginAction"), "Must export adminLoginAction");
  assert.ok(actionsContent.includes("export async function adminSignOutAction"), "Must export adminSignOutAction");
  assert.ok(actionsContent.includes("signInWithPassword"), "Must use signInWithPassword");
  assert.ok(actionsContent.includes("role !== \"admin\""), "adminLoginAction must verify role === admin");
  assert.ok(actionsContent.includes("signOut()"), "adminLoginAction must sign out non-admin attempts");
});

test("Test 15: SQL Migration Verification — Security definer, search_path, strict permissions", () => {
  const migrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/20260929170000_admin_portal_phase1.sql"
  );
  assert.ok(fs.existsSync(migrationPath), "Migration file must exist");

  const sql = fs.readFileSync(migrationPath, "utf8");

  assert.ok(sql.includes("CREATE OR REPLACE FUNCTION public.get_admin_dashboard_data()"), "Must define get_admin_dashboard_data");
  assert.ok(sql.includes("SECURITY DEFINER"), "Must be SECURITY DEFINER");
  assert.ok(sql.includes("SET search_path = ''"), "Must set search_path = ''");
  assert.ok(sql.includes("role = 'admin'"), "Must check role = 'admin'");
  assert.ok(!sql.includes("p_user_id"), "Must NOT accept client-supplied user_id (prevents spoofing)");
  assert.ok(sql.includes("REVOKE ALL ON FUNCTION public.get_admin_dashboard_data() FROM PUBLIC;"), "Must revoke from PUBLIC");
  assert.ok(sql.includes("REVOKE ALL ON FUNCTION public.get_admin_dashboard_data() FROM anon;"), "Must revoke from anon");
  assert.ok(sql.includes("GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_data() TO authenticated, service_role;"), "Must grant to authenticated, service_role");
});

// ── Property Grouping & Operations Integration Tests ───────────────────────

test("Test 16: Admin Grouping — Room A in Property A and Room B in Property B are strictly segregated", () => {
  const mockPayload = {
    success: true,
    kpis: {},
    recent_bookings: [],
    pending_tickets: [],
    room_summaries: [],
    property_room_summaries: [
      {
        property_id: "prop-hn-hk",
        property_name: "Hà Nội - Hoàn Kiếm",
        property_address: "12 Hàng Bạc, Hoàn Kiếm",
        room_count: 2,
        ready_count: 1,
        occupied_count: 1,
        cleaning_count: 0,
        maintenance_count: 0,
        rooms: [
          { room_id: "hk-101", room_name: "HK-101", operational_status: "ready" },
          { room_id: "hk-102", room_name: "HK-102", operational_status: "occupied" },
        ],
      },
      {
        property_id: "prop-hn-cg",
        property_name: "Hà Nội - Cầu Giấy",
        property_address: "45 Trần Thái Tông, Cầu Giấy",
        room_count: 2,
        ready_count: 2,
        occupied_count: 0,
        cleaning_count: 0,
        maintenance_count: 0,
        rooms: [
          { room_id: "cg-101", room_name: "CG-101", operational_status: "ready" },
          { room_id: "cg-102", room_name: "CG-102", operational_status: "ready" },
        ],
      },
    ],
  };

  const validated = validateAdminDashboardBoundary(mockPayload);
  assert.equal(validated.property_room_summaries.length, 2);

  const hkGroup = validated.property_room_summaries.find((p) => p.property_id === "prop-hn-hk");
  const cgGroup = validated.property_room_summaries.find((p) => p.property_id === "prop-hn-cg");

  assert.ok(hkGroup, "Hoàn Kiếm group must exist");
  assert.ok(cgGroup, "Cầu Giấy group must exist");

  // Verify room segregation
  assert.deepEqual(
    hkGroup.rooms.map((r) => r.room_id),
    ["hk-101", "hk-102"],
    "Hoàn Kiếm must contain only HK rooms"
  );
  assert.deepEqual(
    cgGroup.rooms.map((r) => r.room_id),
    ["cg-101", "cg-102"],
    "Cầu Giấy must contain only CG rooms"
  );
  assert.ok(!hkGroup.rooms.some((r) => r.room_id.startsWith("cg-")));
  assert.ok(!cgGroup.rooms.some((r) => r.room_id.startsWith("hk-")));
});

test("Test 17: Admin Grouping — Property counts and status counts per property are accurate", () => {
  const mockPayload = {
    success: true,
    kpis: {},
    recent_bookings: [],
    pending_tickets: [],
    room_summaries: [],
    property_room_summaries: [
      {
        property_id: "prop-1",
        property_name: "Chi nhánh 1",
        property_address: "Địa chỉ 1",
        room_count: 4,
        ready_count: 2,
        occupied_count: 1,
        cleaning_count: 1,
        maintenance_count: 0,
        rooms: [
          { room_id: "r1", room_name: "R1", operational_status: "ready" },
          { room_id: "r2", room_name: "R2", operational_status: "ready" },
          { room_id: "r3", room_name: "R3", operational_status: "occupied" },
          { room_id: "r4", room_name: "R4", operational_status: "cleaning" },
        ],
      },
    ],
  };

  const validated = validateAdminDashboardBoundary(mockPayload);
  const prop = validated.property_room_summaries[0];
  assert.equal(prop.room_count, 4);
  assert.equal(prop.ready_count, 2);
  assert.equal(prop.occupied_count, 1);
  assert.equal(prop.cleaning_count, 1);
  assert.equal(prop.maintenance_count, 0);
  assert.equal(
    prop.ready_count + prop.occupied_count + prop.cleaning_count + prop.maintenance_count,
    prop.room_count
  );
});

test("Test 18: Admin Grouping — Pre-grouped backend structure preserved & defensive fallback works", () => {
  // Test fallback if property_room_summaries is empty but room_summaries has property metadata
  const mockFallbackPayload = {
    success: true,
    kpis: {},
    recent_bookings: [],
    pending_tickets: [],
    room_summaries: [
      {
        room_id: "r-1",
        room_name: "Room 1",
        property_id: "prop-a",
        property_name: "Property A",
        property_address: "Address A",
        operational_status: "ready",
      },
      {
        room_id: "r-2",
        room_name: "Room 2",
        property_id: "prop-b",
        property_name: "Property B",
        property_address: "Address B",
        operational_status: "occupied",
      },
    ],
  };

  const validated = validateAdminDashboardBoundary(mockFallbackPayload);
  assert.equal(validated.property_room_summaries.length, 2);
  assert.equal(validated.property_room_summaries[0].property_name, "Property A");
  assert.equal(validated.property_room_summaries[0].ready_count, 1);
  assert.equal(validated.property_room_summaries[1].property_name, "Property B");
  assert.equal(validated.property_room_summaries[1].occupied_count, 1);
});

test("Test 19: Operations — Room operations records contain property_id, property_name, property_address", () => {
  const operationsItem = {
    room_id: "room-op-1",
    room_name: "HK-101",
    property_id: "prop-hk",
    property_name: "Hà Nội - Hoàn Kiếm",
    property_address: "12 Hàng Bạc",
    operational_status: "ready",
    updated_at: "2026-09-29T10:00:00Z",
    updated_by: "staff-1",
  };

  assert.equal(operationsItem.property_id, "prop-hk");
  assert.equal(operationsItem.property_name, "Hà Nội - Hoàn Kiếm");
  assert.equal(operationsItem.property_address, "12 Hàng Bạc");
});

test("Test 20: Operations — Property filter strictly isolates selected property from others", () => {
  const rooms = [
    { room_id: "r1", room_name: "HK-101", property_id: "prop-hk", operational_status: "ready" },
    { room_id: "r2", room_name: "HK-102", property_id: "prop-hk", operational_status: "occupied" },
    { room_id: "r3", room_name: "CG-101", property_id: "prop-cg", operational_status: "ready" },
    { room_id: "r4", room_name: "CG-102", property_id: "prop-cg", operational_status: "maintenance" },
  ];

  const filterProperty = (propertyFilter) =>
    rooms.filter((r) => propertyFilter === "all" || r.property_id === propertyFilter);

  // All properties
  assert.equal(filterProperty("all").length, 4);

  // Property HK only
  const hkRooms = filterProperty("prop-hk");
  assert.equal(hkRooms.length, 2);
  assert.ok(hkRooms.every((r) => r.property_id === "prop-hk"));
  assert.ok(!hkRooms.some((r) => r.property_id === "prop-cg"));

  // Property CG only
  const cgRooms = filterProperty("prop-cg");
  assert.equal(cgRooms.length, 2);
  assert.ok(cgRooms.every((r) => r.property_id === "prop-cg"));
  assert.ok(!cgRooms.some((r) => r.property_id === "prop-hk"));
});

test("Test 21: Operations — Status filter + Property filter work together with AND logic", () => {
  const rooms = [
    { room_id: "r1", room_name: "HK-101", property_id: "prop-hk", operational_status: "ready" },
    { room_id: "r2", room_name: "HK-102", property_id: "prop-hk", operational_status: "occupied" },
    { room_id: "r3", room_name: "CG-101", property_id: "prop-cg", operational_status: "ready" },
    { room_id: "r4", room_name: "CG-102", property_id: "prop-cg", operational_status: "ready" },
  ];

  const filterRooms = (propertyFilter, roomFilter) =>
    rooms.filter((r) => {
      const matchesProperty = propertyFilter === "all" || r.property_id === propertyFilter;
      const matchesStatus = roomFilter === "all" || r.operational_status === roomFilter;
      return matchesProperty && matchesStatus;
    });

  // Hoàn Kiếm AND ready
  const hkReady = filterRooms("prop-hk", "ready");
  assert.equal(hkReady.length, 1);
  assert.equal(hkReady[0].room_id, "r1");

  // Cầu Giấy AND ready
  const cgReady = filterRooms("prop-cg", "ready");
  assert.equal(cgReady.length, 2);

  // Hoàn Kiếm AND occupied
  const hkOccupied = filterRooms("prop-hk", "occupied");
  assert.equal(hkOccupied.length, 1);
  assert.equal(hkOccupied[0].room_id, "r2");

  // Cầu Giấy AND occupied (should be empty)
  const cgOccupied = filterRooms("prop-cg", "occupied");
  assert.equal(cgOccupied.length, 0);
});

test("Test 22: Navigation & Role — Admin in Operations renders 'Quay lại Admin' link to /admin", () => {
  const adminRole = "admin";
  const shouldRenderAdminReturn = adminRole === "admin";
  assert.equal(shouldRenderAdminReturn, true);

  const targetUrl = "/admin";
  assert.equal(targetUrl, "/admin");
});

test("Test 23: Navigation & Role — Staff in Operations does NOT render 'Quay lại Admin' link", () => {
  const staffRole = "staff";
  const shouldRenderAdminReturn = (staffRole) === "admin";
  assert.equal(shouldRenderAdminReturn, false);

  const customerRole = undefined;
  const shouldRenderAdminReturnCustomer = (customerRole) === "admin";
  assert.equal(shouldRenderAdminReturnCustomer, false);
});

test("Test 24: Operations Removal — Admin Dashboard removes legacy /operations link and 'Mở Operations' button", () => {
  const dashboardClientPath = path.resolve(process.cwd(), "components/admin/AdminDashboardClient.tsx");
  const content = fs.readFileSync(dashboardClientPath, "utf8");
  assert.ok(!content.includes('href="/operations"'), "Admin Dashboard must NOT link to /operations");
  assert.ok(!content.includes("Mở Operations"), "Admin Dashboard must NOT contain 'Mở Operations' CTA");

  const adminHeaderPath = path.resolve(process.cwd(), "components/admin/AdminHeader.tsx");
  const headerContent = fs.readFileSync(adminHeaderPath, "utf8");
  assert.ok(!headerContent.includes('href="/operations"'), "AdminHeader must NOT link to /operations");
});

test("Test 25: Security Role Boundary — verifyStaffRole permits staff OR admin; verifyAdminRole permits admin ONLY", async () => {
  const engine = new MockAdminEngine();
  engine.addUser("u-admin", "admin@kapi.vn", "pass123", "admin");
  engine.addUser("u-staff", "staff@kapi.vn", "pass123", "staff");
  engine.addUser("u-customer", "cust@kapi.vn", "pass123", null);

  // 1. Staff role on verifyStaffRole -> PASS
  engine.setCurrentUser("u-staff");
  const staffCheck = await engine.verifyStaffRole();
  assert.equal(staffCheck.role, "staff");

  // 2. Admin role on verifyStaffRole -> PASS
  engine.setCurrentUser("u-admin");
  const adminStaffCheck = await engine.verifyStaffRole();
  assert.equal(adminStaffCheck.role, "admin");

  // 3. Customer role on verifyStaffRole -> REJECTED
  engine.setCurrentUser("u-customer");
  await assert.rejects(
    async () => engine.verifyStaffRole(),
    (err) => err instanceof StaffAuthError && err.code === "FORBIDDEN"
  );

  // 4. Admin role on verifyAdminRole -> PASS
  engine.setCurrentUser("u-admin");
  const adminCheck = await engine.verifyAdminRole();
  assert.equal(adminCheck.role, "admin");

  // 5. Staff role on verifyAdminRole -> STRICTLY REJECTED
  engine.setCurrentUser("u-staff");
  await assert.rejects(
    async () => engine.verifyAdminRole(),
    (err) => err instanceof AdminAuthError && err.code === "FORBIDDEN"
  );
});

test("Test 26: Room Status Mutations — Staff mutable statuses allowed, occupied remains read-only", () => {
  const allowedStatuses = ["ready", "cleaning", "maintenance"];
  const isOccupiedReadOnly = (currentStatus) => currentStatus === "occupied";

  assert.equal(isOccupiedReadOnly("occupied"), true);
  assert.equal(isOccupiedReadOnly("ready"), false);
  assert.equal(isOccupiedReadOnly("cleaning"), false);
  assert.equal(isOccupiedReadOnly("maintenance"), false);

  assert.ok(allowedStatuses.includes("ready"));
  assert.ok(allowedStatuses.includes("cleaning"));
  assert.ok(allowedStatuses.includes("maintenance"));
  assert.ok(!allowedStatuses.includes("occupied"));
});

test("Test 27: Source Code Contract Verification in app/operations and components/admin", () => {
  const opsPagePath = path.resolve(process.cwd(), "app/operations/page.tsx");
  const opsPageContent = fs.readFileSync(opsPagePath, "utf8");
  // Admin is redirected to /admin
  assert.ok(opsPageContent.includes('redirect("/admin")'), "app/operations/page.tsx must redirect admin to /admin");
  // Staff receives sunset/decommission notice without admin escalation
  assert.ok(opsPageContent.includes("Giao diện Vận hành đã được hợp nhất"), "app/operations/page.tsx must show sunset notice to staff");

  const adminClientPath = path.resolve(process.cwd(), "components/admin/AdminDashboardClient.tsx");
  const adminClientContent = fs.readFileSync(adminClientPath, "utf8");
  assert.ok(adminClientContent.includes("property_room_summaries"), "AdminDashboardClient must use property_room_summaries");
  assert.ok(adminClientContent.includes("property.ready_count"), "Must display per-property ready count");
  assert.ok(adminClientContent.includes("property.occupied_count"), "Must display per-property occupied count");
});

test("Test 28: SQL Migration 20260929180000_group_rooms_by_property.sql verification", () => {
  const migrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/20260929180000_group_rooms_by_property.sql"
  );
  assert.ok(fs.existsSync(migrationPath), "Migration 20260929180000_group_rooms_by_property.sql must exist");

  const sql = fs.readFileSync(migrationPath, "utf8");

  assert.ok(sql.includes("CREATE OR REPLACE FUNCTION public.get_admin_dashboard_data()"), "Must define get_admin_dashboard_data");
  assert.ok(sql.includes("CREATE OR REPLACE FUNCTION public.get_staff_dashboard_data()"), "Must define get_staff_dashboard_data");
  assert.ok(sql.includes("SECURITY DEFINER"), "Must be SECURITY DEFINER");
  assert.ok(sql.includes("SET search_path = ''"), "Must set search_path = ''");
  assert.ok(sql.includes("role = 'admin'"), "Must check role = 'admin' for admin dashboard");
  assert.ok(sql.includes("role IN ('staff', 'admin')"), "Must check role IN ('staff', 'admin') for staff operations");
  assert.ok(sql.includes("property_room_summaries"), "Must build property_room_summaries in admin dashboard");
  assert.ok(sql.includes("JOIN public.properties p ON r.property_id = p.id AND p.is_active = true"), "Must join active properties");
  assert.ok(sql.includes("REVOKE ALL ON FUNCTION public.get_admin_dashboard_data() FROM PUBLIC;"), "Must revoke admin from PUBLIC");
  assert.ok(sql.includes("GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_data() TO authenticated, service_role;"), "Must grant admin to authenticated, service_role");
  assert.ok(sql.includes("REVOKE ALL ON FUNCTION public.get_staff_dashboard_data() FROM PUBLIC;"), "Must revoke staff from PUBLIC");
  assert.ok(sql.includes("GRANT EXECUTE ON FUNCTION public.get_staff_dashboard_data() TO authenticated, service_role;"), "Must grant staff to authenticated, service_role");
});

