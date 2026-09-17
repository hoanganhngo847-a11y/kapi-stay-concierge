import Link from "next/link";
import { User as UserIcon, LogOut, LogIn } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

/**
 * Server Component: Renders minimal auth action in navigation header.
 * - Logged out: "Đăng nhập" button linking to /login
 * - Logged in: User display name and "Đăng xuất" POST form
 */
export async function AuthNav() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  const isAuthenticated = !error && Boolean(data?.claims?.sub);

  if (!isAuthenticated) {
    return (
      <Link
        href="/login"
        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium text-primary bg-primary/10 hover:bg-primary/15 rounded-lg transition-colors"
      >
        <LogIn className="w-4 h-4" />
        <span>Đăng nhập</span>
      </Link>
    );
  }

  // Retrieve user metadata safely from authenticated session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    "Thành viên";

  return (
    <div className="flex items-center gap-2 sm:gap-3 pl-2 sm:pl-3 border-l border-dark/10">
      <div className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-dark/80 max-w-[130px] sm:max-w-[160px] truncate">
        <UserIcon className="w-4 h-4 text-primary shrink-0" />
        <span className="truncate">{displayName}</span>
      </div>

      <form action="/auth/signout" method="post" className="inline-flex">
        <button
          type="submit"
          title="Đăng xuất"
          className="p-1.5 sm:px-2.5 sm:py-1.5 inline-flex items-center gap-1 text-xs font-medium text-dark/60 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Đăng xuất</span>
        </button>
      </form>
    </div>
  );
}
