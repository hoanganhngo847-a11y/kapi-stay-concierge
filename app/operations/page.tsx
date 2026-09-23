import { redirect } from "next/navigation";
import { verifyStaffRole, getStaffDashboardData } from "@/lib/data/admin";
import OperationsDashboardClient from "./OperationsDashboardClient";

export const metadata = {
  title: "Bảng Điều Khiển Vận Hành | Kapi Stay Concierge",
  description: "Quản trị trạng thái buồng phòng, tiếp nhận sự cố và lịch đón trả khách 24/7.",
};

export const dynamic = "force-dynamic";

export default async function OperationsDashboardPage() {
  const authRes: any = await verifyStaffRole();

  const isAuthorized = Boolean(
    authRes?.authorized || authRes?.role === "staff" || authRes?.role === "admin"
  );
  const errorCode = authRes?.code || "";
  const staffEmail = authRes?.email || authRes?.staff?.email || "";

  if (!isAuthorized) {
    if (errorCode === "UNAUTHENTICATED") {
      redirect("/login?next=/operations");
    }

    if (errorCode === "FORBIDDEN") {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
          <h1 className="text-4xl font-bold text-red-600 mb-2">403 - Cấm truy cập</h1>
          <p className="text-gray-600 mb-4">
            Tài khoản của bạn không có quyền Staff/Admin để truy cập trang vận hành này.
          </p>
        </div>
      );
    }

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
    const res: any = await getStaffDashboardData();
    if (res && res.success !== false) {
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
      staffEmail={staffEmail}
    />
  );
}