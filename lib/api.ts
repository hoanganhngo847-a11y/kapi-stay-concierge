/**
 * Application & Data Access Layer Entrypoint (lib/api.ts)
 * Architectural reference: docs/ARCHITECTURE.md
 */

export { checkRoomAvailability } from "@/lib/data/bookings";

export {
  getMyStayBookingDetails,
  type MyStayBookingDetails,
} from "@/lib/data/my-stay";
