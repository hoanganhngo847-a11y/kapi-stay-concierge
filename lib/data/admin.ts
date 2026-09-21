"use server";

import { createClient } from "@/lib/supabase/server";

export type RoomOperationalStatus = "ready" | "occupied" | "cleaning";

export type TicketStatus = "pending" | "in_progress" | "resolved";

export interface RoomOperationRecord {
  room_id: string;
  operational_status: string;
  updated_at: string;
  updated_by: string | null;
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
  status: string;
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
    operational_status: string;
    updated_at: string;
    updated_by: string | null;
  }>;
  support_tickets?: Array<{
    id: string;
    booking_id: string;
    room_id: string;
    room_name: string;
    user_id: string;
    guest_name: string | null;
    category: string;
    description: string;
    status: string;
    resolution_notes: string | null;
    created_at: string;
    updated_at: string;
  }>;
  today_bookings?: Array<{
    id: string;
    room_id: string;
    room_name: string;
    user_id: string;
    guest_name: string | null;
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

/**
 * Verifies that the current authenticated user has 'staff' or 'admin' privileges.
 * Authoritative check against database table public.staff_roles (PR #9).
 * Does NOT trust client-side user_metadata.
 * Throws Forbidden error if the user is unauthenticated or does not hold the required role.
 */
export async function verifyStaffRole(): Promise<{
  id: string;
  email?: string;
  role: string;
}> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Forbidden: Bạn không có quyền truy cập trang quản trị.");
  }

  // Authoritative role check against database table public.staff_roles
  const { data: roleData } = await supabase
    .from("staff_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  let isAuthorized = Boolean(roleData?.role);
  let resolvedRole = roleData?.role || "staff";

  // Double-check via RPC is_staff
  if (!isAuthorized) {
    try {
      const { data: isStaffRpc } = await supabase.rpc("is_staff" as any, {
        p_user_id: user.id,
      } as any);
      if (isStaffRpc === true) {
        isAuthorized = true;
      }
    } catch {
      // ignore RPC error
    }
  }

  if (!isAuthorized) {
    throw new Error("Forbidden: Bạn không có quyền truy cập trang quản trị.");
  }

  return {
    id: user.id,
    email: user.email,
    role: resolvedRole,
  };
}

/**
 * Updates the housekeeping/operational status of a room via trusted RPC `update_room_cleaning_status`.
 * Strict permission: Requires 'admin' or 'staff' role verified via `verifyStaffRole()`.
 *
 * @param roomId - The UUID of the room to update
 * @param status - The new operational status ('ready' | 'occupied' | 'cleaning')
 * @returns Promise<RoomOperationRecord> - The updated operational status record
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
  ];

  if (!validStatuses.includes(status)) {
    throw new Error(
      `Trạng thái phòng không hợp lệ. Cho phép: ${validStatuses.join(", ")}`
    );
  }

  const supabase = await createClient();

  // Call trusted RPC update_room_cleaning_status
  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    "update_room_cleaning_status" as any,
    {
      p_room_id: cleanRoomId,
      p_cleaning_status: status,
    } as any
  );

  if (rpcError || (rpcResult && !(rpcResult as any).success)) {
    const errMsg =
      rpcError?.message ||
      (rpcResult as any)?.error ||
      "Không thể cập nhật trạng thái vận hành phòng.";
    console.error(`[updateRoomStatus] Lỗi RPC (${cleanRoomId}):`, errMsg);
    throw new Error(errMsg);
  }

  // Query updated record for return
  const { data: opData } = await supabase
    .from("room_operations")
    .select(`
      room_id,
      operational_status,
      updated_at,
      updated_by,
      rooms (
        id,
        name
      )
    `)
    .eq("room_id", cleanRoomId)
    .maybeSingle();

  const rawRoom = opData?.rooms as unknown;
  const room = Array.isArray(rawRoom)
    ? rawRoom[0]
    : (rawRoom as { id: string; name: string } | null);

  return {
    room_id: cleanRoomId,
    operational_status: status,
    updated_at: opData?.updated_at || new Date().toISOString(),
    updated_by: staff.id,
    rooms: room || null,
  };
}

/**
 * Updates the resolution status of an incident/service request ticket via trusted RPC `update_ticket_status`.
 * Strict permission: Requires 'admin' or 'staff' role verified via `verifyStaffRole()`.
 *
 * @param ticketId - The UUID of the ticket to update
 * @param status - The new ticket status ('pending' | 'in_progress' | 'resolved')
 * @param resolutionNotes - Optional resolution notes
 * @returns Promise<AdminTicketRecord> - The updated ticket record
 */
export async function updateTicketStatusAdmin(
  ticketId: string,
  status: TicketStatus,
  resolutionNotes?: string
): Promise<AdminTicketRecord> {
  await verifyStaffRole();

  if (!ticketId || typeof ticketId !== "string" || ticketId.trim().length === 0) {
    throw new Error("Mã yêu cầu hỗ trợ (ticketId) không hợp lệ.");
  }

  const cleanTicketId = ticketId.trim();
  const validStatuses: TicketStatus[] = [
    "pending",
    "in_progress",
    "resolved",
  ];

  if (!validStatuses.includes(status)) {
    throw new Error(
      `Trạng thái ticket không hợp lệ. Cho phép: ${validStatuses.join(", ")}`
    );
  }

  const supabase = await createClient();

  // Call trusted RPC update_ticket_status
  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    "update_ticket_status" as any,
    {
      p_ticket_id: cleanTicketId,
      p_status: status,
      p_resolution_notes: resolutionNotes || null,
    } as any
  );

  if (rpcError || (rpcResult && !(rpcResult as any).success)) {
    const errMsg =
      rpcError?.message ||
      (rpcResult as any)?.error ||
      "Không thể cập nhật trạng thái yêu cầu hỗ trợ.";
    console.error(`[updateTicketStatusAdmin] Lỗi RPC (${cleanTicketId}):`, errMsg);
    throw new Error(errMsg);
  }

  // Query updated record for return
  const { data: ticketData } = await supabase
    .from("tickets")
    .select(`
      id,
      booking_id,
      room_id,
      user_id,
      category,
      description,
      media_paths,
      status,
      created_at,
      updated_at,
      rooms (
        id,
        name
      ),
      profiles (
        id,
        display_name,
        phone
      )
    `)
    .eq("id", cleanTicketId)
    .maybeSingle();

  const rawRoom = ticketData?.rooms as unknown;
  const room = Array.isArray(rawRoom)
    ? rawRoom[0]
    : (rawRoom as { id: string; name: string } | null);

  const rawProfile = ticketData?.profiles as unknown;
  const profile = Array.isArray(rawProfile)
    ? rawProfile[0]
    : (rawProfile as {
        id: string;
        display_name: string | null;
        phone: string | null;
      } | null);

  return {
    id: cleanTicketId,
    booking_id: ticketData?.booking_id || "",
    room_id: ticketData?.room_id || "",
    user_id: ticketData?.user_id || "",
    category: ticketData?.category || "",
    description: ticketData?.description || "",
    media_paths: ticketData?.media_paths || [],
    status: status,
    created_at: ticketData?.created_at || new Date().toISOString(),
    updated_at: ticketData?.updated_at || new Date().toISOString(),
    rooms: room,
    profiles: profile,
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
  const { data, error } = await supabase.rpc("get_staff_dashboard_data" as any);

  if (error) {
    console.error("[getStaffDashboardData] Lỗi RPC get_staff_dashboard_data:", error.message);
    throw new Error(error.message || "Không thể tải dữ liệu bảng điều khiển vận hành.");
  }

  return data as StaffDashboardData;
}
