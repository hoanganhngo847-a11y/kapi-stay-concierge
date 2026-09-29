import Link from "next/link";
import { redirect } from "next/navigation";
import {
  verifyStaffRole,
  StaffAuthError,
} from "@/lib/data/admin";

export const metadata = {
  title: "Vận Hành | Kapi Stay Concierge",
  description: "Trang vận hành hệ thống Kapi Stay.",
};

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  let staffRoleInfo: { id: string; email?: string; role: "staff" | "admin" } | null = null;
  let isForbidden = false;

  try {
    staffRoleInfo = await verifyStaffRole();
  } catch (error: unknown) {
    if (error instanceof StaffAuthError) {
      if (error.code === "UNAUTHENTICATED") {
        redirect("/admin/login");
      } else if (error.code === "FORBIDDEN") {
        isForbidden = true;
      }
    } else {
      isForbidden = true;
    }
  }

  // 1. If admin visits /operations -> redirect to canonical unified admin portal
  if (staffRoleInfo?.role === "admin") {
    redirect("/admin");
  }

  // 2. If customer (no staff_roles) -> 403 Forbidden
  if (isForbidden || !staffRoleInfo) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <h1 className="text-4xl font-bold text-red-600 mb-2">403 - Cấm truy cập</h1>
        <p className="text-gray-600 mb-4">
          Tài khoản của bạn không có quyền truy cập trang này.
        </p>
      </div>
    );
  }

  // 3. For staff role: Operations UI is sunset / consolidated into Admin Portal.
  // DO NOT give staff admin access. Display informative notice.
  return (
    <div className="max-w-2xl mx-auto my-16 p-8 bg-white border border-[#E5E5E5] text-center">
      <div className="w-12 h-12 bg-[#F5F5F5] border border-[#E5E5E5] flex items-center justify-center mx-auto mb-4 text-[#111111] font-semibold text-lg">
        !
      </div>
      <h1 className="text-lg font-semibold text-[#111111] mb-2">
        Giao diện Vận hành đã được hợp nhất
      </h1>
      <p className="text-xs text-[#707072] leading-relaxed mb-6">
        Giao diện vận hành độc lập (/operations) đã được hợp nhất vào Kapi Admin Portal.
        Tài khoản Staff hiện tại không có quyền truy cập trực tiếp vào Kapi Admin Portal.
        Vui lòng liên hệ Quản trị viên (Admin) nếu bạn cần được cấp quyền quản trị.
      </p>
      <div className="flex justify-center gap-3">
        <Link
          href="/"
          className="px-4 py-2 bg-[#111111] text-white text-xs font-medium uppercase tracking-wider hover:bg-[#262626] transition-colors"
        >
          Trang chủ
        </Link>
      </div>
    </div>
  );
}