import { redirect } from "next/navigation";
import { verifyStaffRole, getStaffDashboardData } from "@/lib/data/admin";
import { OperationsDashboardClient } from "./OperationsDashboardClient";

export const metadata = {
  title: "Bảng Điều Khiển Vận Hành | Kapi Stay Concierge",
  description: "Quản trị trạng thái buồng phòng, tiếp nhận sự cố và lịch đón trả khách 24/7.",
};

/**
 * Async Server Component — Operations Dashboard page.
 *
 * Authorization:
 *   Calls verifyStaffRole() which queries public.staff_roles in Supabase.
 *   Does NOT trust client-side user_metadata (JWT claims).
 *   Any unauthenticated request or non-staff user is redirected to /login?next=/operations.
 *
 * Data:
 *   Calls getStaffDashboardData() as the single authoritative source of truth.
 *   Passes pure payload into OperationsDashboardClient without hardcoding or mock fallbacks.
 */
export default async function OperationsDashboardPage() {
  // ── 1. Server-side Staff Authorization ────────────────────────────────────
  let staff;
  try {
    staff = await verifyStaffRole();
  } catch {
    redirect("/login?next=/operations");
  }

  // ── 2. Fetch dashboard data from Supabase via RPC ─────────────────────────
  let dashboardData;
  try {
    dashboardData = await getStaffDashboardData();
  } catch (error) {
    console.error("[OperationsDashboardPage] Lỗi khi gọi getStaffDashboardData:", error);
    dashboardData = {
      success: false,
      room_operations: [],
      tickets: [],
      today_bookings: [],
    };
  }

  // ── 3. Render Client Component with real data ──────────────────────────────
  return (
    <OperationsDashboardClient
      initialData={dashboardData}
      staffEmail={staff.email}
    />
  );
}
