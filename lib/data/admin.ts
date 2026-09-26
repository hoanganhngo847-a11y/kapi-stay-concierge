import { createClient } from "@/lib/supabase/server";

export type RoomOperationalStatus =
  | "ready"
  | "occupied"
  | "cleaning"
  | "maintenance";

export type StaffMutableRoomOperationalStatus =
  | "ready"
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

export type RoomOperationErrorCode =
  | "ROOM_NOT_FOUND"
  | "ROOM_OCCUPIED_READ_ONLY"
  | "INVALID_TARGET_STATUS"
  | "FORBIDDEN_STAFF_ONLY"
  | "OPERATION_FAILED";

export class RoomOperationError extends Error {
  constructor(
    public code: RoomOperationErrorCode,
    message: string
  ) {
    super(message);
    this.name = "RoomOperationError";
  }
}

export const VALID_ROOM_OPERATIONAL_STATUSES: readonly RoomOperationalStatus[] = [
  "ready",
  "occupied",
  "cleaning",
  "maintenance",
] as const;

export const VALID_STAFF_MUTABLE_ROOM_OPERATIONAL_STATUSES: readonly StaffMutableRoomOperationalStatus[] = [
  "ready",
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

export function isValidStaffMutableRoomOperationalStatus(
  status: unknown
): status is StaffMutableRoomOperationalStatus {
  return (
    typeof status === "string" &&
    (VALID_STAFF_MUTABLE_ROOM_OPERATIONAL_STATUSES as readonly string[]).includes(status)
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

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_FORMAT_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function validateRequiredId(val: unknown, fieldName: string, context?: string): string {
  if (
    typeof val !== "string" ||
    val.trim().length === 0 ||
    val === "undefined" ||
    val === "null" ||
    !UUID_REGEX.test(val.trim())
  ) {
    throw new Error(
      `Định danh bắt buộc ${fieldName} không hợp lệ ('${String(val)}') tại ${context || "backend boundary"}. Dữ liệu bị chặn (Fail-Closed).`
    );
  }
  return val.trim();
}

export function validateRequiredString(val: unknown, fieldName: string, context?: string): string {
  if (
    typeof val !== "string" ||
    val.trim().length === 0 ||
    val === "undefined" ||
    val === "null"
  ) {
    throw new Error(
      `Chuỗi bắt buộc ${fieldName} không hợp lệ ('${String(val)}') tại ${context || "backend boundary"}. Dữ liệu bị chặn (Fail-Closed).`
    );
  }
  return val.trim();
}

export function validateRequiredTimestamp(val: unknown, fieldName: string, context?: string): string {
  if (
    typeof val !== "string" ||
    val.trim().length === 0 ||
    val === "undefined" ||
    val === "null" ||
    Number.isNaN(Date.parse(val.trim()))
  ) {
    throw new Error(
      `Timestamp bắt buộc ${fieldName} không hợp lệ ('${String(val)}') tại ${context || "backend boundary"}. Dữ liệu bị chặn (Fail-Closed).`
    );
  }
  return val.trim();
}

export function validateOptionalTimestamp(
  val: unknown,
  fieldName: string,
  context?: string
): string | null {
  if (val === null || val === undefined) {
    return null;
  }
  if (
    typeof val !== "string" ||
    val.trim().length === 0 ||
    val.trim() === "undefined" ||
    val.trim() === "null" ||
    Number.isNaN(Date.parse(val.trim()))
  ) {
    throw new Error(
      `Timestamp tùy chọn ${fieldName} không hợp lệ ('${String(val)}') tại ${context || "backend boundary"}. Dữ liệu bị chặn (Fail-Closed).`
    );
  }
  return val.trim();
}

export function validateRequiredDate(val: unknown, fieldName: string, context?: string): string {
  if (
    typeof val !== "string" ||
    !DATE_FORMAT_REGEX.test(val.trim()) ||
    Number.isNaN(Date.parse(val.trim()))
  ) {
    throw new Error(
      `Ngày bắt buộc ${fieldName} không hợp lệ ('${String(val)}') tại ${context || "backend boundary"}. Dữ liệu bị chặn (Fail-Closed).`
    );
  }
  return val.trim();
}

export function validateOptionalString(val: unknown): string | null {
  if (val === null || val === undefined) {
    return null;
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed === "" || trimmed === "undefined" || trimmed === "null") {
      return null;
    }
    return trimmed;
  }
  return null;
}

export function validateOptionalId(val: unknown, fieldName: string, context?: string): string | null {
  if (val === null || val === undefined) {
    return null;
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed === "" || trimmed === "undefined" || trimmed === "null") {
      return null;
    }
    if (!UUID_REGEX.test(trimmed)) {
      throw new Error(
        `Định danh tùy chọn ${fieldName} không hợp lệ ('${val}') tại ${context || "backend boundary"}. Dữ liệu bị chặn (Fail-Closed).`
      );
    }
    return trimmed;
  }
  throw new Error(
    `Định danh tùy chọn ${fieldName} không đúng định dạng tại ${context || "backend boundary"}.`
  );
}

export function validatePositiveInteger(val: unknown, fieldName: string, context?: string): number {
  if (typeof val === "number" && Number.isInteger(val) && val > 0) {
    return val;
  }
  if (typeof val === "string" && /^\d+$/.test(val.trim())) {
    const num = parseInt(val.trim(), 10);
    if (num > 0) return num;
  }
  throw new Error(
    `Số nguyên dương bắt buộc ${fieldName} không hợp lệ ('${String(val)}') tại ${context || "backend boundary"}. Dữ liệu bị chặn (Fail-Closed).`
  );
}

export function validateStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) {
    return [];
  }
  return val
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0 && item !== "undefined" && item !== "null")
    .map((item) => item.trim());
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
    updated_at: string | null;
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
 * NOTE: 'occupied' is strictly lifecycle-owned (managed by check-in/stay lifecycle).
 * Staff cannot manually set a room to 'occupied'. Only 'ready', 'cleaning', or 'maintenance' are allowed.
 *
 * @param roomId - The UUID of the room to update
 * @param status - The new operational status ('ready' | 'cleaning' | 'maintenance')
 * @returns Promise<RoomOperationRecord> - The updated operational status record returned from RPC
 */
