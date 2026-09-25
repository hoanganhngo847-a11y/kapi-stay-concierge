import { createClient } from "@/lib/supabase/server";

export type RoomOperationalStatus =
  | "ready"
  | "occupied"
  | "cleaning"
  | "maintenance";

export type TicketStatus = "pending" | "in_progress" | "resolved";

export class StaffAuthError extends Error {
  constructor(
    public code: "UNAUTHENTICATED" | "FORBIDDEN" | "AUTH_BACKEND_ERROR",
    message: string
  ) {
    super(message);
    this.name = "StaffAuthError";
  }
}

export const VALID_ROOM_OPERATIONAL_STATUSES: readonly RoomOperationalStatus[] = [
  "ready",
  "occupied",
  "cleaning",
  "maintenance",
] as const;

export const VALID_TICKET_STATUSES: readonly TicketStatus[] = [
  "pending",
  "in_progress",
  "resolved",
] as const;

export function isValidRoomOperationalStatus(status: unknown): status is RoomOperationalStatus {
  return (
    typeof status === "string" &&
    (VALID_ROOM_OPERATIONAL_STATUSES as readonly string[]).includes(status)
  );
}

export function isValidTicketStatus(status: unknown): status is TicketStatus {
  return (
    typeof status === "string" &&
    (VALID_TICKET_STATUSES as readonly string[]).includes(status)
  );
}

export function validateRoomOperationalStatusBoundary(
  status: unknown,
  context?: string
): RoomOperationalStatus {
  if (!isValidRoomOperationalStatus(status)) {
    throw new Error(
      `Phát hiện operational_status không hợp lệ ('${String(
        status
      )}') tại ${context || "backend boundary"}. Dữ liệu bị chặn (Fail-Closed).`
    );
  }
  return status;
}

export function validateTicketStatusBoundary(
  status: unknown,
  context?: string
): TicketStatus {
  if (!isValidTicketStatus(status)) {
    throw new Error(
      `Phát hiện ticket status không hợp lệ ('${String(
        status
      )}') tại ${context || "backend boundary"}. Dữ liệu bị chặn (Fail-Closed).`
    );
  }
  return status;
}

export interface RoomOperationRecord {
  room_id: string;
  operational_status: RoomOperationalStatus;
  updated_at: string;
  updated_by: string;
  rooms?: {
    id: string;
    name: string;
  } | null;
}

export interface AdminTicketRecord {
  id: string;
  booking_id: string;
  room_id: string;
  user_id: string;
  category: string;
  description: string;
  media_paths: string[];
  status: TicketStatus;
  created_at: string;
  updated_at: string;
  rooms?: {
    id: string;
    name: string;
  } | null;
  profiles?: {
    id: string;
    display_name: string | null;
    phone: string | null;
  } | null;
}

export interface StaffDashboardData {
  success: boolean;
  today?: string;
  room_operations?: Array<{
    room_id: string;
    room_name: string;
    operational_status: RoomOperationalStatus;
    updated_at: string;
    updated_by: string | null;
  }>;
  tickets?: Array<{
    id: string;
    booking_id: string;
    room_id: string;
    room_name: string | null;
    user_id: string;
    guest_name: string | null;
    guest_phone?: string | null;
    category: string;
    description: string;
    media_paths?: string[];
    status: TicketStatus;
    created_at: string;
    updated_at: string;
  }>;
  today_bookings?: Array<{
    id: string;
    room_id: string;
    room_name: string | null;
    user_id: string;
    guest_name: string | null;
    guest_phone?: string | null;
    check_in: string;
    check_out: string;
    guest_count: number;
    booking_status: string;
    payment_status: string;
    is_checkin_today: boolean;
    is_checkout_today: boolean;
  }>;
  error?: string;
}

interface RpcUpdateRoomResult {
  success: boolean;
  error?: string;
  room_id?: string;
  room_name?: string;
  operational_status?: string;
  updated_at?: string;
  updated_by?: string;
}

