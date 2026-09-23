"use client";

import * as React from "react";
import {
  DoorClosed,
  Sparkles,
  LogIn,
  LogOut,
  AlertCircle,
  CheckCircle2,
  Clock,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface OperationsMetrics {
  totalRooms: number;
  availableRooms: number;
  occupiedRooms: number;
  cleaningRooms: number;
  maintenanceRooms?: number;
  todayCheckIns: number;
  todayCheckOuts: number;
  activeTickets: number;
}

export interface MetricsSummaryProps {
  metrics: OperationsMetrics;
  selectedFilter?: string;
  onFilterSelect?: (filterKey: string) => void;
  className?: string;
}

export function MetricsSummary({
  metrics,
  selectedFilter,
  onFilterSelect,
  className,
}: MetricsSummaryProps) {
  const cards = [
    {
      id: "ready",
      label: "Sẵn sàng đón khách",
      value: metrics.availableRooms,
      subtext: `${metrics.totalRooms} tổng số phòng`,
      icon: CheckCircle2,
      badgeText: "Sẵn sàng",
      bgClass: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
      activeClass: "ring-2 ring-emerald-500 bg-emerald-50/50",
      iconBg: "bg-emerald-100 text-emerald-700",
    },
    {
      id: "occupied",
      label: "Đang có khách lưu trú",
      value: metrics.occupiedRooms,
      subtext: "Đang phục vụ",
      icon: DoorClosed,
      badgeText: "Có khách",
      bgClass: "bg-primary/10 text-primary-700 border-primary/20",
      activeClass: "ring-2 ring-primary bg-primary/5",
      iconBg: "bg-primary/15 text-primary-700",
    },
    {
      id: "cleaning",
      label: "Cần dọn dẹp / Chuẩn bị",
      value: metrics.cleaningRooms,
      subtext: "Chờ buồng phòng",
      icon: Sparkles,
      badgeText: "Cần dọn",
      bgClass: "bg-amber-500/10 text-amber-800 border-amber-200",
      activeClass: "ring-2 ring-amber-500 bg-amber-50/50",
      iconBg: "bg-amber-100 text-amber-800",
    },
    {
      id: "maintenance",
      label: "Bảo trì / Sửa chữa",
      value: metrics.maintenanceRooms ?? 0,
      subtext: "Cần khắc phục",
      icon: Wrench,
      badgeText: "Bảo trì",
      bgClass: "bg-rose-500/10 text-rose-800 border-rose-200",
      activeClass: "ring-2 ring-rose-500 bg-rose-50/50",
      iconBg: "bg-rose-100 text-rose-700",
    },
    {
      id: "checkins",
      label: "Nhận phòng hôm nay",
      value: metrics.todayCheckIns,
      subtext: "Lượt đến dự kiến",
      icon: LogIn,
      badgeText: "Check-in",
      bgClass: "bg-blue-500/10 text-blue-800 border-blue-200",
      activeClass: "ring-2 ring-blue-500 bg-blue-50/50",
      iconBg: "bg-blue-100 text-blue-700",
    },
    {
      id: "checkouts",
      label: "Trả phòng hôm nay",
      value: metrics.todayCheckOuts,
      subtext: "Lượt đi dự kiến",
      icon: LogOut,
      badgeText: "Check-out",
      bgClass: "bg-purple-500/10 text-purple-800 border-purple-200",
      activeClass: "ring-2 ring-purple-500 bg-purple-50/50",
      iconBg: "bg-purple-100 text-purple-700",
    },
    {
      id: "tickets",
      label: "Yêu cầu / Sự cố khách",
      value: metrics.activeTickets,
      subtext: metrics.activeTickets > 0 ? "Cần xử lý ngay" : "Không có tồn đọng",
      icon: AlertCircle,
      badgeText: "Tickets",
      bgClass: "bg-rose-500/10 text-rose-800 border-rose-200",
      activeClass: "ring-2 ring-rose-500 bg-rose-50/50",
      iconBg: "bg-rose-100 text-rose-700",
    },
  ];

  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3.5", className)}>
      {cards.map((card) => {
        const IconComponent = card.icon;
        const isSelected = selectedFilter === card.id;

        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onFilterSelect?.(card.id)}
            className={cn(
              "p-4 rounded-2xl bg-white border border-dark/10 shadow-2xs text-left transition-all duration-200",
              "hover:shadow-md hover:border-dark/20 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              isSelected ? card.activeClass : "border-dark/10"
            )}
          >
            <div className="flex items-center justify-between gap-2 mb-3">
              <div
                className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                  card.iconBg
                )}
              >
                <IconComponent className="w-5 h-5" />
              </div>
              <span
                className={cn(
                  "text-[11px] font-semibold px-2 py-0.5 rounded-full border",
                  card.bgClass
                )}
              >
                {card.badgeText}
              </span>
            </div>

            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-bold tracking-tight text-dark">
                {card.value}
              </span>
            </div>

            <p className="text-xs font-semibold text-dark/80 mt-1 line-clamp-1">
              {card.label}
            </p>

            <p className="text-[11px] text-dark/50 mt-0.5 flex items-center gap-1">
              <Clock className="w-3 h-3 shrink-0" />
              <span className="truncate">{card.subtext}</span>
            </p>
          </button>
        );
      })}
    </div>
  );
}

export default MetricsSummary;
