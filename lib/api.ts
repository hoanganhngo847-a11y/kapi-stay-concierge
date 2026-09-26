/**
 * Application & Data Access Layer Entrypoint (lib/api.ts)
 * Architectural reference: docs/ARCHITECTURE.md
 */

export { checkRoomAvailability } from "@/lib/data/bookings";

export {
  getMyStayBookingDetails,
  type MyStayBookingDetails,
} from "@/lib/data/my-stay";

// Admin Operations & Security
export {
  verifyStaffRole,
  updateRoomStatus,
  updateTicketStatusAdmin,
  getStaffDashboardData,
  StaffAuthError,
  RoomOperationError,
  type RoomOperationErrorCode,
  isValidRoomOperationalStatus,
  isValidStaffMutableRoomOperationalStatus,
  isValidTicketStatus,
  validateOptionalTimestamp,
  type RoomOperationalStatus,
  type StaffMutableRoomOperationalStatus,
  type TicketStatus,
  type RoomOperationRecord,
  type AdminTicketRecord,
  type StaffDashboardData,
} from "@/lib/data/admin";