interface RpcUpdateTicketResult {
  success: boolean;
  error?: string;
  ticket?: {
    id?: string;
    booking_id?: string;
    room_id?: string;
    user_id?: string;
    category?: string;
    description?: string;
    media_paths?: string[];
    status?: string;
    created_at?: string;
    updated_at?: string;
    rooms?: {
      id: string;
      name: string;
    } | null;
    profiles?: {
      id: string;
      display_name: string | null;
      phone: string | null;
    } | null;
  };
}


/**
 * Verifies that the current authenticated user has 'staff' or 'admin' privileges.
 * Authoritative check against database table public.staff_roles (PR #9).
 * Does NOT trust client-side user_metadata.
 * Throws Forbidden error if the user is unauthenticated or does not hold the required role.
 */
export async function verifyStaffRole(): Promise<{
  id: string;
  email?: string;
  role: "staff" | "admin";
}> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  // 1. Supabase Auth / auth.getUser() gặp lỗi backend, network hoặc service error
  if (authError) {
    console.error("[verifyStaffRole] Lỗi kết nối Supabase Auth:", authError.message);
    throw new StaffAuthError("AUTH_BACKEND_ERROR", authError.message);
  }

  // 2. auth.getUser() thành công nhưng không có user/session
  if (!user) {
    throw new StaffAuthError("UNAUTHENTICATED", "Chưa đăng nhập");
  }

  // Authoritative role check against database table public.staff_roles
  const { data: roleData, error: roleError } = await supabase
    .from("staff_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  // 3. User tồn tại nhưng query staff_roles gặp DB/network error
  if (roleError) {
    console.error("[verifyStaffRole] Lỗi truy vấn bảng staff_roles:", roleError.message);
    throw new StaffAuthError("AUTH_BACKEND_ERROR", roleError.message);
  }

  // 4. Query thành công nhưng user không có role staff hoặc admin
  if (!roleData || (roleData.role !== "staff" && roleData.role !== "admin")) {
    throw new StaffAuthError("FORBIDDEN", "Bạn không có quyền truy cập trang quản trị.");
  }

  return {
    id: user.id,
    email: user.email,
    role: roleData.role,
  };
}

/**
 * Updates the housekeeping/operational status of a room via trusted RPC `update_room_operational_status`.
 * Strict permission: Requires 'admin' or 'staff' role verified via `verifyStaffRole()`.
 *
 * @param roomId - The UUID of the room to update
 * @param status - The new operational status ('ready' | 'occupied' | 'cleaning' | 'maintenance')
 * @returns Promise<RoomOperationRecord> - The updated operational status record returned from RPC
 */
