"use server";

import { createClient } from "@/lib/supabase/server";
import { createCheckoutSession } from "@/lib/data/checkout";

export interface CreateHoldResult {
  status: "SUCCESS" | "UNAUTHENTICATED" | "CONFLICT" | "ERROR";
  sessionId?: string;
  loginUrl?: string;
  message?: string;
}

/**
 * Server Action to atomically reserve a temporary room hold via checkout session creation.
 * Serialized by pg_advisory_xact_lock in create_hourly_checkout_session_atomic.
 */
export async function createHoldSessionAction(params: {
  roomId: string;
  checkIn: string;
  checkOut: string;
  guests?: number;
}): Promise<CreateHoldResult> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  const checkoutQuery = new URLSearchParams({
    roomId: params.roomId,
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    checkInAt: params.checkIn,
    checkOutAt: params.checkOut,
  }).toString();

  // Enforce authentication before creating hold
  if (!claimsData?.claims?.sub) {
    return {
      status: "UNAUTHENTICATED",
      loginUrl: `/login?next=${encodeURIComponent(`/checkout?${checkoutQuery}`)}`,
    };
  }

  const { sessionId, error } = await createCheckoutSession({
    roomId: params.roomId,
    checkInAt: params.checkIn,
    checkOutAt: params.checkOut,
    guestCount: params.guests ?? null,
  });

  if (error || !sessionId) {
    const isConflict =
      error?.includes("vừa được một khách khác chọn") ||
      error?.includes("Phòng đã được đặt") ||
      error?.includes("ROOM_TEMPORARILY_HELD") ||
      error?.includes("ROOM_NOT_AVAILABLE");

    if (isConflict) {
      return {
        status: "CONFLICT",
        message: "Khung giờ này vừa được một khách khác chọn. Vui lòng chọn khung giờ khác.",
      };
    }

    return {
      status: "ERROR",
      message: error || "Không thể giữ phòng lúc này. Vui lòng thử lại.",
    };
  }

  return {
    status: "SUCCESS",
    sessionId,
  };
}
