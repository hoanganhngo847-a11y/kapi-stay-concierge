/**
 * Application & Data Access Layer Entrypoint (lib/api.ts)
 * Architectural reference: docs/ARCHITECTURE.md
 */

export {
  checkRoomAvailability,
  createBookingSafe,
  type CreateBookingInput,
  type BookingRecord,
} from "@/lib/data/bookings";
