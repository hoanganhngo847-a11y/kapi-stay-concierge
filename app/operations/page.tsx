import { redirect } from "next/navigation";
import { verifyStaffRole, getStaffDashboardData } from "@/lib/data/admin";
import OperationsDashboardClient from "./OperationsDashboardClient";

export const metadata = {
  title: "Bảng Điều Khiển Vận Hành | Kapi Stay Concierge",
  description: "Quản trị trạng thái buồng phòng, tiếp nhận sự cố và lịch đón trả khách 24/7.",
};

export const dynamic = "force-dynamic";

export default async function OperationsDashboardPage() {
  // 1. Phân loại Auth Error chuẩn xác (Xử lý B1)
  const authResult = await verifyStaffRole();

  if (!authResult.authorized) {
    if (authResult.code === "UNAUTHENTICATED") {
      redirect("/login?next=/operations");
    }

    if (authResult.code === "FORBIDDEN") {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
          <h1 className="text-4xl font-bold text-red-600 mb-2">403 - Cấm truy cập</h1>
          <p className="text-gray-600 mb-4">
            Tài khoản của bạn không có quyền Staff/Admin để truy cập trang vận hành này.
          </p>
        </div>
      );
    }

    // Backend/Database failure khi xác thực role
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Lỗi xác thực hệ thống</h1>
        <p className="text-gray-600">
          Không thể xác minh quyền hạn lúc này. Vui lòng thử lại sau.
        </p>
      </div>
    );
  }

  // 2. Tải dữ liệu vận hành từ Backend (Xử lý B2)
  let dashboardData = null;
  let loadError = false;

  try {
    const res = await getStaffDashboardData();
    if (res && res.success) {
      dashboardData = res;
    } else {
      loadError = true;
    }
  } catch (err) {
    loadError = true;
  }

  // 3. Render Client Component
  return (
    <OperationsDashboardClient
      initialData={dashboardData}
      loadError={loadError}
      staffEmail={authResult.staff?.email}
    />
  );
}