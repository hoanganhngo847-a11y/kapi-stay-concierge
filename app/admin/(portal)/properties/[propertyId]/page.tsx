import * as React from "react";
import { notFound } from "next/navigation";
import { getAdminPropertyRoomSchedule, type AdminPropertyScheduleData } from "@/lib/data/admin";
import AdminPropertyBoardClient from "@/components/admin/AdminPropertyBoardClient";

interface PropertyBoardPageProps {
  params: Promise<{ propertyId: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PropertyBoardPageProps) {
  const { propertyId } = await params;
  return {
    title: `Lịch Phòng Vận Hành | Kapi Admin`,
    description: `Quản trị buồng phòng, lịch đặt và F&B cho chi nhánh ${propertyId}`,
  };
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getTodayVietnamRange(): { startISO: string; endISO: string } {
  // Compute YYYY-MM-DD in Asia/Ho_Chi_Minh
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const start = new Date(`${dateStr}T00:00:00+07:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    startISO: start.toISOString(),
    endISO: end.toISOString(),
  };
}

export default async function PropertyBoardPage({ params }: PropertyBoardPageProps) {
  const { propertyId } = await params;

  if (!propertyId || !UUID_REGEX.test(propertyId)) {
    notFound();
  }

  const { startISO, endISO } = getTodayVietnamRange();

  let initialData: AdminPropertyScheduleData | null = null;
  let loadError: string | null = null;

  try {
    const res = await getAdminPropertyRoomSchedule(propertyId, startISO, endISO);
    if (res.success && res.data) {
      initialData = res.data;
    } else {
      loadError = res.error || "Không thể tải lịch phòng chi nhánh.";
    }
  } catch (err: unknown) {
    loadError = err instanceof Error ? err.message : "Lỗi hệ thống.";
  }

  if (loadError || !initialData) {
    return (
      <div className="bg-white border border-[#E5E5E5] p-8 text-center my-6">
        <h2 className="text-base font-medium text-[#111111] mb-2">
          Không thể đồng bộ lịch phòng chi nhánh
        </h2>
        <p className="text-xs text-[#707072] max-w-md mx-auto mb-4">
          {loadError || "Đã xảy ra sự cố khi truy vấn dữ liệu chi nhánh."}
        </p>
      </div>
    );
  }

  return (
    <AdminPropertyBoardClient
      initialData={initialData}
      propertyId={propertyId}
    />
  );
}
