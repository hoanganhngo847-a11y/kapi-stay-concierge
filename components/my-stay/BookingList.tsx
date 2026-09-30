"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui";
import { BookingCard } from "./BookingCard";
import type { MyStayBookingSummary } from "@/lib/data/my-stay";

interface BookingListProps {
  bookings: MyStayBookingSummary[];
}

type TabType = "ALL" | "UPCOMING" | "ACTIVE" | "COMPLETED" | "CANCELLED";

export function BookingList({ bookings }: BookingListProps) {
  const [currentTab, setCurrentTab] = useState<TabType>("ALL");

  const counts = useMemo(() => {
    let active = 0;
    let upcoming = 0;
    let completed = 0;
    let cancelled = 0;

    for (const b of bookings) {
      if (b.stayStatus === "ACTIVE") active++;
      else if (b.stayStatus === "UPCOMING") upcoming++;
      else if (b.stayStatus === "COMPLETED") completed++;
      else if (b.stayStatus === "CANCELLED") cancelled++;
    }

    return {
      ALL: bookings.length,
      UPCOMING: upcoming,
      ACTIVE: active,
      COMPLETED: completed,
      CANCELLED: cancelled,
    };
  }, [bookings]);

  const filteredBookings = useMemo(() => {
    if (currentTab === "ALL") return bookings;
    return bookings.filter((b) => b.stayStatus === currentTab);
  }, [bookings, currentTab]);

  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: "ALL", label: "Tất cả", count: counts.ALL },
    { key: "UPCOMING", label: "Sắp tới", count: counts.UPCOMING },
    { key: "ACTIVE", label: "Đang lưu trú", count: counts.ACTIVE },
    { key: "COMPLETED", label: "Đã hoàn thành", count: counts.COMPLETED },
  ];

  if (counts.CANCELLED > 0) {
    tabs.push({ key: "CANCELLED", label: "Đã hủy", count: counts.CANCELLED });
  }

  // 1. Total empty state (user has zero bookings)
  if (bookings.length === 0) {
    return (
      <div className="bg-white border border-[#E5E5E5] p-8 sm:p-14 text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-full bg-[#F5F5F5] border border-[#E5E5E5] flex items-center justify-center text-[#707072]">
          <CalendarDays className="w-8 h-8" />
        </div>
        <div className="space-y-2 max-w-md mx-auto">
          <h2 className="text-xl sm:text-2xl font-normal text-[#111111] tracking-tight">
            Kỳ nghỉ của tôi
          </h2>
          <p className="text-sm text-[#707072] leading-relaxed">
            Bạn chưa có kỳ nghỉ nào tại Kapi Stay.
          </p>
        </div>
        <div>
          <Link href="/rooms">
            <Button variant="primary" size="md">
              Xem phòng
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <span className="text-[11px] font-medium tracking-widest uppercase text-[#707072] block mb-1">
          Quản lý đặt phòng
        </span>
        <h1 className="text-2xl sm:text-3xl font-normal text-[#111111] tracking-tight">
          Kỳ nghỉ của tôi
        </h1>
        <p className="text-xs sm:text-sm text-[#707072] mt-1.5 leading-relaxed">
          Tất cả đơn đặt phòng của tài khoản. Nhấn vào kỳ nghỉ để xem chi tiết mã khóa và hướng dẫn lưu trú.
        </p>
      </div>

      {/* Tabs Filter */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-[#E5E5E5] scrollbar-none">
        {tabs.map((tab) => {
          const isActive = currentTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setCurrentTab(tab.key)}
              className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                isActive
                  ? "bg-[#111111] text-white"
                  : "bg-[#F5F5F5] text-[#707072] hover:text-[#111111] hover:bg-[#EAEAEA]"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  isActive ? "bg-white/20 text-white" : "bg-[#E5E5E5] text-[#707072]"
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Card Grid or Filtered Empty State */}
      {filteredBookings.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredBookings.map((b) => (
            <BookingCard key={b.bookingId} booking={b} />
          ))}
        </div>
      ) : (
        <div className="bg-white border border-[#E5E5E5] p-10 text-center space-y-4">
          <p className="text-sm text-[#707072]">
            Không có kỳ nghỉ nào trong mục này.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentTab("ALL")}
          >
            Xem tất cả kỳ nghỉ
          </Button>
        </div>
      )}
    </div>
  );
}

export default BookingList;
