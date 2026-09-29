import * as React from "react";
import { getAdminDashboardData, type AdminDashboardData } from "@/lib/data/admin";
import AdminDashboardClient from "@/components/admin/AdminDashboardClient";

export const metadata = {
  title: "Dashboard Quản Trị | Kapi Admin",
  description: "Bảng tổng quan chỉ số vận hành, buồng phòng và giao dịch đặt phòng Kapi Concierge.",
};

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  let dashboardData: AdminDashboardData | null = null;
  let loadError: string | null = null;

  try {
    dashboardData = await getAdminDashboardData();
  } catch (error: unknown) {
    loadError = error instanceof Error ? error.message : "Không thể tải dữ liệu bảng điều khiển.";
  }

  if (loadError || !dashboardData) {
    return (
      <div className="bg-white border border-[#E5E5E5] p-8 text-center my-6">
        <h2 className="text-base font-medium text-[#111111] mb-2">
          Không thể đồng bộ dữ liệu quản trị
        </h2>
        <p className="text-xs text-[#707072] max-w-md mx-auto mb-4">
          {loadError || "Đã xảy ra sự cố khi truy vấn cơ sở dữ liệu hoặc phân quyền RPC."}
        </p>
      </div>
    );
  }

  return <AdminDashboardClient initialData={dashboardData} />;
}
