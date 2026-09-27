import test from "node:test";
import assert from "node:assert/strict";

import {
  createGuestTicketAction,
  type TicketSupabaseClient,
  type Ticket,
} from "../actions";
import { VALID_TICKET_CATEGORIES, isValidTicketCategory } from "../constants";

interface MockRpcCall {
  fnName: string;
  args?: Record<string, unknown>;
}

interface MockSupabaseOptions {
  rpcData?: unknown;
  rpcError?: { message: string; [key: string]: unknown } | null;
  onRpc?: (fnName: string, args?: Record<string, unknown>) => void;
  onFrom?: (table: string) => void;
}

function createMockSupabase(options: MockSupabaseOptions = {}) {
  const rpcCalls: MockRpcCall[] = [];
  const fromCalls: string[] = [];

  const client: TicketSupabaseClient = {
    rpc: async (fnName: string, args?: Record<string, unknown>) => {
      rpcCalls.push({ fnName, args });
      options.onRpc?.(fnName, args);
      return {
        data: options.rpcData ?? null,
        error: options.rpcError ?? null,
      };
    },
    from: (table: string) => {
      fromCalls.push(table);
      options.onFrom?.(table);
      return {
        insert: () => {
          throw new Error(`Direct INSERT on '${table}' is strictly forbidden by database permissions.`);
        },
        select: () => {
          throw new Error(`Direct SELECT on '${table}' should not be called.`);
        },
      };
    },
  };

  return { client, rpcCalls, fromCalls };
}

// ============================================================================
// Canonical Whitelist Checks
// ============================================================================

test("Section D — Item 17: Category Whitelist Enforcement", () => {
  assert.equal(VALID_TICKET_CATEGORIES.length, 5);
  const expectedCategories = [
    "Khóa kẹt",
    "Thiết bị hỏng",
    "Vệ sinh chưa sạch",
    "Tiếng ồn",
    "Yêu cầu khác",
  ];
  for (const cat of expectedCategories) {
    assert.equal(isValidTicketCategory(cat), true);
  }
  assert.equal(isValidTicketCategory("Arbitrary Hacker Category"), false);
  assert.equal(isValidTicketCategory(""), false);
  assert.equal(isValidTicketCategory(null), false);
  assert.equal(isValidTicketCategory(123), false);
});

// ============================================================================
// Test A: invalid/missing bookingId -> reject trước RPC
// ============================================================================

test("Test A: Missing or empty bookingId -> rejects before RPC", async () => {
  const { client, rpcCalls } = createMockSupabase();

  const emptyRes = await createGuestTicketAction(
    {
      bookingId: "",
      category: "Khóa kẹt",
      description: "Khóa cửa phòng bị kẹt chốt",
    },
    client
  );
  assert.equal(emptyRes.success, false);
  assert.equal(emptyRes.error, "Không tìm thấy thông tin đặt phòng hợp lệ.");
  assert.equal(rpcCalls.length, 0);

  const whitespaceRes = await createGuestTicketAction(
    {
      bookingId: "   ",
      category: "Khóa kẹt",
      description: "Khóa cửa phòng bị kẹt chốt",
    },
    client
  );
  assert.equal(whitespaceRes.success, false);
  assert.equal(whitespaceRes.error, "Không tìm thấy thông tin đặt phòng hợp lệ.");
  assert.equal(rpcCalls.length, 0);
});

// ============================================================================
// Test B: invalid category -> reject trước RPC
// ============================================================================

test("Test B: Invalid category -> rejects before RPC", async () => {
  const { client, rpcCalls } = createMockSupabase();

  const res = await createGuestTicketAction(
    {
      bookingId: "booking-uuid-1",
      category: "Invalid Hacker Category",
      description: "Điều hòa phòng không mát",
    },
    client
  );

  assert.equal(res.success, false);
  assert.equal(res.error, "Danh mục yêu cầu không hợp lệ.");
  assert.equal(rpcCalls.length, 0);
});

// ============================================================================
// Test C: description < 5 -> reject trước RPC
// ============================================================================