export async function updateRoomStatus(
  roomId: string,
  status: RoomOperationalStatus
): Promise<RoomOperationRecord> {
  const staff = await verifyStaffRole();

  if (!roomId || typeof roomId !== "string" || roomId.trim().length === 0) {
    throw new Error("Mã phòng không hợp lệ.");
  }

  const cleanRoomId = roomId.trim();
  const validStatuses: RoomOperationalStatus[] = [
    "ready",
    "occupied",
    "cleaning",
    "maintenance",
  ];

  if (!validStatuses.includes(status)) {
    throw new Error("Trạng thái vận hành phòng không hợp lệ.");
  }

  const supabase = await createClient();

  const { data: rpcRaw, error: rpcError } = await supabase.rpc(
    "update_room_operational_status",
    {
      p_room_id: cleanRoomId,
      p_operational_status: status,
    }
  );

  if (rpcError) {
    console.error(`[updateRoomStatus] Lỗi RPC (${cleanRoomId}):`, rpcError.message);
    throw new Error("Không thể cập nhật trạng thái vận hành phòng.");
  }

  const result = rpcRaw as unknown as RpcUpdateRoomResult | null;

  if (!result || result.success !== true) {
    const domainError = result?.error;
    console.error(`[updateRoomStatus] RPC trả về thất bại (${cleanRoomId}):`, domainError);
    if (domainError === "FORBIDDEN_STAFF_ONLY") {
      throw new Error("Forbidden: Bạn không có quyền thực hiện thao tác này.");
    }
    if (domainError === "ROOM_NOT_FOUND") {
      throw new Error("Không tìm thấy phòng tương ứng.");
    }
    if (domainError === "INVALID_OPERATIONAL_STATUS") {
      throw new Error("Trạng thái vận hành phòng không hợp lệ.");
    }
    throw new Error("Không thể cập nhật trạng thái vận hành phòng.");
  }

  if (
    !result.room_id ||
    typeof result.room_id !== "string" ||
    result.room_id.trim().length === 0 ||
    !result.room_name ||
    typeof result.room_name !== "string" ||
    result.room_name.trim().length === 0 ||
    !result.operational_status ||
    typeof result.operational_status !== "string" ||
    !result.updated_at ||
    typeof result.updated_at !== "string" ||
    result.updated_at.trim().length === 0 ||
    !result.updated_by ||
    typeof result.updated_by !== "string" ||
    result.updated_by.trim().length === 0
  ) {
    console.error("[updateRoomStatus] RPC trả về payload không đúng định dạng:", result);
    throw new Error("Dữ liệu phản hồi từ máy chủ không hợp lệ.");
  }

  // Fail-Closed: Validate operational_status boundary from RPC response
  const validatedStatus = validateRoomOperationalStatusBoundary(
    result.operational_status,
    `RPC update_room_operational_status (${cleanRoomId})`
  );

  // Defense-in-depth: updated_by phải bằng staff.id
  if (result.updated_by !== staff.id) {
    console.error(
      `[updateRoomStatus] Người cập nhật không khớp: expected ${staff.id}, got ${result.updated_by}`
    );
    throw new Error("Dữ liệu phản hồi từ máy chủ không hợp lệ.");
  }

  return {
    room_id: result.room_id,
    operational_status: validatedStatus,
    updated_at: result.updated_at,
    updated_by: result.updated_by,
    rooms: {
      id: result.room_id,
      name: result.room_name,
    },
  };
}

/**
 * Updates the resolution status of an incident/service request ticket via trusted RPC `update_ticket_status`.
 * Strict permission: Requires 'admin' or 'staff' role verified via `verifyStaffRole()`.
 *
 * @param ticketId - The UUID of the ticket to update
 * @param status - The new ticket status ('pending' | 'in_progress' | 'resolved')
 * @returns Promise<AdminTicketRecord> - The updated ticket record returned from RPC
 */
