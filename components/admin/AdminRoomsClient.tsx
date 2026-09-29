"use client";

import * as React from "react";
import Link from "next/link";
import {
  Search,
  Filter,
  DoorOpen,
  ArrowRight,
  Eye,
  EyeOff,
  Layers,
  Users,
  Building,
} from "lucide-react";
import type { AdminRoomListItem } from "@/lib/data/admin";
import { formatVND } from "@/lib/utils/format";

interface AdminRoomsClientProps {
  initialRooms: AdminRoomListItem[];
  properties: Array<{ id: string; name: string }>;
}

export function AdminRoomsClient({
  initialRooms,
  properties,
}: AdminRoomsClientProps) {
  const [propertyFilter, setPropertyFilter] = React.useState<string>("ALL");
  const [searchTerm, setSearchTerm] = React.useState<string>("");

  // Filtered rooms
  const filteredRooms = React.useMemo(() => {
    return initialRooms.filter((room) => {
      // Property filter
      if (propertyFilter !== "ALL" && room.property_id !== propertyFilter) {
        return false;
      }
      // Search term
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const matchesName = room.name.toLowerCase().includes(query);
        const matchesNumber = room.room_number?.toLowerCase().includes(query);
        const matchesBranch = room.property_name.toLowerCase().includes(query);
        if (!matchesName && !matchesNumber && !matchesBranch) {
          return false;
        }
      }
      return true;
    });
  }, [initialRooms, propertyFilter, searchTerm]);

  // Group rooms by property
  const groupedByProperty = React.useMemo(() => {
    const map = new Map<
      string,
      {
        property_id: string;
        property_name: string;
        property_address: string;
        rooms: AdminRoomListItem[];
      }
    >();

    for (const room of filteredRooms) {
      if (!map.has(room.property_id)) {
        map.set(room.property_id, {
          property_id: room.property_id,
          property_name: room.property_name,
          property_address: room.property_address,
          rooms: [],
        });
      }
      map.get(room.property_id)!.rooms.push(room);
    }

    return Array.from(map.values()).sort((a, b) =>
      a.property_name.localeCompare(b.property_name)
    );
  }, [filteredRooms]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#E5E5E5] pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-[#111111] tracking-tight">
            Quản Lý Phòng Nghỉ
          </h1>
          <p className="text-xs sm:text-sm text-[#707072] mt-1">
            Xem và cấu hình thông tin chi tiết, hình ảnh, tiện nghi và mã truy cập từng phòng.
          </p>
        </div>
        <div className="text-xs font-mono text-[#707072] bg-white border border-[#E5E5E5] px-3 py-1.5 self-start sm:self-auto">
          Tổng cộng: <span className="font-semibold text-[#111111]">{filteredRooms.length}</span> / {initialRooms.length} phòng
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 bg-white p-3 border border-[#E5E5E5]">
        {/* Property Selector */}
        <div className="sm:col-span-5 flex items-center gap-2">
          <Filter className="w-4 h-4 text-[#707072] shrink-0 ml-1" />
          <select
            value={propertyFilter}
            onChange={(e) => setPropertyFilter(e.target.value)}
            className="w-full text-xs bg-[#F9F9F9] border border-[#E5E5E5] text-[#111111] px-3 py-2 focus:outline-none focus:border-[#111111] transition-colors"
          >
            <option value="ALL">Tất cả chi nhánh ({properties.length})</option>
            {properties.map((prop) => (
              <option key={prop.id} value={prop.id}>
                {prop.name}
              </option>
            ))}
          </select>
        </div>

        {/* Search Input */}
        <div className="sm:col-span-7 relative flex items-center">
          <Search className="w-4 h-4 text-[#707072] absolute left-3 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo tên phòng, số phòng (VD: 101, Deluxe, HK-102)..."
            className="w-full text-xs bg-[#F9F9F9] border border-[#E5E5E5] text-[#111111] pl-9 pr-3 py-2 focus:outline-none focus:border-[#111111] transition-colors placeholder:text-[#9E9EA0]"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-3 text-xs text-[#707072] hover:text-[#111111]"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Property Groups List */}
      {groupedByProperty.length === 0 ? (
        <div className="bg-white border border-[#E5E5E5] p-12 text-center">
          <DoorOpen className="w-8 h-8 text-[#CCCCCC] mx-auto mb-3" />
          <h2 className="text-sm font-medium text-[#111111] mb-1">
            Không tìm thấy phòng phù hợp
          </h2>
          <p className="text-xs text-[#707072] max-w-sm mx-auto mb-4">
            Vui lòng thử điều chỉnh bộ lọc chi nhánh hoặc từ khóa tìm kiếm.
          </p>
          <button
            onClick={() => {
              setPropertyFilter("ALL");
              setSearchTerm("");
            }}
            className="px-4 py-2 bg-[#111111] text-white text-xs font-medium hover:bg-[#262626] transition-colors"
          >
            Xóa bộ lọc
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {groupedByProperty.map((group) => (
            <section
              key={group.property_id}
              className="bg-white border border-[#E5E5E5] overflow-hidden"
            >
              {/* Group Header */}
              <div className="bg-[#FAFAFA] border-b border-[#E5E5E5] px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <Building className="w-4 h-4 text-[#111111]" />
                    <h2 className="text-sm sm:text-base font-semibold text-[#111111]">
                      {group.property_name}
                    </h2>
                  </div>
                  {group.property_address && (
                    <p className="text-xs text-[#707072] mt-0.5">
                      {group.property_address}
                    </p>
                  )}
                </div>
                <div className="text-xs font-mono text-[#707072] bg-white border border-[#E5E5E5] px-2.5 py-1 self-start sm:self-auto">
                  {group.rooms.length} phòng
                </div>
              </div>

              {/* Rooms Grid */}
              <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {group.rooms.map((room) => {
                  const statusColors: Record<string, string> = {
                    ready: "bg-emerald-50 text-emerald-800 border-emerald-200",
                    occupied: "bg-amber-50 text-amber-800 border-amber-200",
                    cleaning: "bg-blue-50 text-blue-800 border-blue-200",
                    maintenance: "bg-rose-50 text-rose-800 border-rose-200",
                  };

                  const statusLabels: Record<string, string> = {
                    ready: "Sẵn sàng",
                    occupied: "Đang ở",
                    cleaning: "Dọn dẹp",
                    maintenance: "Bảo trì",
                  };

                  return (
                    <div
                      key={room.id}
                      className="border border-[#E5E5E5] bg-white hover:border-[#111111] transition-all flex flex-col justify-between group"
                    >
                      <div className="p-4 space-y-3">
                        {/* Top Badges */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-semibold px-2 py-0.5 bg-[#111111] text-white">
                            P.{room.room_number || "---"}
                          </span>
                          <span
                            className={`text-[10px] font-medium px-2 py-0.5 border ${
                              statusColors[room.operational_status] || "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {statusLabels[room.operational_status] || room.operational_status}
                          </span>
                        </div>

                        {/* Room Name */}
                        <div>
                          <h3 className="text-sm font-semibold text-[#111111] group-hover:text-black line-clamp-1">
                            {room.name}
                          </h3>
                          <div className="flex items-center gap-3 text-xs text-[#707072] mt-1">
                            {room.floor_number !== null && (
                              <span className="flex items-center gap-1">
                                <Layers className="w-3 h-3 text-[#9E9EA0]" />
                                Tầng {room.floor_number}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3 text-[#9E9EA0]" />
                              {room.capacity} khách
                            </span>
                          </div>
                        </div>

                        {/* Price & Visibility */}
                        <div className="pt-2 border-t border-[#F0F0F0] flex items-center justify-between text-xs">
                          <div>
                            <span className="font-semibold text-[#111111]">
                              {formatVND(room.hourly_price_vnd)}
                            </span>
                            <span className="text-[10px] text-[#707072]">/h</span>
                          </div>
                          <div>
                            {room.is_listed ? (
                              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700">
                                <Eye className="w-3 h-3" /> Hiển thị
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] text-[#707072]">
                                <EyeOff className="w-3 h-3" /> Ẩn
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Action Footer */}
                      <Link
                        href={`/admin/rooms/${room.id}`}
                        className="px-4 py-2.5 bg-[#F9F9F9] border-t border-[#E5E5E5] text-xs font-medium text-[#111111] flex items-center justify-between group-hover:bg-[#111111] group-hover:text-white transition-colors"
                      >
                        <span>Cấu hình phòng</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
