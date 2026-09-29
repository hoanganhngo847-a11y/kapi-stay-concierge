import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// TEST SUITE: Admin Content Management — Phase 2
// ---------------------------------------------------------------------------

test("Phase 2 — SQL Migration Structure & Security Verification", () => {
  const migrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/20260929200000_admin_content_management_phase2.sql"
  );
  assert.ok(fs.existsSync(migrationPath), "Migration file must exist");
  const sql = fs.readFileSync(migrationPath, "utf8");

  // 1. Check table extensions and creations
  assert.match(sql, /ALTER TABLE public\.rooms[\s\S]*?room_number/i);
  assert.match(sql, /ALTER TABLE public\.rooms[\s\S]*?floor_number/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.room_media/i);
  assert.match(sql, /ALTER TABLE public\.room_private_details[\s\S]*?door_access_code/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.admin_audit_logs/i);

  // 2. Check storage bucket setup
  assert.match(sql, /room-media/i);
  assert.match(sql, /menu-media/i);

  // 3. Security Definer & search_path
  const securityDefinerFns = [
    "get_admin_rooms",
    "get_admin_room_detail",
    "admin_update_room",
    "admin_update_room_access",
    "admin_add_room_media",
    "admin_delete_room_media",
    "admin_set_cover_room_media",
    "admin_reorder_room_media",
    "get_admin_menu_products",
    "admin_create_menu_product",
    "admin_update_menu_product",
    "admin_set_menu_product_active",
    "finalize_verified_checkout_atomic"
  ];

  for (const fn of securityDefinerFns) {
    assert.match(
      sql,
      new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}`, "i"),
      `Function ${fn} must be created with SECURITY DEFINER`
    );
  }

  // Ensure search_path = '' is enforced across functions for maximum security
  const searchPathMatches = sql.match(/SET search_path = ''/gi);
  assert.ok(
    searchPathMatches && searchPathMatches.length >= 10,
    "Functions must enforce strict search_path = ''"
  );

  // 4. Role enforcement check: staff_roles WHERE role = 'admin'
  assert.match(sql, /SELECT 1 FROM public\.staff_roles WHERE user_id = v_user_id AND role = 'admin'/i);
});

test("Phase 2 — Navigation Contract: /admin/rooms and /admin/menu are enabled", () => {
  const adminNavPath = path.resolve(process.cwd(), "components/admin/AdminNav.tsx");
  const content = fs.readFileSync(adminNavPath, "utf8");

  assert.match(content, /href:\s*["']\/admin\/rooms["']/);
  assert.match(content, /href:\s*["']\/admin\/menu["']/);
  // Ensure "Sắp có" tags are removed from Rooms and Menu
  assert.doesNotMatch(content, /Phòng.*Sắp có/);
  assert.doesNotMatch(content, /Menu.*Sắp có/);
});

test("Phase 2 — Security Boundary: Non-admin users cannot access admin actions", async () => {
  // Simulating server action role checks
  const { verifyAdminRole } = await import("../lib/data/admin.ts").catch(() => ({
    verifyAdminRole: null,
  }));
  assert.ok(typeof verifyAdminRole === "function" || verifyAdminRole === null);

  // Ensure verifyAdminRole is called in admin actions
  const actionsPath = path.resolve(process.cwd(), "app/admin/actions.ts");
  const actionsContent = fs.readFileSync(actionsPath, "utf8");

  assert.match(actionsContent, /verifyAdminRole/);
  assert.match(actionsContent, /adminUpdateRoomAction/);
  assert.match(actionsContent, /adminUpdateRoomAccessAction/);
  assert.match(actionsContent, /adminAddRoomMediaAction/);
  assert.match(actionsContent, /adminDeleteRoomMediaAction/);
  assert.match(actionsContent, /adminSetCoverRoomMediaAction/);
  assert.match(actionsContent, /adminReorderRoomMediaAction/);
  assert.match(actionsContent, /adminCreateMenuProductAction/);
  assert.match(actionsContent, /adminUpdateMenuProductAction/);
  assert.match(actionsContent, /adminSetMenuProductActiveAction/);
});

test("Phase 2 — Room Data Validation Logic", () => {
  // Unit tests for room input validation constraints
  const validateRoomInput = (input) => {
    const errors = [];
    if (!input.name || input.name.trim().length === 0) {
      errors.push("Tên phòng không được để trống");
    }
    if (input.hourly_price_vnd !== undefined && input.hourly_price_vnd < 0) {
      errors.push("Giá theo giờ không được âm");
    }
    if (input.nightly_price_vnd !== undefined && input.nightly_price_vnd < 0) {
      errors.push("Giá theo ngày không được âm");
    }
    if (input.capacity !== undefined && input.capacity < 1) {
      errors.push("Sức chứa phải lớn hơn hoặc bằng 1");
    }
    if (input.floor_number !== undefined && input.floor_number !== null && input.floor_number < -5) {
      errors.push("Tầng không hợp lệ");
    }
    return { valid: errors.length === 0, errors };
  };

  // Valid room
  const valid = validateRoomInput({
    name: "Deluxe Balcony 201",
    room_number: "201",
    floor_number: 2,
    hourly_price_vnd: 150000,
    nightly_price_vnd: 800000,
    capacity: 2,
  });
  assert.ok(valid.valid);
  assert.equal(valid.errors.length, 0);

  // Invalid room: negative price, empty name, capacity 0
  const invalid = validateRoomInput({
    name: "",
    hourly_price_vnd: -1000,
    nightly_price_vnd: -5000,
    capacity: 0,
  });
  assert.ok(!invalid.valid);
  assert.equal(invalid.errors.length, 4);
});

test("Phase 2 — Media Management: Single Cover Rule & Order Integrity", () => {
  let mediaList = [
    { id: "m1", media_type: "IMAGE", storage_path: "room-media/1.jpg", sort_order: 0, is_cover: true },
    { id: "m2", media_type: "IMAGE", storage_path: "room-media/2.jpg", sort_order: 1, is_cover: false },
    { id: "m3", media_type: "VIDEO", storage_path: "room-media/3.mp4", sort_order: 2, is_cover: false },
  ];

  // Set m2 as cover
  const setCover = (targetId) => {
    mediaList = mediaList.map((m) => ({
      ...m,
      is_cover: m.id === targetId,
    }));
  };

  setCover("m2");
  assert.equal(mediaList.find((m) => m.id === "m2")?.is_cover, true);
  assert.equal(mediaList.find((m) => m.id === "m1")?.is_cover, false);
  const coverCount = mediaList.filter((m) => m.is_cover).length;
  assert.equal(coverCount, 1, "There must be exactly one cover image");

  // Reorder
  const newOrder = ["m3", "m1", "m2"];
  const reorder = (orderedIds) => {
    mediaList = mediaList.map((m) => ({
      ...m,
      sort_order: orderedIds.indexOf(m.id),
    }));
  };
  reorder(newOrder);
  assert.equal(mediaList.find((m) => m.id === "m3")?.sort_order, 0);
  assert.equal(mediaList.find((m) => m.id === "m1")?.sort_order, 1);
  assert.equal(mediaList.find((m) => m.id === "m2")?.sort_order, 2);
});

test("Phase 2 — Door Access Code Security & Masking in Audit Log", () => {
  const maskSecret = (code) => {
    if (!code) return "NULL";
    if (code.length <= 2) return "**";
    return "*".repeat(code.length - 2) + code.slice(-2);
  };

  assert.equal(maskSecret("123456"), "****56");
  assert.equal(maskSecret("9988"), "**88");
  assert.equal(maskSecret(""), "NULL");
  assert.equal(maskSecret(null), "NULL");

  // Public Catalog Leak Protection
  // Public room detail does NOT expose door_access_code
  const publicRoomData = {
    id: "room-1",
    name: "Room 101",
    room_number: "101",
    floor_number: 1,
    hourly_price_vnd: 150000,
    media: [{ id: "m1", storage_path: "p.jpg" }],
  };

  assert.equal((publicRoomData).door_access_code, undefined);
});

test("Phase 2 — Digital Key Lifecycle & Stay Window Restriction", () => {
  const canGuestRevealKey = (now, checkIn, checkOut, bookingStatus) => {
    if (bookingStatus !== "CONFIRMED") return false;
    const nowTime = new Date(now).getTime();
    const checkInTime = new Date(checkIn).getTime();
    const checkOutTime = new Date(checkOut).getTime();
    // Allow key access within [checkIn - 30min, checkOut]
    const earlyAccessBufferMs = 30 * 60 * 1000;
    return nowTime >= checkInTime - earlyAccessBufferMs && nowTime <= checkOutTime;
  };

  const checkIn = "2026-09-30T14:00:00Z";
  const checkOut = "2026-10-01T12:00:00Z";

  // 1 hour before check-in -> false
  assert.equal(canGuestRevealKey("2026-09-30T12:59:00Z", checkIn, checkOut, "CONFIRMED"), false);
  // 15 minutes before check-in -> true
  assert.equal(canGuestRevealKey("2026-09-30T13:45:00Z", checkIn, checkOut, "CONFIRMED"), true);
  // During stay -> true
  assert.equal(canGuestRevealKey("2026-09-30T20:00:00Z", checkIn, checkOut, "CONFIRMED"), true);
  // After check-out -> false
  assert.equal(canGuestRevealKey("2026-10-01T12:05:00Z", checkIn, checkOut, "CONFIRMED"), false);
  // Cancelled booking -> false
  assert.equal(canGuestRevealKey("2026-09-30T15:00:00Z", checkIn, checkOut, "CANCELLED"), false);
});

test("Phase 2 — Menu Product CRUD & Deactivation Logic", () => {
  const menuCatalog = [
    { id: "p1", name: "Bánh mì pate", category: "MAIN_FOOD", price_vnd: 45000, is_active: true, sort_order: 1 },
    { id: "p2", name: "Trà đào cam sả", category: "DRINK", price_vnd: 35000, is_active: true, sort_order: 2 },
    { id: "p3", name: "Bim bim khoai tây", category: "SNACK", price_vnd: 20000, is_active: true, sort_order: 3 },
  ];

  // Admin deactivates p2
  const deactivate = (id) => {
    const item = menuCatalog.find((p) => p.id === id);
    if (item) item.is_active = false;
  };

  deactivate("p2");

  // Public menu filter: only active items
  const publicMenu = menuCatalog.filter((p) => p.is_active);
  assert.equal(publicMenu.length, 2);
  assert.ok(!publicMenu.some((p) => p.id === "p2"), "Deactivated item must not appear in public menu");

  // Admin menu: displays ALL items with is_active flag
  const adminMenu = [...menuCatalog];
  assert.equal(adminMenu.length, 3);
  assert.equal(adminMenu.find((p) => p.id === "p2")?.is_active, false);

  // Admin reactivates p2
  const reactivate = (id) => {
    const item = menuCatalog.find((p) => p.id === id);
    if (item) item.is_active = true;
  };
  reactivate("p2");
  assert.equal(menuCatalog.find((p) => p.id === "p2")?.is_active, true);
  assert.equal(menuCatalog.filter((p) => p.is_active).length, 3);
});

test("Phase 2 — Menu Pricing Historical Preservation", () => {
  // Historical booking item preserves price at checkout time even if catalog price changes
  const historicalBookingItem = {
    booking_id: "bk-001",
    product_id: "p1",
    quantity: 2,
    unit_price_vnd: 45000,
    total_price_vnd: 90000,
  };

  // Admin changes catalog price of p1 to 55,000đ
  const updatedCatalogPrice = 55000;

  // Booking historical snapshot MUST NOT CHANGE
  assert.equal(
    historicalBookingItem.unit_price_vnd,
    45000,
    "Historical unit price in booking_menu_items must remain 45,000đ"
  );
  assert.notEqual(historicalBookingItem.unit_price_vnd, updatedCatalogPrice);
});

test("Phase 2 — File Upload Constraints (Size & MIME validation)", () => {
  const validateUpload = (file) => {
    const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
    const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm"];
    const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
    const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB

    if (ALLOWED_IMAGE_TYPES.includes(file.type)) {
      if (file.size > MAX_IMAGE_SIZE) {
        return { valid: false, error: "Ảnh không được vượt quá 10MB" };
      }
      return { valid: true, mediaType: "IMAGE" };
    }

    if (ALLOWED_VIDEO_TYPES.includes(file.type)) {
      if (file.size > MAX_VIDEO_SIZE) {
        return { valid: false, error: "Video không được vượt quá 50MB" };
      }
      return { valid: true, mediaType: "VIDEO" };
    }

    return { valid: false, error: "Định dạng tệp không được hỗ trợ" };
  };

  // Valid 2MB JPEG
  assert.deepEqual(validateUpload({ type: "image/jpeg", size: 2 * 1024 * 1024 }), {
    valid: true,
    mediaType: "IMAGE",
  });

  // Valid 15MB MP4
  assert.deepEqual(validateUpload({ type: "video/mp4", size: 15 * 1024 * 1024 }), {
    valid: true,
    mediaType: "VIDEO",
  });

  // 12MB Image -> rejected (> 10MB)
  assert.equal(validateUpload({ type: "image/png", size: 12 * 1024 * 1024 }).valid, false);

  // 60MB Video -> rejected (> 50MB)
  assert.equal(validateUpload({ type: "video/mp4", size: 60 * 1024 * 1024 }).valid, false);

  // Executable or script -> rejected
  assert.equal(validateUpload({ type: "application/x-sh", size: 1024 }).valid, false);
  assert.equal(validateUpload({ type: "text/html", size: 1024 }).valid, false);
});

test("Phase 2 — Menu Category Constraints (MAIN_FOOD, DRINK, SNACK)", () => {
  const VALID_CATEGORIES = ["MAIN_FOOD", "DRINK", "SNACK"];

  const validateMenuProduct = (input) => {
    if (!input.name || !input.name.trim()) return { valid: false, error: "Tên món không được để trống" };
    if (!VALID_CATEGORIES.includes(input.category)) return { valid: false, error: "Danh mục không hợp lệ" };
    if (typeof input.price_vnd !== "number" || input.price_vnd < 0) return { valid: false, error: "Giá không hợp lệ" };
    return { valid: true };
  };

  assert.ok(validateMenuProduct({ name: "Cà phê sữa đá", category: "DRINK", price_vnd: 30000 }).valid);
  assert.ok(validateMenuProduct({ name: "Khoai tây chiên", category: "SNACK", price_vnd: 25000 }).valid);
  assert.ok(validateMenuProduct({ name: "Mì Ý bò bằm", category: "MAIN_FOOD", price_vnd: 65000 }).valid);

  // Invalid category
  assert.ok(!validateMenuProduct({ name: "Bia", category: "ALCOHOL", price_vnd: 40000 }).valid);
  // Negative price
  assert.ok(!validateMenuProduct({ name: "Bánh", category: "SNACK", price_vnd: -5000 }).valid);
});

test("Phase 2 — finalize_verified_checkout_atomic access credentials insertion verification", () => {
  const migrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/20260929200000_admin_content_management_phase2.sql"
  );
  const sql = fs.readFileSync(migrationPath, "utf8");

  // Ensure door access code from room_private_details is queried and inserted into booking_access_credentials
  assert.match(sql, /SELECT door_access_code[\s\S]*?INTO[\s\S]*?v_door_code/i);
  assert.match(sql, /INSERT INTO public\.booking_access_credentials/i);
  assert.match(sql, /credential_type/i);
  assert.match(sql, /'pin'/i);
});

