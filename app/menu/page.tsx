import type { Metadata } from "next";
import { getMenuProducts } from "@/lib/data/menu";
import { MenuClient } from "./MenuClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Menu Kapi — Đồ Ăn & Thức Uống | Kapi Stay Concierge",
  description:
    "Thực đơn nước uống, đồ ăn vặt và đồ ăn chính phục vụ tại phòng cho kỳ nghỉ của bạn tại Kapi Stay Concierge.",
  openGraph: {
    title: "Menu Kapi — Đồ Ăn & Thức Uống | Kapi Stay Concierge",
    description:
      "Thực đơn nước uống, đồ ăn vặt và đồ ăn chính phục vụ tại phòng cho kỳ nghỉ của bạn tại Kapi Stay Concierge.",
  },
};

export default async function MenuPage() {
  const { data: products } = await getMenuProducts();

  return <MenuClient initialProducts={products} />;
}
