import * as React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert, RefreshCw } from "lucide-react";
import { verifyAdminRole, AdminAuthError } from "@/lib/data/admin";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { AdminNav } from "@/components/admin/AdminNav";
import { adminSignOutAction } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

export default async function AdminPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let adminInfo: { id: string; email?: string; role: "admin" } | null = null;
  let isForbidden = false;
  let isBackendError = false;

  try {
    adminInfo = await verifyAdminRole();
  } catch (error: unknown) {
    if (error instanceof AdminAuthError) {
      if (error.code === "UNAUTHENTICATED") {
        redirect("/admin/login");
      } else if (error.code === "FORBIDDEN") {
        isForbidden = true;
      } else {
        isBackendError = true;
      }
    } else {
      isBackendError = true;
    }
  }

  // 403 Forbidden: User is authenticated but role is NOT admin
  if (isForbidden || !adminInfo) {
    if (isBackendError) {
      return (
        <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center bg-[#FAFAFA]">
          <div className="w-12 h-12 bg-white border border-[#E5E5E5] flex items-center justify-center mb-4">
            <RefreshCw className="w-5 h-5 text-[#111111]" />
          </div>
          <h1 className="text-xl font-medium text-[#111111] mb-2">
            Lỗi kết nối xác thực
          </h1>
          <p className="text-xs text-[#707072] max-w-md mb-6 leading-relaxed">
            Hệ thống không thể kết nối tới dịch vụ xác thực phân quyền lúc này. Vui lòng thử lại sau.
          </p>
          <Link
            href="/admin/login"
            className="px-4 py-2 bg-[#111111] text-white text-xs font-medium uppercase tracking-wider hover:bg-[#262626] transition-colors"
          >
            Thử lại
          </Link>
        </div>
      );
    }

    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center bg-[#FAFAFA]">
        <div className="w-12 h-12 bg-white border border-[#E5E5E5] flex items-center justify-center mb-4">
          <ShieldAlert className="w-5 h-5 text-[#111111]" />
        </div>
        <h1 className="text-xl font-medium text-[#111111] mb-2">
          403 — Quyền Quản Trị Viên Bị Từ Chối
        </h1>
        <p className="text-xs text-[#707072] max-w-md mb-6 leading-relaxed">
          Tài khoản của bạn không có quyền Quản trị viên (admin) để truy cập cổng thông tin này. Vui lòng đăng nhập bằng tài khoản quản trị được cấp quyền trong hệ thống.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <form action={adminSignOutAction}>
            <button
              type="submit"
              className="px-4 py-2 bg-[#111111] text-white text-xs font-medium uppercase tracking-wider hover:bg-[#262626] transition-colors"
            >
              Đăng nhập tài khoản khác
            </button>
          </form>
          <Link
            href="/"
            className="px-4 py-2 bg-white border border-[#E5E5E5] text-[#111111] text-xs font-medium hover:bg-[#F5F5F5] transition-colors"
          >
            Về trang chủ Kapi
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9F9F9] flex flex-col">
      <AdminHeader adminEmail={adminInfo.email} />
      <AdminNav />
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