test("Test C: Description < 5 characters trimmed -> rejects before RPC", async () => {
  const { client, rpcCalls } = createMockSupabase();

  const shortRes = await createGuestTicketAction(
    {
      bookingId: "booking-uuid-1",
      category: "Thiết bị hỏng",
      description: "1234",
    },
    client
  );
  assert.equal(shortRes.success, false);
  assert.equal(shortRes.error, "Mô tả cần ít nhất 5 ký tự để lễ tân nắm bắt sự cố.");
  assert.equal(rpcCalls.length, 0);

  const spacesRes = await createGuestTicketAction(
    {
      bookingId: "booking-uuid-1",
      category: "Thiết bị hỏng",
      description: "   hư   ",
    },
    client
  );
  assert.equal(spacesRes.success, false);
  assert.equal(spacesRes.error, "Mô tả cần ít nhất 5 ký tự để lễ tân nắm bắt sự cố.");
  assert.equal(rpcCalls.length, 0);
});

// ============================================================================
// Test D: RPC UNAUTHORIZED -> fail
// ============================================================================

test("Test D: RPC returns UNAUTHORIZED -> maps to friendly Vietnamese message", async () => {
  const { client, rpcCalls } = createMockSupabase({
    rpcData: { success: false, error: "UNAUTHORIZED" },
  });

  const res = await createGuestTicketAction(
    {
      bookingId: "booking-uuid-1",
      category: "Khóa kẹt",
      description: "Khóa thông minh không nhận mã pin",
    },
    client
  );

  assert.equal(res.success, false);
  assert.equal(res.error, "Vui lòng đăng nhập để gửi yêu cầu hỗ trợ.");
  assert.equal(rpcCalls.length, 1);
});

// ============================================================================
// Test E: RPC BOOKING_NOT_FOUND_OR_FORBIDDEN -> fail
// ============================================================================

test("Test E: RPC returns BOOKING_NOT_FOUND_OR_FORBIDDEN -> maps to friendly message", async () => {
  const { client, rpcCalls } = createMockSupabase({
    rpcData: { success: false, error: "BOOKING_NOT_FOUND_OR_FORBIDDEN" },
  });

  const res = await createGuestTicketAction(
    {
      bookingId: "booking-uuid-other-user",
      category: "Khóa kẹt",
      description: "Khóa thông minh không nhận mã pin",
    },
    client
  );

  assert.equal(res.success, false);
  assert.equal(res.error, "Không tìm thấy thông tin đặt phòng hợp lệ.");
  assert.equal(rpcCalls.length, 1);
});

// ============================================================================
// Test F: RPC BOOKING_NOT_ACTIVE -> fail
// ============================================================================

test("Test F: RPC returns BOOKING_NOT_ACTIVE -> maps to friendly message", async () => {
  const { client, rpcCalls } = createMockSupabase({
    rpcData: { success: false, error: "BOOKING_NOT_ACTIVE" },
  });

  const res = await createGuestTicketAction(
    {
      bookingId: "booking-uuid-cancelled",
      category: "Tiếng ồn",
      description: "Phòng bên cạnh gây ồn ào quá mức",
    },
    client
  );

  assert.equal(res.success, false);
  assert.equal(res.error, "Đơn đặt phòng chưa được xác nhận hoặc đã bị hủy.");
  assert.equal(rpcCalls.length, 1);
});

// ============================================================================
// Test G: RPC NO_ACTIVE_STAY_CREDENTIAL -> fail
// ============================================================================

test("Test G: RPC returns NO_ACTIVE_STAY_CREDENTIAL -> maps to stay window message", async () => {
  const { client, rpcCalls } = createMockSupabase({
    rpcData: { success: false, error: "NO_ACTIVE_STAY_CREDENTIAL" },
  });

  const res = await createGuestTicketAction(
    {
      bookingId: "booking-uuid-expired",
      category: "Vệ sinh chưa sạch",
      description: "Yêu cầu dọn phòng sau khi đã check-out",
    },
    client
  );

  assert.equal(res.success, false);
  assert.equal(res.error, "Kỳ lưu trú chưa bắt đầu, đã kết thúc hoặc không có quyền truy cập.");
  assert.equal(rpcCalls.length, 1);
});

// ============================================================================
// Test H: RPC INVALID_CATEGORY -> fail
// ============================================================================

