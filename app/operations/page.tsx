import { redirect } from "next/navigation";
import {
  verifyStaffRole,
  getStaffDashboardData,
  updateRoomStatus,
  updateTicketStatusAdmin,
  StaffAuthError,
  type RoomOperationalStatus,
  type TicketStatus,
} from "@/lib/data/admin";
import OperationsDashboardClient from "./OperationsDashboardClient";

export const metadata = {
  title: "Bảng Điều Khiển Vận Hành | Kapi Stay Concierge",
  description: "Quản trị trạng thái buồng phòng, tiếp nhận sự cố và lịch đón trả khách 24/7.",
};

export const dynamic = "force-dynamic";

export default async function OperationsDashboardPage() {
  let staffRoleInfo: { id: string; email?: string; role: "staff" | "admin" } | null = null;
  let isForbidden = false;
  let isBackendError = false;

  try {
    staffRoleInfo = await verifyStaffRole();
  } catch (error: unknown) {
    if (error instanceof StaffAuthError) {
      if (error.code === "UNAUTHENTICATED") {
        redirect("/login?next=/operations");
      } else if (error.code === "FORBIDDEN") {
        isForbidden = true;
      } else {
        isBackendError = true;
      }
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

  const safeEmail: string = staffRoleInfo?.email || "";

  async function handleUpdateRoomStatus(roomId: string, status: RoomOperationalStatus) {
    "use server";
    return updateRoomStatus(roomId, status);
  }

  async function handleUpdateTicketStatus(ticketId: string, status: TicketStatus) {
    "use server";
    return updateTicketStatusAdmin(ticketId, status);
  }

  return (
    <OperationsDashboardClient
      initialData={dashboardData}
      loadError={loadError}
      staffEmail={safeEmail}
      onUpdateRoomStatus={handleUpdateRoomStatus}
      onUpdateTicketStatus={handleUpdateTicketStatus}
    />
  );
}