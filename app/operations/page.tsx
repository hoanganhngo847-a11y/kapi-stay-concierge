import { redirect } from "next/navigation";
import { verifyStaffRole, getStaffDashboardData } from "@/lib/data/admin";
import OperationsDashboardClient from "./OperationsDashboardClient";

export const metadata = {
  title: "Bảng Điều Khiển Vận Hành | Kapi Stay Concierge",
  description: "Quản trị trạng thái buồng phòng, tiếp nhận sự cố và lịch đón trả khách 24/7.",
};

export const dynamic = "force-dynamic";

export default async function OperationsDashboardPage() {
  let staffRoleInfo: { id: string; email?: string; role: "staff" | "admin" } | null = null;

  try {
    staffRoleInfo = await verifyStaffRole();
  } catch (error: any) {
    const errMsg = error?.message || "";
    
    // Unauthenticated -> Redirect Login
    if (errMsg.includes("UNAUTHENTICATED") || errMsg.includes("chưa đăng nhập") || errMsg.includes("Auth session missing")) {
      redirect("/login?next=/operations");
    }

    // Forbidden / Non-staff -> 403
    if (errMsg.includes("FORBIDDEN") || errMsg.includes("không có quyền") || errMsg.includes("Unauthorized")) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
          <h1 className="text-4xl font-bold text-red-600 mb-2">403 - Cấm truy cập</h1>
          <p className="text-gray-600 mb-4">
            Tài khoản của bạn không có quyền Staff/Admin để truy cập trang vận hành này.
          </p>
        </div>
      );
    }

    // Backend/Database Failure -> System Error
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Lỗi xác thực hệ thống</h1>
        <p className="text-gray-600">
          Không thể xác minh quyền hạn lúc này. Vui lòng thử lại sau.
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
  } catch (err) {
    loadError = true;
  }

  return (
    <OperationsDashboardClient
      initialData={dashboardData}
      loadError={loadError}
      staffEmail={staffRoleInfo?.email || ""}
    />
  );
}