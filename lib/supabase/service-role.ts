import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Server-side only Supabase client configured with the service_role key.
 *
 * CRITICAL SECURITY CONSTRAINTS:
 * - NEVER import or execute this file in Client Components.
 * - Service role credentials bypass all PostgreSQL Row Level Security (RLS).
 * - Only use within trusted server-side execution contexts (e.g., webhook handlers,
 *   background jobs, or internal trusted services).
 */
export function createServiceRoleClient() {
  if (typeof window !== "undefined") {
    throw new Error(
      "createServiceRoleClient is strictly server-only and cannot be executed on the client."
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase service role configuration. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set."
    );
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