export async function updateTicketStatusAdmin(
  ticketId: string,
  status: TicketStatus
): Promise<AdminTicketRecord> {
  await verifyStaffRole();

  if (!ticketId || typeof ticketId !== "string" || ticketId.trim().length === 0) {
    throw new Error("Mã yêu cầu hỗ trợ không hợp lệ.");
  }

  const cleanTicketId = ticketId.trim();
  const validStatuses: TicketStatus[] = [
    "pending",
    "in_progress",
    "resolved",
  ];

  if (!validStatuses.includes(status)) {
    throw new Error("Trạng thái yêu cầu hỗ trợ không hợp lệ.");
  }

  const supabase = await createClient();

  const { data: rpcRaw, error: rpcError } = await supabase.rpc(
    "update_ticket_status",
    {
      p_ticket_id: cleanTicketId,
      p_status: status,
    }
  );

  if (rpcError) {
    console.error(`[updateTicketStatusAdmin] Lỗi RPC (${cleanTicketId}):`, rpcError.message);
    throw new Error("Không thể cập nhật trạng thái yêu cầu hỗ trợ.");
  }

  const result = rpcRaw as unknown as RpcUpdateTicketResult | null;

  if (!result || result.success !== true) {
    const domainError = result?.error;
    console.error(`[updateTicketStatusAdmin] RPC trả về thất bại (${cleanTicketId}):`, domainError);
    if (domainError === "FORBIDDEN_STAFF_ONLY") {
      throw new Error("Forbidden: Bạn không có quyền thực hiện thao tác này.");
    }
    if (domainError === "TICKET_NOT_FOUND") {
      throw new Error("Không tìm thấy yêu cầu hỗ trợ.");
    }
    if (domainError === "INVALID_TICKET_STATUS") {
      throw new Error("Trạng thái yêu cầu hỗ trợ không hợp lệ.");
    }
    throw new Error("Không thể cập nhật trạng thái yêu cầu hỗ trợ.");
  }

  const t = result.ticket;

  if (
    !t ||
    typeof t !== "object" ||
    !t.id ||
    typeof t.id !== "string" ||
    t.id.trim().length === 0 ||
    !t.booking_id ||
    typeof t.booking_id !== "string" ||
    t.booking_id.trim().length === 0 ||
    !t.room_id ||
    typeof t.room_id !== "string" ||
    t.room_id.trim().length === 0 ||
    !t.user_id ||
    typeof t.user_id !== "string" ||
    t.user_id.trim().length === 0 ||
    !t.category ||
    typeof t.category !== "string" ||
    t.category.trim().length === 0 ||
    typeof t.description !== "string" ||
    !Array.isArray(t.media_paths) ||
    !t.media_paths.every((item) => typeof item === "string") ||
    !t.status ||
    typeof t.status !== "string" ||
    !t.created_at ||
    typeof t.created_at !== "string" ||
    t.created_at.trim().length === 0 ||
    !t.updated_at ||
    typeof t.updated_at !== "string" ||
    t.updated_at.trim().length === 0
  ) {
    console.error("[updateTicketStatusAdmin] RPC trả về ticket payload không đúng định dạng:", result);
    throw new Error("Dữ liệu phản hồi từ máy chủ không hợp lệ.");
  }

  // Fail-Closed: Validate ticket status boundary from RPC response
  const validatedStatus = validateTicketStatusBoundary(
    t.status,
    `RPC update_ticket_status (${cleanTicketId})`
  );

  return {
    id: t.id,
    booking_id: t.booking_id,
    room_id: t.room_id,
    user_id: t.user_id,
    category: t.category,
    description: t.description,
    media_paths: t.media_paths,
    status: validatedStatus,
    created_at: t.created_at,
    updated_at: t.updated_at,
    rooms: t.rooms ?? null,
    profiles: t.profiles ?? null,
  };
}

/**
 * Validates and sanitizes dashboard data at the backend boundary.
 * Enforces Fail-Closed security: throws an error if any operational_status
 * or ticket status falls outside the strictly permitted union types.
 * Treats raw input as untrusted `unknown` without unsafe direct casting.
 */
