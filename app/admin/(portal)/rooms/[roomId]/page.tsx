import * as React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAdminRoomDetail } from "@/lib/data/admin";
import { getActiveProperties } from "@/lib/data/rooms";
import { AdminRoomEditClient } from "@/components/admin/AdminRoomEditClient";

export const metadata: Metadata = {
  title: "Cấu hình phòng | Kapi Admin Portal",
};

export const dynamic = "force-dynamic";

interface AdminRoomEditPageProps {
  params: Promise<{ roomId: string }>;
}

export default async function AdminRoomEditPage({
  params,
}: AdminRoomEditPageProps) {
  const { roomId } = await params;

  const [roomRes, propertiesRes] = await Promise.all([
    getAdminRoomDetail(roomId),
    getActiveProperties(),
  ]);

  if (!roomRes.success || !roomRes.data) {
    notFound();
  }

  const properties = (propertiesRes.data || []).map((p) => ({
    id: p.id,
    name: p.name,
  }));

  return (
    <AdminRoomEditClient
      initialData={roomRes.data}
      properties={properties}
    />
  );
}