export async function updateRoomStatus(
  roomId: string,
  status: StaffMutableRoomOperationalStatus
): Promise<RoomOperationRecord> {
  const staff = await verifyStaffRole();

  if (!roomId || typeof roomId !== "string" || roomId.trim().length === 0) {
    throw new RoomOperationError("ROOM_NOT_FOUND", "Mã phòng không hợp lệ.");
  }

  const cleanRoomId = roomId.trim();

  // Fail-Closed: Chặn dứt khoát manual mutation gửi 'occupied'
  if ((status as unknown) === "occupied") {
    throw new RoomOperationError(
      "INVALID_TARGET_STATUS",
      "Trạng thái 'occupied' do vòng đời nhận phòng (check-in) quản lý, nhân viên không được cập nhật thủ công."
    );
  }

  if (!isValidStaffMutableRoomOperationalStatus(status)) {
    throw new RoomOperationError(
      "INVALID_TARGET_STATUS",
      "Trạng thái vận hành phòng không hợp lệ cho thao tác thủ công của nhân viên."
    );
  }

  // Canonical current operational status check (Server-side protection)
  // Fail-Closed: Nếu phòng hiện tại đang 'occupied' (lifecycle-owned), cấm nhân viên thay đổi operational status
  const dashboard = await getStaffDashboardData();
  const currentRoom = dashboard.room_operations?.find((r) => r.room_id === cleanRoomId);

  if (!currentRoom) {
    throw new RoomOperationError("ROOM_NOT_FOUND", "Không tìm thấy phòng tương ứng.");
  }

  if (currentRoom.operational_status === "occupied") {
    throw new RoomOperationError(
      "ROOM_OCCUPIED_READ_ONLY",
      "Phòng đang có khách (occupied) thuộc vòng đời lưu trú, nhân viên không thể thay đổi trạng thái."
    );
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
    throw new RoomOperationError("OPERATION_FAILED", "Không thể cập nhật trạng thái vận hành phòng.");
  }

  const result = rpcRaw as unknown as RpcUpdateRoomResult | null;

  if (!result || result.success !== true) {
    const domainError = result?.error;
    console.error(`[updateRoomStatus] RPC trả về thất bại (${cleanRoomId}):`, domainError);
    if (domainError === "FORBIDDEN_STAFF_ONLY") {
      throw new RoomOperationError("FORBIDDEN_STAFF_ONLY", "Forbidden: Bạn không có quyền thực hiện thao tác này.");
    }
    if (domainError === "ROOM_NOT_FOUND") {
      throw new RoomOperationError("ROOM_NOT_FOUND", "Không tìm thấy phòng tương ứng.");
    }
    if (domainError === "INVALID_OPERATIONAL_STATUS") {
      throw new RoomOperationError("INVALID_TARGET_STATUS", "Trạng thái vận hành phòng không hợp lệ.");
    }
    throw new RoomOperationError("OPERATION_FAILED", "Không thể cập nhật trạng thái vận hành phòng.");
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
    throw new RoomOperationError(
      "OPERATION_FAILED",
      "Dữ liệu phản hồi từ máy chủ không hợp lệ (Fail-Closed)."
    );
  }

  // Fail-Closed: Validate operational_status boundary from RPC response against staff-mutable contract
  // Staff mutation chỉ được phép có: ready | cleaning | maintenance
  // Không dùng full RoomOperationalStatus validator; reject 'occupied' hoặc status ngoài staff-mutable contract
  if (!isValidStaffMutableRoomOperationalStatus(result.operational_status)) {
    console.error(
      `[updateRoomStatus] RPC trả về operational_status không thuộc staff-mutable contract ('${String(
        result.operational_status
      )}'):`,
      result
    );
    throw new RoomOperationError(
      "OPERATION_FAILED",
      `Trạng thái vận hành phòng '${String(
        result.operational_status
      )}' trả về từ máy chủ không hợp lệ cho nhân viên (Fail-Closed).`
    );
  }

  const validatedStatus: StaffMutableRoomOperationalStatus = result.operational_status;

  // Defense-in-depth: updated_by phải bằng staff.id
  if (result.updated_by !== staff.id) {
    console.error(
      `[updateRoomStatus] Người cập nhật không khớp: expected ${staff.id}, got ${result.updated_by}`
    );
    throw new RoomOperationError("OPERATION_FAILED", "Dữ liệu phản hồi từ máy chủ không hợp lệ.");
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
  if (!data || typeof data !== "object" || Array.isArray(data)) {
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
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
      throw new Error(`Dữ liệu room_operations[${index}] không hợp lệ.`);
    }
    const item = rawItem as Record<string, unknown>;
    const context = `room_operations[${index}]`;

    const roomId = validateRequiredId(item.room_id, "room_id", context);
    const roomName = validateRequiredString(item.room_name, "room_name", context);
    const validatedStatus = validateRoomOperationalStatusBoundary(
      item.operational_status,
      `phòng ${roomId}`
    );
    const updatedAt = validateOptionalTimestamp(item.updated_at, "updated_at", context);
    const updatedBy = validateOptionalId(item.updated_by, "updated_by", context);

    return {
      room_id: roomId,
      room_name: roomName,
      operational_status: validatedStatus,
      updated_at: updatedAt,
      updated_by: updatedBy,
    };
  });

  const validatedTickets = payload.tickets.map((rawItem, index) => {
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
      throw new Error(`Dữ liệu tickets[${index}] không hợp lệ.`);
    }
    const item = rawItem as Record<string, unknown>;
    const context = `tickets[${index}]`;

    const id = validateRequiredId(item.id, "id", context);
    const bookingId = validateRequiredId(item.booking_id, "booking_id", context);
    const roomId = validateRequiredId(item.room_id, "room_id", context);
    const userId = validateRequiredId(item.user_id, "user_id", context);
    const roomName = validateOptionalString(item.room_name);
    const guestName = validateOptionalString(item.guest_name);
    const guestPhone = validateOptionalString(item.guest_phone);
    const category = validateRequiredString(item.category, "category", context);
    const description = typeof item.description === "string" ? item.description : "";
    const mediaPaths = validateStringArray(item.media_paths);
    const validatedStatus = validateTicketStatusBoundary(
      item.status,
      `sự cố ${id}`
    );
    const createdAt = validateRequiredTimestamp(item.created_at, "created_at", context);
    const updatedAt = validateRequiredTimestamp(item.updated_at, "updated_at", context);

    return {
      id,
      booking_id: bookingId,
      room_id: roomId,
      room_name: roomName,
      user_id: userId,
      guest_name: guestName,
      guest_phone: guestPhone,
      category,
      description,
      media_paths: mediaPaths,
      status: validatedStatus,
      created_at: createdAt,
      updated_at: updatedAt,
    };
  });

  const validatedTodayBookings = payload.today_bookings.map((rawBooking, index) => {
    if (!rawBooking || typeof rawBooking !== "object" || Array.isArray(rawBooking)) {
      throw new Error(`Dữ liệu today_bookings[${index}] không hợp lệ.`);
    }
    const b = rawBooking as Record<string, unknown>;
    const context = `today_bookings[${index}]`;

    const id = validateRequiredId(b.id, "id", context);
    const roomId = validateRequiredId(b.room_id, "room_id", context);
    const userId = validateRequiredId(b.user_id, "user_id", context);
    const roomName = validateOptionalString(b.room_name);
    const guestName = validateOptionalString(b.guest_name);
    const guestPhone = validateOptionalString(b.guest_phone);
    const checkIn = validateRequiredDate(b.check_in, "check_in", context);
    const checkOut = validateRequiredDate(b.check_out, "check_out", context);
    const guestCount = validatePositiveInteger(b.guest_count, "guest_count", context);
    const bookingStatus = validateRequiredString(b.booking_status, "booking_status", context);
    const paymentStatus = validateRequiredString(b.payment_status, "payment_status", context);
    const isCheckinToday = typeof b.is_checkin_today === "boolean" ? b.is_checkin_today : false;
    const isCheckoutToday = typeof b.is_checkout_today === "boolean" ? b.is_checkout_today : false;

    return {
      id,
      room_id: roomId,
      room_name: roomName,
      user_id: userId,
      guest_name: guestName,
      guest_phone: guestPhone,
      check_in: checkIn,
      check_out: checkOut,
      guest_count: guestCount,
      booking_status: bookingStatus,
      payment_status: paymentStatus,
      is_checkin_today: isCheckinToday,
      is_checkout_today: isCheckoutToday,
    };
  });

  const today = payload.today !== undefined && payload.today !== null
    ? validateRequiredDate(payload.today, "today", "dashboard")
    : undefined;

  return {
    success: true,
    today,
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
