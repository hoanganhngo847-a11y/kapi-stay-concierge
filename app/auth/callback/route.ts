import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSafeRedirectUrl } from "@/lib/auth/redirect";

/**
 * OAuth Callback Handler
 *
 * Flow:
 * 1. Extract authorization `code` and `next` parameter from URL.
 * 2. Sanitize `next` redirect target to prevent open redirects.
 * 3. Exchange authorization code for a session with Supabase.
 * 4. Retrieve trusted user object via `getUser()`.
 * 5. Synchronize public.profiles (upsert metadata, preserve user-set phone).
 * 6. Redirect user to safe `next` target (or fallback to '/').
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next");
  const safeNext = getSafeRedirectUrl(nextParam, "/");

  if (!code) {
    return NextResponse.redirect(new URL("/auth/error?reason=missing_code", request.url));
  }

  const supabase = await createClient();

  // Exchange authorization code for session cookies
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    console.error("OAuth code exchange failed:", exchangeError.message);
    return NextResponse.redirect(new URL("/auth/error?reason=code_exchange", request.url));
  }

  // Fetch trusted user object from Supabase Auth
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error("Failed to retrieve user after code exchange:", userError?.message);
    return NextResponse.redirect(new URL("/auth/error?reason=user_fetch", request.url));
  }

  // Synchronize public.profiles under authenticated user's RLS context
  try {
    const rawMeta = user.user_metadata || {};
    const displayName =
      (typeof rawMeta.full_name === "string" && rawMeta.full_name.trim()) ||
      (typeof rawMeta.name === "string" && rawMeta.name.trim()) ||
      null;

    const avatarUrl =
      (typeof rawMeta.avatar_url === "string" && rawMeta.avatar_url.trim()) ||
      (typeof rawMeta.picture === "string" && rawMeta.picture.trim()) ||
      null;

    // Check if profile exists to safely preserve user phone
    const { data: existingProfile, error: selectError } = await supabase
      .from("profiles")
      .select("id, phone")
      .eq("id", user.id)
      .maybeSingle();

    if (selectError) {
      console.error("Profile check query failed:", selectError.message);
      return NextResponse.redirect(new URL("/auth/error?reason=profile_sync", request.url));
    }

    if (existingProfile) {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          display_name: displayName,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (updateError) {
        console.error("Profile update failed:", updateError.message);
        return NextResponse.redirect(new URL("/auth/error?reason=profile_sync", request.url));
      }
    } else {
      const { error: insertError } = await supabase
        .from("profiles")
        .insert({
          id: user.id,
          display_name: displayName,
          avatar_url: avatarUrl,
        });

      if (insertError) {
        console.error("Profile creation failed:", insertError.message);
        return NextResponse.redirect(new URL("/auth/error?reason=profile_sync", request.url));
      }
    }
  } catch (err) {
    console.error(
      "Unexpected error during profile sync:",
      err instanceof Error ? err.message : "unknown"
    );
    return NextResponse.redirect(new URL("/auth/error?reason=profile_sync", request.url));
  }

  return NextResponse.redirect(new URL(safeNext, request.url));
}
