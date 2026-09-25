import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { verifyStaffRole, getStaffDashboardData } from "@/lib/data/admin";
import OperationsDashboardClient from "./OperationsDashboardClient";

export const metadata = {
  title: "Bảng Điều Khiển Vận Hành | Kapi Stay Concierge",
  description: "Quản trị trạng thái buồng phòng, tiếp nhận sự cố và lịch đón trả khách 24/7.",
};

export const dynamic = "force-dynamic";

export default async function OperationsDashboardPage() {
  // LỖI 2: Dùng helper canonical của project
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user || authError) {
    redirect("/login?next=/operations");
  }

  let staffRoleInfo: { id: string; email?: string; role: "staff" | "admin" } | null = null;
  let isForbidden = false;
  let isBackendError = false;

  try {
    staffRoleInfo = await verifyStaffRole();
  } catch (error: unknown) {
    // LỖI 1: Không parse Error.message để phân loại auth
    const err = error as { code?: string; status?: number };
    if (err?.code === "FORBIDDEN" || err?.status === 403) {
      isForbidden = true;
    } else {
      isBackendError = true;
    }
  }

  if (isForbidden && !staffRoleInfo) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <h1 className="text-4xl font-bold text-red-600 mb-2">403 - Cấm truy cập</h1>
        <p className="text-gray-600 mb-4">
          Tài khoản của bạn không có quyền Staff/Admin để truy cập trang vận hành này.
        </p>
      </div>
    );
  }

  if (isBackendError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Lỗi xác thực hệ thống</h1>
        <p className="text-gray-600 mb-4">
          Không thể kết nối máy chủ xác minh quyền hạn lúc này. Vui lòng thử lại sau.
        </p>
      </div>
    );
  }

  let dashboardData = null;
  let loadError = false;

  try {
    const res = await getStaffDashboardData();
    if (res) {
      dashboardData = res;
    } else {
      loadError = true;
    }
  } catch {
    loadError = true;
  }

  const safeEmail: string = staffRoleInfo?.email || user?.email || "";

  return (
    <OperationsDashboardClient
      initialData={dashboardData}
      loadError={loadError}
      staffEmail={safeEmail}
    />
  );
}