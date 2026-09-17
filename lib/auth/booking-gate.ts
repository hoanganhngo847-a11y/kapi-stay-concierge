import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Reusable Auth Gate for future Booking and Checkout operations.
 *
 * Core Rule: No anonymous booking.
 * Every booking must belong to an authenticated Google/Supabase user.
 *
 * @param returnUrl - The URL to return to after successful login (default: '/rooms')
 * @returns The authenticated user object
 */
export async function requireBookingAuth(returnUrl = "/rooms") {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    redirect(`/login?next=${encodeURIComponent(returnUrl)}`);
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect(`/login?next=${encodeURIComponent(returnUrl)}`);
  }

  return user;
}
