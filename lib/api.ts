/**
 * Application & Data Access Layer Entrypoint (lib/api.ts)
 * Architectural reference: docs/ARCHITECTURE.md
 */

// Admin Operations & Security
export {
  verifyStaffRole,
  updateRoomStatus,
  updateTicketStatusAdmin,
  getStaffDashboardData,
  type RoomOperationalStatus,
  type TicketStatus,
  type RoomOperationRecord,
  type AdminTicketRecord,
  type StaffDashboardData,
} from "@/lib/data/admin";
