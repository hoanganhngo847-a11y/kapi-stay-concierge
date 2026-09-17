import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-side Signout Route (POST only)
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // Terminate session
  await supabase.auth.signOut();

  // Invalidate cached server components
  revalidatePath("/", "layout");

  // 303 See Other is standard for POST-redirect-GET
  return NextResponse.redirect(new URL("/", request.url), {
    status: 303,
  });
}