test("Test H: RPC returns INVALID_CATEGORY -> maps to invalid category error", async () => {
  const { client, rpcCalls } = createMockSupabase({
    rpcData: { success: false, error: "INVALID_CATEGORY" },
  });

  const res = await createGuestTicketAction(
    {
      bookingId: "booking-uuid-1",
      category: "Khóa kẹt",
      description: "Khóa thông minh không nhận mã pin",
    },
    client
  );

  assert.equal(res.success, false);
  assert.equal(res.error, "Danh mục yêu cầu không hợp lệ.");
  assert.equal(rpcCalls.length, 1);
});

// ============================================================================
// Test I: RPC DESCRIPTION_TOO_SHORT -> fail
// ============================================================================

test("Test I: RPC returns DESCRIPTION_TOO_SHORT -> maps to description too short error", async () => {
  const { client, rpcCalls } = createMockSupabase({
    rpcData: { success: false, error: "DESCRIPTION_TOO_SHORT" },
  });

  const res = await createGuestTicketAction(
    {
      bookingId: "booking-uuid-1",
      category: "Khóa kẹt",
      description: "Khóa kẹt chốt không mở được",
    },
    client
  );

  assert.equal(res.success, false);
  assert.equal(res.error, "Mô tả cần ít nhất 5 ký tự để lễ tân nắm bắt sự cố.");
  assert.equal(rpcCalls.length, 1);
});

// ============================================================================
// Test J: transport/database RPC error -> sanitized generic error
// ============================================================================

test("Test J: Transport/database RPC error -> sanitized generic error, does not leak raw DB detail", async () => {
  const { client, rpcCalls } = createMockSupabase({
    rpcError: {
      message: 'relation "public.tickets" violates foreign key constraint "tickets_room_id_fkey"',
      code: "23503",
    },
  });

  const res = await createGuestTicketAction(
    {
      bookingId: "booking-uuid-1",
      category: "Thiết bị hỏng",
      description: "Bình nóng lạnh không sáng đèn nguồn",
    },
    client
  );

  assert.equal(res.success, false);
  assert.equal(res.error, "Không thể tạo yêu cầu hỗ trợ lúc này. Vui lòng thử lại sau.");
  assert.equal(res.error.includes("foreign key"), false);
  assert.equal(res.error.includes("23503"), false);
  assert.equal(res.error.includes("tickets_room_id_fkey"), false);
  assert.equal(rpcCalls.length, 1);
});

// ============================================================================
// Test K: malformed success payload -> fail-closed
// ============================================================================

test("Test K: Malformed success payloads fail-closed with generic sanitized error", async () => {
  const malformedCases = [
    null,
    "not an object",
    {},
    { success: true }, // missing ticket & ticket_id
    { success: true, ticket_id: "t-1", ticket: null },
    {
      // Missing required id
      success: true,
      ticket_id: "t-1",
      ticket: {
        booking_id: "b-1",
        room_id: "r-1",
        user_id: "u-1",
        category: "Khóa kẹt",
        description: "Khóa cửa bị kẹt",
        media_paths: [],
        status: "pending",
        created_at: "2026-09-27T00:00:00Z",
        updated_at: "2026-09-27T00:00:00Z",
      },
    },
    {
      // Non-pending status
      success: true,
      ticket_id: "t-1",
      ticket: {
        id: "t-1",
        booking_id: "b-1",
        room_id: "r-1",
        user_id: "u-1",
        category: "Khóa kẹt",
        description: "Khóa cửa bị kẹt",
        media_paths: [],
        status: "resolved",
        created_at: "2026-09-27T00:00:00Z",
        updated_at: "2026-09-27T00:00:00Z",
      },
    },
    {
      // ID mismatch
      success: true,
      ticket_id: "ticket-mismatch-A",
      ticket: {
        id: "ticket-mismatch-B",
        booking_id: "b-1",
        room_id: "r-1",
        user_id: "u-1",
        category: "Khóa kẹt",
        description: "Khóa cửa bị kẹt",
        media_paths: [],
        status: "pending",
        created_at: "2026-09-27T00:00:00Z",
        updated_at: "2026-09-27T00:00:00Z",
      },
    },
    {
      // Invalid category in returned ticket
      success: true,
      ticket_id: "t-1",
      ticket: {
        id: "t-1",
        booking_id: "b-1",
        room_id: "r-1",
        user_id: "u-1",
        category: "Invalid Category",
        description: "Khóa cửa bị kẹt",
        media_paths: [],
        status: "pending",
        created_at: "2026-09-27T00:00:00Z",
        updated_at: "2026-09-27T00:00:00Z",
      },
    },
    {
      // media_paths not an array
      success: true,
      ticket_id: "t-1",
      ticket: {
        id: "t-1",
        booking_id: "b-1",
        room_id: "r-1",
        user_id: "u-1",
        category: "Khóa kẹt",
        description: "Khóa cửa bị kẹt",
        media_paths: "not an array",
        status: "pending",
        created_at: "2026-09-27T00:00:00Z",
        updated_at: "2026-09-27T00:00:00Z",
      },
    },
  ];

  for (const badPayload of malformedCases) {
    const { client } = createMockSupabase({ rpcData: badPayload });
    const res = await createGuestTicketAction(
      {
        bookingId: "booking-uuid-1",
        category: "Khóa kẹt",
        description: "Khóa cửa thông minh bị kẹt",
      },
      client
    );

    assert.equal(res.success, false, `Failed to reject malformed payload: ${JSON.stringify(badPayload)}`);
    assert.equal(res.error, "Không thể tạo yêu cầu hỗ trợ lúc này. Vui lòng thử lại sau.");
  }
});

