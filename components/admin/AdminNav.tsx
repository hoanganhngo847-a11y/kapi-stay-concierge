"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarCheck,
  UtensilsCrossed,
  Users,
  Award,
  UserCog,
  CreditCard,
  Settings,
} from "lucide-react";

interface NavItem {
  label: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  isComingSoon?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Vận hành phòng", href: "/admin", icon: LayoutDashboard },
  { label: "Menu", href: "/admin/menu", icon: UtensilsCrossed },
  { label: "Đặt phòng", icon: CalendarCheck, isComingSoon: true },
  { label: "Khách hàng", icon: Users, isComingSoon: true },
  { label: "Rewards", icon: Award, isComingSoon: true },
  { label: "Nhân sự", icon: UserCog, isComingSoon: true },
  { label: "Thanh toán", icon: CreditCard, isComingSoon: true },
  { label: "Cài đặt", icon: Settings, isComingSoon: true },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="bg-[#FAFAFA] border-b border-[#E5E5E5] overflow-x-auto scrollbar-none">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex space-x-1 sm:space-x-2 py-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            if (item.isComingSoon || !item.href) {
              return (
                <div
                  key={item.label}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#9E9EA0] cursor-not-allowed select-none whitespace-nowrap"
                  title="Tính năng dự kiến triển khai trong giai đoạn tiếp theo"
                >
                  <Icon className="w-3.5 h-3.5 text-[#CCCCCC]" />
                  <span>{item.label}</span>
                  <span className="text-[9px] uppercase px-1 py-0.2 bg-[#EFEFEF] text-[#707072] font-mono tracking-tighter">
                    Sắp có
                  </span>
                </div>
              );
            }

            const isActive =
              item.href === "/admin"
                ? pathname === "/admin" ||
                  pathname.startsWith("/admin/properties") ||
                  pathname.startsWith("/admin/rooms")
                : pathname === item.href || (item.href && pathname.startsWith(item.href + "/"));

            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors border ${
                  isActive
                    ? "bg-white text-[#111111] border-[#CCCCCC] shadow-none"
                    : "text-[#707072] hover:text-[#111111] border-transparent hover:border-[#E5E5E5]"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-[#111111]" : "text-[#707072]"}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
