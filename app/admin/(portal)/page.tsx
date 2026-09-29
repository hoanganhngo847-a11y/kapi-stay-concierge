import * as React from "react";
import { getAdminPropertyOverview, type AdminPropertyOverviewItem } from "@/lib/data/admin";
import AdminPropertyOverviewClient from "@/components/admin/AdminPropertyOverviewClient";

export const metadata = {
  title: "Vận Hành Buồng Phòng | Kapi Admin",
  description: "Tổng quan vận hành chi nhánh, tình trạng phòng và điều phối lịch lưu trú Kapi Concierge.",
};

export const dynamic = "force-dynamic";

export default async function AdminOperationsPage() {
  let properties: AdminPropertyOverviewItem[] = [];
  let loadError: string | null = null;

  try {
    const res = await getAdminPropertyOverview();
    if (res.success && res.properties) {
      properties = res.properties;
    } else {
      loadError = res.error || "Không thể tải danh sách chi nhánh.";
    }
  } catch (error: unknown) {
    loadError = error instanceof Error ? error.message : "Không thể tải dữ liệu chi nhánh.";
  }

  if (loadError && properties.length === 0) {
    return (
      <div className="bg-white border border-[#E5E5E5] p-8 text-center my-6">
        <h2 className="text-base font-medium text-[#111111] mb-2">
          Không thể đồng bộ dữ liệu chi nhánh
        </h2>
        <p className="text-xs text-[#707072] max-w-md mx-auto mb-4">
          {loadError || "Đã xảy ra sự cố khi truy vấn cơ sở dữ liệu hoặc phân quyền RPC."}
        </p>
      </div>
    );
  }

  return <AdminPropertyOverviewClient initialProperties={properties} />;
}

