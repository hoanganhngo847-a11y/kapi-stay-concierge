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

/**
 * Verifies that the current authenticated user has 'staff' or 'admin' privileges.
 * Checks app_metadata, user_metadata, and custom claims.
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

  // Check role across app_metadata, user_metadata, and custom claims
  const appRole = (user.app_metadata?.role || "").toString().toLowerCase();
  const userRole = (user.user_metadata?.role || "").toString().toLowerCase();
  const isAdminFlag =
    user.app_metadata?.is_admin === true ||
    user.user_metadata?.is_admin === true;
  const isStaffFlag =
    user.app_metadata?.is_staff === true ||
    user.user_metadata?.is_staff === true;

  const resolvedRole = appRole || userRole;
  const isAuthorized =
    resolvedRole === "admin" ||
    resolvedRole === "staff" ||
    isAdminFlag ||
    isStaffFlag;

  if (!isAuthorized) {
    throw new Error("Forbidden: Bạn không có quyền truy cập trang quản trị.");
  }

  return {
    id: user.id,
    email: user.email,
    role: resolvedRole || (isAdminFlag ? "admin" : "staff"),
  };
}

/**
 * Updates the housekeeping/operational status of a room in `room_operations`.
 * Strict permission: Requires 'admin' or 'staff' role via `verifyStaffRole()`.
 *
 * @param roomId - The UUID of the room to update
 * @param status - The new operational status ('ready' | 'occupied' | 'cleaning')
 * @returns Promise<RoomOperationRecord> - The updated operational status record
 */
export async function updateRoomStatus(
  roomId: string,
  status: RoomOperationalStatus
): Promise<RoomOperationRecord> {
  // 1. Verify staff/admin authorization
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

  // 2. Upsert operational status in room_operations (separated from public rooms catalog)
  const { data, error } = await supabase
    .from("room_operations")
    .upsert({
      room_id: cleanRoomId,
      operational_status: status,
      updated_by: staff.id,
      updated_at: new Date().toISOString(),
    })
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
    .single();

  if (error || !data) {
    console.error(
      `[updateRoomStatus] Lỗi cập nhật trạng thái phòng (${cleanRoomId}):`,
      error?.message
    );
    throw new Error(
      error?.message || "Không thể cập nhật trạng thái vận hành phòng."
    );
  }

  const rawRoom = data.rooms as unknown;
  const room = Array.isArray(rawRoom) ? rawRoom[0] : (rawRoom as { id: string; name: string } | null);

  return {
    room_id: data.room_id,
    operational_status: data.operational_status,
    updated_at: data.updated_at,
    updated_by: data.updated_by,
    rooms: room,
  };
}

/**
 * Updates the resolution status of an incident/service request ticket in `tickets`.
 * Strict permission: Requires 'admin' or 'staff' role via `verifyStaffRole()`.
 *
 * @param ticketId - The UUID of the ticket to update
 * @param status - The new ticket status ('pending' | 'in_progress' | 'resolved')
 * @returns Promise<AdminTicketRecord> - The updated ticket record
 */
export async function updateTicketStatusAdmin(
  ticketId: string,
  status: TicketStatus
): Promise<AdminTicketRecord> {
  // 1. Verify staff/admin authorization
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

  // 2. Update status in tickets table
  const { data, error } = await supabase
    .from("tickets")
    .update({
      status: status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cleanTicketId)
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
    .single();

  if (error || !data) {
    console.error(
      `[updateTicketStatusAdmin] Lỗi cập nhật ticket (${cleanTicketId}):`,
      error?.message
    );
    throw new Error(
      error?.message || "Không thể cập nhật trạng thái yêu cầu hỗ trợ."
    );
  }

  const rawRoom = data.rooms as unknown;
  const room = Array.isArray(rawRoom) ? rawRoom[0] : (rawRoom as { id: string; name: string } | null);

  const rawProfile = data.profiles as unknown;
  const profile = Array.isArray(rawProfile)
    ? rawProfile[0]
    : (rawProfile as {
        id: string;
        display_name: string | null;
        phone: string | null;
      } | null);

  return {
    id: data.id,
    booking_id: data.booking_id,
    room_id: data.room_id,
    user_id: data.user_id,
    category: data.category,
    description: data.description,
    media_paths: data.media_paths || [],
    status: data.status,
    created_at: data.created_at,
    updated_at: data.updated_at,
    rooms: room,
    profiles: profile,
  };
}