export function validateStaffDashboardBoundary(data: unknown): StaffDashboardData {
  if (!data || typeof data !== "object") {
    throw new Error("Dữ liệu bảng điều khiển từ máy chủ không hợp lệ (không phải đối tượng).");
  }

  const payload = data as Record<string, unknown>;

  if (payload.success !== true) {
    const domainError = typeof payload.error === "string" ? payload.error : undefined;
    if (domainError === "FORBIDDEN_STAFF_ONLY") {
      throw new Error("Forbidden: Bạn không có quyền truy cập trang quản trị.");
    }
    throw new Error("Không thể tải dữ liệu bảng điều khiển vận hành.");
  }

  if (
    !Array.isArray(payload.room_operations) ||
    !Array.isArray(payload.tickets) ||
    !Array.isArray(payload.today_bookings)
  ) {
    throw new Error("Dữ liệu bảng điều khiển từ máy chủ không đúng định dạng danh sách.");
  }

  const validatedRoomOperations = payload.room_operations.map((rawItem, index) => {
    if (!rawItem || typeof rawItem !== "object") {
      throw new Error(`Dữ liệu room_operations[${index}] không hợp lệ.`);
    }
    const item = rawItem as Record<string, unknown>;
    const validatedStatus = validateRoomOperationalStatusBoundary(
      item.operational_status,
      `phòng ${String(item.room_id || index)}`
    );
    return {
      room_id: String(item.room_id ?? ""),
      room_name: String(item.room_name ?? ""),
      operational_status: validatedStatus,
      updated_at: String(item.updated_at ?? ""),
      updated_by: item.updated_by ? String(item.updated_by) : null,
    };
  });

  const validatedTickets = payload.tickets.map((rawItem, index) => {
    if (!rawItem || typeof rawItem !== "object") {
      throw new Error(`Dữ liệu tickets[${index}] không hợp lệ.`);
    }
    const item = rawItem as Record<string, unknown>;
    const validatedStatus = validateTicketStatusBoundary(
      item.status,
      `sự cố ${String(item.id || index)}`
    );
    return {
      id: String(item.id ?? ""),
      booking_id: String(item.booking_id ?? ""),
      room_id: String(item.room_id ?? ""),
      room_name: item.room_name ? String(item.room_name) : null,
      user_id: String(item.user_id ?? ""),
      guest_name: item.guest_name ? String(item.guest_name) : null,
      guest_phone: item.guest_phone ? String(item.guest_phone) : null,
      category: String(item.category ?? ""),
      description: String(item.description ?? ""),
      media_paths: Array.isArray(item.media_paths) ? item.media_paths.map(String) : [],
      status: validatedStatus,
      created_at: String(item.created_at ?? ""),
      updated_at: String(item.updated_at ?? ""),
    };
  });

  const validatedTodayBookings = payload.today_bookings.map((rawBooking, index) => {
    if (!rawBooking || typeof rawBooking !== "object") {
      throw new Error(`Dữ liệu today_bookings[${index}] không hợp lệ.`);
    }
    const b = rawBooking as Record<string, unknown>;
    return {
      id: String(b.id ?? ""),
      room_id: String(b.room_id ?? ""),
      room_name: b.room_name ? String(b.room_name) : null,
      user_id: String(b.user_id ?? ""),
      guest_name: b.guest_name ? String(b.guest_name) : null,
      guest_phone: b.guest_phone ? String(b.guest_phone) : null,
      check_in: String(b.check_in ?? ""),
      check_out: String(b.check_out ?? ""),
      guest_count: typeof b.guest_count === "number" ? b.guest_count : Number(b.guest_count || 0),
      booking_status: String(b.booking_status ?? ""),
      payment_status: String(b.payment_status ?? ""),
      is_checkin_today: Boolean(b.is_checkin_today),
      is_checkout_today: Boolean(b.is_checkout_today),
    };
  });

  return {
    success: true,
    today: typeof payload.today === "string" ? payload.today : undefined,
    room_operations: validatedRoomOperations,
    tickets: validatedTickets,
    today_bookings: validatedTodayBookings,
  };
}

/**
 * Retrieves comprehensive operations dashboard data for TV7 (Operations Dashboard).
 * Calls the trusted RPC `get_staff_dashboard_data`.
 * Requires authenticated staff role.
 */
export async function getStaffDashboardData(): Promise<StaffDashboardData> {
  await verifyStaffRole();

  const supabase = await createClient();
  const { data: rpcRaw, error: rpcError } = await supabase.rpc("get_staff_dashboard_data");

  if (rpcError) {
    console.error("[getStaffDashboardData] Lỗi RPC get_staff_dashboard_data:", rpcError.message);
    throw new Error("Không thể tải dữ liệu bảng điều khiển vận hành.");
  }

  return validateStaffDashboardBoundary(rpcRaw);
}
