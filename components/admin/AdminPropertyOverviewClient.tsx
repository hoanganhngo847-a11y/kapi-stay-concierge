"use client";

import * as React from "react";
import Link from "next/link";
import { Building2, MapPin, Calendar, ArrowRight, Search, CheckCircle2, UserCheck, Sparkles, Wrench } from "lucide-react";
import type { AdminPropertyOverviewItem } from "@/lib/data/admin";

interface AdminPropertyOverviewClientProps {
  initialProperties: AdminPropertyOverviewItem[];
}

export default function AdminPropertyOverviewClient({
  initialProperties,
}: AdminPropertyOverviewClientProps) {
  const [search, setSearch] = React.useState("");

  const filteredProperties = React.useMemo(() => {
    if (!search.trim()) return initialProperties;
    const q = search.trim().toLowerCase();
    return initialProperties.filter(
      (p) =>
        p.property_name.toLowerCase().includes(q) ||
        p.property_address.toLowerCase().includes(q)
    );
  }, [initialProperties, search]);

  const totalRooms = initialProperties.reduce((acc, p) => acc + p.room_count, 0);
  const totalReady = initialProperties.reduce((acc, p) => acc + p.ready_count, 0);
  const totalOccupied = initialProperties.reduce((acc, p) => acc + p.occupied_count, 0);
  const totalCheckinsToday = initialProperties.reduce((acc, p) => acc + p.today_checkins, 0);
  const totalCheckoutsToday = initialProperties.reduce((acc, p) => acc + p.today_checkouts, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#E5E5E5] pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-[#111111] tracking-tight">
            VẬN HÀNH PHÒNG
          </h1>
          <p className="text-xs text-[#707072] mt-1">
            Tổng quan tình trạng buồng phòng, lượt đón trả khách hôm nay và điều phối theo từng chi nhánh.
          </p>
        </div>
      </div>

      {/* High-level system KPI bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-[#E5E5E5] p-3.5">
          <div className="text-[11px] font-medium text-[#707072] uppercase tracking-wider">
            Chi nhánh hoạt động
          </div>
          <div className="text-2xl font-semibold text-[#111111] mt-1">
            {initialProperties.length}
          </div>
          <div className="text-[11px] text-[#9E9EA0] mt-0.5">
            Tổng cộng {totalRooms} phòng
          </div>
        </div>

        <div className="bg-white border border-[#E5E5E5] p-3.5">
          <div className="text-[11px] font-medium text-[#707072] uppercase tracking-wider">
            Sẵn sàng đón khách
          </div>
          <div className="text-2xl font-semibold text-[#111111] mt-1">
            {totalReady}
          </div>
          <div className="text-[11px] text-emerald-700 mt-0.5 flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
            {totalRooms > 0 ? Math.round((totalReady / totalRooms) * 100) : 0}% công suất sẵn sàng
          </div>
        </div>

        <div className="bg-white border border-[#E5E5E5] p-3.5">
          <div className="text-[11px] font-medium text-[#707072] uppercase tracking-wider">
            Đang có khách
          </div>
          <div className="text-2xl font-semibold text-[#111111] mt-1">
            {totalOccupied}
          </div>
          <div className="text-[11px] text-[#707072] mt-0.5">
            {totalRooms > 0 ? Math.round((totalOccupied / totalRooms) * 100) : 0}% phòng đang ở
          </div>
        </div>

        <div className="bg-white border border-[#E5E5E5] p-3.5">
          <div className="text-[11px] font-medium text-[#707072] uppercase tracking-wider">
            Lịch hôm nay
          </div>
          <div className="text-2xl font-semibold text-[#111111] mt-1">
            {totalCheckinsToday} <span className="text-xs font-normal text-[#707072]">in</span> / {totalCheckoutsToday} <span className="text-xs font-normal text-[#707072]">out</span>
          </div>
          <div className="text-[11px] text-[#707072] mt-0.5">
            Giờ địa phương (Asia/Ho_Chi_Minh)
          </div>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 border border-[#E5E5E5]">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9E9EA0]" />
          <input
            type="text"
            placeholder="Tìm theo tên chi nhánh, địa chỉ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#FAFAFA] border border-[#E5E5E5] focus:outline-none focus:border-[#111111] transition-colors"
          />
        </div>
        <div className="text-xs text-[#707072] text-right">
          Hiển thị <span className="font-semibold text-[#111111]">{filteredProperties.length}</span> chi nhánh
        </div>
      </div>

      {/* Properties Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredProperties.map((property) => (
          <div
            key={property.property_id}
            className="bg-white border border-[#E5E5E5] hover:border-[#111111] transition-all flex flex-col justify-between"
          >
            {/* Card Header */}
            <div className="p-4 border-b border-[#F0F0F0]">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded bg-[#F5F5F5] border border-[#E5E5E5] flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-4 h-4 text-[#111111]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-[#111111] leading-tight">
                      {property.property_name}
                    </h3>
                    <div className="flex items-center gap-1 text-[11px] text-[#707072] mt-0.5">
                      <MapPin className="w-3 h-3 text-[#9E9EA0] flex-shrink-0" />
                      <span className="truncate max-w-[200px]" title={property.property_address}>
                        {property.property_address}
                      </span>
                    </div>
                  </div>
                </div>
                <span className="px-2 py-0.5 text-[10px] font-mono font-medium bg-[#FAFAFA] border border-[#E5E5E5] text-[#111111] whitespace-nowrap">
                  {property.room_count} phòng
                </span>
              </div>
            </div>

            {/* Room Status breakdown */}
            <div className="p-4 space-y-3 flex-1">
              <div className="grid grid-cols-4 gap-1.5 text-center">
                <div className="p-2 bg-[#F9FBF9] border border-[#E0EBE0]">
                  <div className="text-[10px] text-[#556B55] flex items-center justify-center gap-0.5">
                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                    <span>Sẵn sàng</span>
                  </div>
                  <div className="text-sm font-semibold text-[#111111] mt-0.5">
                    {property.ready_count}
                  </div>
                </div>

                <div className="p-2 bg-[#F5F5F5] border border-[#E5E5E5]">
                  <div className="text-[10px] text-[#555555] flex items-center justify-center gap-0.5">
                    <UserCheck className="w-2.5 h-2.5 text-[#111111]" />
                    <span>Có khách</span>
                  </div>
                  <div className="text-sm font-semibold text-[#111111] mt-0.5">
                    {property.occupied_count}
                  </div>
                </div>

                <div className="p-2 bg-[#FCFAF5] border border-[#EFE8D8]">
                  <div className="text-[10px] text-[#7A6B48] flex items-center justify-center gap-0.5">
                    <Sparkles className="w-2.5 h-2.5 text-amber-600" />
                    <span>Đang dọn</span>
                  </div>
                  <div className="text-sm font-semibold text-[#111111] mt-0.5">
                    {property.cleaning_count}
                  </div>
                </div>

                <div className="p-2 bg-[#FAF5F5] border border-[#EFE0E0]">
                  <div className="text-[10px] text-[#7A4848] flex items-center justify-center gap-0.5">
                    <Wrench className="w-2.5 h-2.5 text-rose-600" />
                    <span>Bảo trì</span>
                  </div>
                  <div className="text-sm font-semibold text-[#111111] mt-0.5">
                    {property.maintenance_count}
                  </div>
                </div>
              </div>

              {/* Today checkins/checkouts */}
              <div className="bg-[#FAFAFA] border border-[#EAEAEA] p-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 text-[#707072]">
                  <Calendar className="w-3.5 h-3.5 text-[#9E9EA0]" />
                  <span>Hôm nay:</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-[#111111] font-medium">
                    {property.today_checkins} Check-in
                  </span>
                  <span className="text-[#CCCCCC]">·</span>
                  <span className="text-[#111111] font-medium">
                    {property.today_checkouts} Check-out
                  </span>
                </div>
              </div>
            </div>

            {/* Action Footer */}
            <div className="p-3 bg-[#FAFAFA] border-t border-[#F0F0F0]">
              <Link
                href={`/admin/properties/${property.property_id}`}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-[#111111] hover:bg-[#2A2A2A] transition-colors"
              >
                <span>Xem lịch phòng chi nhánh</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        ))}
      </div>

      {filteredProperties.length === 0 && (
        <div className="bg-white border border-[#E5E5E5] p-12 text-center text-xs text-[#707072]">
          Không tìm thấy chi nhánh nào phù hợp với từ khóa &ldquo;{search}&rdquo;.
        </div>
      )}
    </div>
  );
}