// ============================================================================
// Test L: valid canonical success payload -> trả { success: true, ticket }
// ============================================================================

test("Test L: Valid canonical success payload -> returns { success: true, ticket }", async () => {
  const canonicalTicket: Ticket = {
    id: "ticket-canonical-101",
    booking_id: "booking-uuid-valid",
    room_id: "room-uuid-valid",
    user_id: "user-uuid-valid",
    category: "Khóa kẹt",
    description: "Khóa thông minh không nhận mã pin số 998811",
    media_paths: [],
    status: "pending",
    created_at: "2026-09-27T10:00:00.000Z",
    updated_at: "2026-09-27T10:00:00.000Z",
  };

  const { client } = createMockSupabase({
    rpcData: {
      success: true,
      ticket_id: "ticket-canonical-101",
      ticket: canonicalTicket,
    },
  });

  const res = await createGuestTicketAction(
    {
      bookingId: "booking-uuid-valid",
      category: "Khóa kẹt",
      description: "Khóa thông minh không nhận mã pin số 998811",
    },
    client
  );

  assert.equal(res.success, true);
  if (!res.success) {
    assert.fail("Expected action to succeed");
  }

  assert.deepEqual(res.ticket, canonicalTicket);
  assert.equal(res.ticket.id, "ticket-canonical-101");
  assert.equal(res.ticket.status, "pending");
  assert.deepEqual(res.ticket.media_paths, []);
});

// ============================================================================
// Test M: chứng minh action gọi create_guest_ticket, không gọi direct INSERT
// ============================================================================

test("Test M: Verifies action calls trusted create_guest_ticket RPC and NEVER calls direct .from('tickets').insert()", async () => {
  const canonicalTicket: Ticket = {
    id: "ticket-canonical-202",
    booking_id: "booking-uuid-auth",
    room_id: "room-uuid-derived-by-db",
    user_id: "user-uuid-auth",
    category: "Yêu cầu khác",
    description: "Xin bổ sung thêm khăn tắm cho phòng",
    media_paths: [],
    status: "pending",
    created_at: "2026-09-27T10:15:00.000Z",
    updated_at: "2026-09-27T10:15:00.000Z",
  };

  const { client, rpcCalls, fromCalls } = createMockSupabase({
    rpcData: {
      success: true,
      ticket_id: "ticket-canonical-202",
      ticket: canonicalTicket,
    },
  });

  const res = await createGuestTicketAction(
    {
      bookingId: "booking-uuid-auth",
      category: "Yêu cầu khác",
      description: "Xin bổ sung thêm khăn tắm cho phòng",
    },
    client
  );

  assert.equal(res.success, true);

  // 1. Assert exactly 1 RPC call
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].fnName, "create_guest_ticket");

  // 2. Assert RPC arguments match canonical signature
  assert.deepEqual(rpcCalls[0].args, {
    p_booking_id: "booking-uuid-auth",
    p_category: "Yêu cầu khác",
    p_description: "Xin bổ sung thêm khăn tắm cho phòng",
    p_media_paths: [],
  });

  // 3. Assert zero calls to supabase.from() — no direct tables access
  assert.equal(fromCalls.length, 0);
});
