import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import { isSafeRedirectUrl } from "@/lib/auth/redirect";

/**
 * Updates the user's Supabase auth session via cookies and enforces route protection.
 *
 * Rules:
 * - Public routes (/ and /rooms) remain accessible without authentication.
 * - /my-stay is protected: unauthenticated requests redirect to /login?next=...
 * - Validates authentication using `supabase.auth.getClaims()`.
 * - Does NOT use `getSession()` for server-side authorization decisions.
 * - Authenticated users visiting /login are redirected to safe `next` or '/'.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Call getClaims() to validate and refresh the current authentication state
  const { data, error } = await supabase.auth.getClaims();

  const pathname = request.nextUrl.pathname;
  const isAuthenticated = !error && Boolean(data?.claims?.sub);

  // Protected route check for /my-stay
  const isProtected = pathname === "/my-stay" || pathname.startsWith("/my-stay/");

  if (isProtected && !isAuthenticated) {
    const fullPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", fullPath);

    const redirectResponse = NextResponse.redirect(loginUrl);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
    });
    return redirectResponse;
  }

  // Already authenticated user visiting /login
  if (pathname === "/login" && isAuthenticated) {
    const nextParam = request.nextUrl.searchParams.get("next");
    const target = isSafeRedirectUrl(nextParam) ? nextParam : "/";
    const redirectResponse = NextResponse.redirect(new URL(target, request.url));
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
    });
    return redirectResponse;
  }

  return supabaseResponse;
}
