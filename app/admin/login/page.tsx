import * as React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { verifyAdminRole } from "@/lib/data/admin";
import AdminLoginForm from "./AdminLoginForm";

export const metadata = {
  title: "KAPI ADMIN | Đăng nhập quản trị viên",
  description: "Cổng thông tin quản trị hệ thống Kapi Stay Concierge.",
};

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  // If user already holds valid admin session, redirect straight to /admin
  try {
    const admin = await verifyAdminRole();
    if (admin && admin.role === "admin") {
      redirect("/admin");
    }
  } catch {
    // Unauthenticated or not admin: proceed to render login form
  }

  return (
    <div className="min-h-screen bg-[#F9F9F9] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4 mb-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-[#707072] hover:text-[#111111] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Về trang chủ Kapi</span>
        </Link>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4">
        <React.Suspense fallback={<div className="h-64 flex items-center justify-center text-xs text-[#707072]">Đang tải...</div>}>
          <AdminLoginForm />
        </React.Suspense>
      </div>
    </div>
  );
}
