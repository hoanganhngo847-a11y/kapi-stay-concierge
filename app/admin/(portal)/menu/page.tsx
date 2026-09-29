import * as React from "react";
import type { Metadata } from "next";
import { getAdminMenuProducts } from "@/lib/data/admin";
import { AdminMenuClient } from "@/components/admin/AdminMenuClient";

export const metadata: Metadata = {
  title: "Quản lý thực đơn | Kapi Admin Portal",
};

export const dynamic = "force-dynamic";

export default async function AdminMenuPage() {
  const res = await getAdminMenuProducts();
  const products = res.products || [];

  return <AdminMenuClient initialProducts={products} />;
}
