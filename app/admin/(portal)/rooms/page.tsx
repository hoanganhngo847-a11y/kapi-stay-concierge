import * as React from "react";
import type { Metadata } from "next";
import { getAdminRooms } from "@/lib/data/admin";
import { getActiveProperties } from "@/lib/data/rooms";
import { AdminRoomsClient } from "@/components/admin/AdminRoomsClient";

export const metadata: Metadata = {
  title: "Quản lý phòng | Kapi Admin Portal",
};

export const dynamic = "force-dynamic";

export default async function AdminRoomsPage() {
  const [roomsRes, propertiesRes] = await Promise.all([
    getAdminRooms(),
    getActiveProperties(),
  ]);

  const rooms = roomsRes.rooms || [];
  const properties = (propertiesRes.data || []).map((p) => ({
    id: p.id,
    name: p.name,
  }));

  return (
    <AdminRoomsClient initialRooms={rooms} properties={properties} />
  );
}
