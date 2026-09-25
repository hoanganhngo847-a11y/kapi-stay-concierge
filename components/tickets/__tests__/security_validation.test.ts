import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createGuestTicketAction, type TicketSupabaseClient, type Ticket } from "../actions";
import { VALID_TICKET_CATEGORIES, isValidTicketCategory } from "../constants";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface MockConfig {
  user?: { id: string } | null;
  authError?: { message: string } | null;
  booking?: {
    id: string;
    user_id: string;
    room_id: string;
    booking_status: string;
  } | null;
  bookingError?: { message: string } | null;
  rpcData?: { success?: boolean; is_active?: boolean; [key: string]: unknown } | null;
  rpcError?: { message: string } | null;
  insertData?: Ticket | null;
  insertError?: { message: string; code?: string } | null;
  onInsert?: (payload: Record<string, unknown>) => void;
}

// Mock factory for Supabase Client
function createMockSupabase(config: MockConfig): TicketSupabaseClient {
  return {
    auth: {
      getUser: async () => ({
        data: { user: config.user ? { id: config.user.id } : null },
        error: config.authError ?? null,
      }),
    },
    from: (table: string) => {
      if (table === "bookings") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: config.booking ?? null,
                error: config.bookingError ?? null,
              }),
            }),
          }),
        };
      }
      if (table === "tickets") {
        return {
          insert: (payload: Record<string, unknown>) => {
            config.onInsert?.(payload);
            return {
              select: () => ({
                single: async () => ({
                  data: config.insertData ?? {
                    id: "ticket-uuid-1",
                    ...payload,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  },
                  error: config.insertError ?? null,
                }),
              }),
            };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
    rpc: async (fnName: string) => {
      if (fnName === "get_my_stay_credentials") {
        return {
          data: config.rpcData ?? null,
          error: config.rpcError ?? null,
        };
      }
      throw new Error(`Unexpected rpc: ${fnName}`);
    },
  } as unknown as TicketSupabaseClient;
}

test("Section D — Item 17: Category Whitelist Enforcement", () => {
  assert.equal(VALID_TICKET_CATEGORIES.length, 5);
  for (const cat of VALID_TICKET_CATEGORIES) {
    assert.equal(isValidTicketCategory(cat), true);
  }
  assert.equal(isValidTicketCategory("Arbitrary Hacker Category"), false);
  assert.equal(isValidTicketCategory(""), false);
  assert.equal(isValidTicketCategory(null), false);
  assert.equal(isValidTicketCategory(123), false);
});

test("Section D — Item 17: Arbitrary category rejects before reaching DB", async () => {
  let rpcCalled = false;
  const mockSupabase = {
    auth: { getUser: async () => ({ data: { user: { id: "u-1" } }, error: null }) },
    rpc: async () => {
      rpcCalled = true;
      return { data: null, error: null };
    },
  } as unknown as TicketSupabaseClient;

  const res = await createGuestTicketAction(
    {
      bookingId: "b-1",
      roomId: "r-1",
      category: "Injected SQL Category",
      description: "Máy lạnh bị hỏng",
    },
    mockSupabase
  );

  assert.equal(res.success, false);
  assert.equal(res.error, "Danh mục yêu cầu không hợp lệ.");
  assert.equal(rpcCalled, false);
});

test("Section D — Item 5: Unauthenticated user -> rejects with domain error", async () => {
  const mockSupabase = createMockSupabase({
    user: null,
    authError: { message: "JWT expired" },
  });

  const res = await createGuestTicketAction(
    {
      bookingId: "b-1",
      roomId: "r-1",
      category: "Khóa kẹt",
      description: "Khóa thông minh không nhận mã pin",
    },
    mockSupabase
  );

  assert.equal(res.success, false);
  assert.equal(res.error, "Vui lòng đăng nhập để gửi yêu cầu hỗ trợ.");
});

test("Section D — Item 6: Booking belonging to another user -> rejects", async () => {
  const mockSupabase = createMockSupabase({
    user: { id: "user-victim" },
    booking: {
      id: "b-1",
      user_id: "user-attacker",
      room_id: "r-1",
      booking_status: "confirmed",
    },
  });

  const res = await createGuestTicketAction(
    {
      bookingId: "b-1",
      roomId: "r-1",
      category: "Khóa kẹt",
      description: "Khóa thông minh không nhận mã pin",
    },
    mockSupabase
  );

  assert.equal(res.success, false);
  assert.equal(res.error, "Không tìm thấy thông tin đặt phòng hợp lệ.");
});

test("Section D — Item 7: Room ID mismatch -> rejects", async () => {
  const mockSupabase = createMockSupabase({
    user: { id: "user-1" },
    booking: {
      id: "b-1",
      user_id: "user-1",
      room_id: "room-actual-101",
      booking_status: "confirmed",
    },
  });

  const res = await createGuestTicketAction(
    {
      bookingId: "b-1",
      roomId: "room-spoofed-999",
      category: "Thiết bị hỏng",
      description: "Bình nóng lạnh không hoạt động",
    },
    mockSupabase
  );

  assert.equal(res.success, false);
  assert.equal(res.error, "Không tìm thấy thông tin đặt phòng hợp lệ.");
});

test("Section D — Item 8: Non-confirmed booking status -> rejects", async () => {
  const mockSupabase = createMockSupabase({
    user: { id: "user-1" },
    booking: {
      id: "b-1",
      user_id: "user-1",
      room_id: "r-1",
      booking_status: "cancelled",
    },
  });

  const res = await createGuestTicketAction(
    {
      bookingId: "b-1",
      roomId: "r-1",
      category: "Tiếng ồn",
      description: "Phòng bên cạnh ồn ào quá",
    },
    mockSupabase
  );

  assert.equal(res.success, false);
  assert.equal(res.error, "Đơn đặt phòng chưa được xác nhận hoặc đã bị hủy.");
});

test("Section D — Item 9: Outside credential window (before valid_from) -> rejects", async () => {
  const mockSupabase = createMockSupabase({
    user: { id: "user-1" },
    booking: {
      id: "b-1",
      user_id: "user-1",
      room_id: "r-1",
      booking_status: "confirmed",
    },
    rpcData: {
      success: true,
      is_active: false,
      digital_key: null,
    },
  });

  const res = await createGuestTicketAction(
    {
      bookingId: "b-1",
      roomId: "r-1",
      category: "Khóa kẹt",
      description: "Cửa chưa mở được trước giờ check-in",
    },
    mockSupabase
  );

  assert.equal(res.success, false);
  assert.equal(res.error, "Kỳ lưu trú chưa bắt đầu, đã kết thúc hoặc không có quyền truy cập.");
});

test("Section D — Item 10: Outside credential window (after valid_until) -> rejects", async () => {
  const mockSupabase = createMockSupabase({
    user: { id: "user-1" },
    booking: {
      id: "b-1",
      user_id: "user-1",
      room_id: "r-1",
      booking_status: "confirmed",
    },
    rpcData: {
      success: true,
      is_active: false,
      digital_key: null,
    },
  });

  const res = await createGuestTicketAction(
    {
      bookingId: "b-1",
      roomId: "r-1",
      category: "Vệ sinh chưa sạch",
      description: "Yêu cầu sau khi đã check-out",
    },
    mockSupabase
  );

  assert.equal(res.success, false);
  assert.equal(res.error, "Kỳ lưu trú chưa bắt đầu, đã kết thúc hoặc không có quyền truy cập.");
});

test("Section D — Item 11: Credential revoked / inactive -> rejects", async () => {
  const mockSupabase = createMockSupabase({
    user: { id: "user-1" },
    booking: {
      id: "b-1",
      user_id: "user-1",
      room_id: "r-1",
      booking_status: "confirmed",
    },
    rpcData: {
      success: true,
      is_active: false,
    },
  });

  const res = await createGuestTicketAction(
    {
      bookingId: "b-1",
      roomId: "r-1",
      category: "Yêu cầu khác",
      description: "Xin thêm khăn tắm khi credential inactive",
    },
    mockSupabase
  );

  assert.equal(res.success, false);
  assert.equal(res.error, "Kỳ lưu trú chưa bắt đầu, đã kết thúc hoặc không có quyền truy cập.");
});

test("Section D — Item 12: Credential/RPC error -> strictly fails closed (no fallback to 14:00/12:00)", async () => {
  const mockSupabase = createMockSupabase({
    user: { id: "user-1" },
    booking: {
      id: "b-1",
      user_id: "user-1",
      room_id: "r-1",
      booking_status: "confirmed",
    },
    rpcError: { message: "Database timeout or network failure" },
  });

  const res = await createGuestTicketAction(
    {
      bookingId: "b-1",
      roomId: "r-1",
      category: "Thiết bị hỏng",
      description: "Điều hòa không mát phòng 101",
    },
    mockSupabase
  );

  assert.equal(res.success, false);
  assert.equal(res.error, "Không thể xác thực thông tin lưu trú. Vui lòng thử lại sau.");
});

test("Section D — Items 13-16: Valid booking & active credential -> creates persisted ticket", async () => {
  let insertedPayload: Record<string, unknown> | null = null;

  const mockSupabase = createMockSupabase({
    user: { id: "user-valid-123" },
    booking: {
      id: "booking-valid-456",
      user_id: "user-valid-123",
      room_id: "room-valid-789",
      booking_status: "confirmed",
    },
    rpcData: {
      success: true,
      is_active: true,
      booking_id: "booking-valid-456",
      digital_key: "998811",
    },
    onInsert: (payload) => {
      insertedPayload = payload;
    },
  });

  const res = await createGuestTicketAction(
    {
      bookingId: "booking-valid-456",
      roomId: "room-valid-789",
      category: "Khóa kẹt",
      description: "Khóa cửa không nhận mã pin số 998811",
    },
    mockSupabase
  );

  assert.equal(res.success, true);
  if (!res.success) {
    assert.fail("Expected action to succeed");
  }

  assert.ok(res.ticket);
  assert.equal(res.ticket.id, "ticket-uuid-1");

  assert.ok(insertedPayload);
  // Item 13: user_id is assigned from auth.getUser(), not untrusted client input
  assert.equal(insertedPayload["user_id"], "user-valid-123");
  assert.equal(insertedPayload["booking_id"], "booking-valid-456");
  assert.equal(insertedPayload["room_id"], "room-valid-789");
  assert.equal(insertedPayload["category"], "Khóa kẹt");
  assert.equal(insertedPayload["description"], "Khóa cửa không nhận mã pin số 998811");

  // Item 14: Status is strictly 'pending'
  assert.equal(insertedPayload["status"], "pending");

  // Item 15: media_paths is initialized to empty array
  assert.deepEqual(insertedPayload["media_paths"], []);

  // Item 16: Return shape conforms to { success: true, ticket: Ticket }
  assert.equal(typeof res.ticket.id, "string");
});

test("Section D — Item 18: SQL syntax & RPC invariants of handover_trusted_rpc.sql", () => {
  const sqlPath = path.resolve(__dirname, "../handover_trusted_rpc.sql");
  assert.ok(fs.existsSync(sqlPath), "handover_trusted_rpc.sql must exist");
  const sqlContent = fs.readFileSync(sqlPath, "utf-8");

  // Verify function declaration and parameters
  assert.ok(sqlContent.includes("CREATE OR REPLACE FUNCTION public.create_guest_ticket("));
  assert.ok(sqlContent.includes("SECURITY DEFINER"));
  assert.ok(sqlContent.includes("SET search_path = ''"));

  // Verify fail-closed stay window check in SQL
  assert.ok(sqlContent.includes("public.booking_access_credentials"));
  assert.ok(sqlContent.includes("valid_from"));
  assert.ok(sqlContent.includes("valid_until"));
  assert.ok(sqlContent.includes("OUTSIDE_STAY_WINDOW"));

  // Verify category whitelist in SQL
  for (const cat of VALID_TICKET_CATEGORIES) {
    assert.ok(sqlContent.includes(cat), `SQL must include category: ${cat}`);
  }

  // Verify description length check
  assert.ok(sqlContent.includes("DESCRIPTION_TOO_SHORT"));

  // Verify Least Privilege & Direct REST API Lockdown
  assert.ok(sqlContent.includes("REVOKE ALL ON FUNCTION public.create_guest_ticket(UUID, TEXT, TEXT, TEXT[]) FROM PUBLIC;"));
  assert.ok(sqlContent.includes("GRANT EXECUTE ON FUNCTION public.create_guest_ticket(UUID, TEXT, TEXT, TEXT[]) TO authenticated, service_role;"));
  assert.ok(sqlContent.includes("REVOKE INSERT ON public.tickets FROM authenticated;"));
});

test("Section D — Item 19: DB error messages are sanitized", async () => {
  const mockSupabase = createMockSupabase({
    user: { id: "user-1" },
    booking: {
      id: "b-1",
      user_id: "user-1",
      room_id: "r-1",
      booking_status: "confirmed",
    },
    rpcData: { success: true, is_active: true },
    insertError: {
      message: "relation \"public.tickets\" violates foreign key constraint \"tickets_room_id_fkey\"",
      code: "23503",
    },
  });

  const res = await createGuestTicketAction(
    {
      bookingId: "b-1",
      roomId: "r-1",
      category: "Vệ sinh chưa sạch",
      description: "Ga trải giường chưa được thay mới",
    },
    mockSupabase
  );

  assert.equal(res.success, false);
  // Ensure raw DB details are NOT leaked to client
  assert.equal(res.error.includes("foreign key"), false);
  assert.equal(res.error.includes("23503"), false);
  assert.equal(res.error.includes("tickets_room_id_fkey"), false);
  assert.equal(res.error, "Không thể tạo yêu cầu hỗ trợ lúc này. Vui lòng thử lại sau.");
});
