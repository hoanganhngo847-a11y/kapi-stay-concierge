/**
 * Application & Data Access Layer Entrypoint (lib/api.ts)
 * Architectural reference: docs/ARCHITECTURE.md
 */

// Admin Operations & Security
export {
  verifyStaffRole,
  updateRoomStatus,
  updateTicketStatusAdmin,
  type RoomOperationalStatus,
  type TicketStatus,
  type RoomOperationRecord,
  type AdminTicketRecord,
} from "@/lib/data/admin";
