"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { MapPin, Users, X, Filter } from "lucide-react";

export interface PropertyOption {
  id: string;
  name: string;
}

export interface RoomFiltersProps {
  properties?: PropertyOption[];
  className?: string;
}

export function RoomFilters({
  properties = [],
  className = "",
}: RoomFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Đọc trực tiếp từ URL searchParams - TUYỆT ĐỐI KHÔNG DÙNG useState
  const currentLocation = searchParams.get("property_id") || "";
  const currentGuests =
    searchParams.get("capacity") ||
    searchParams.get("max_guests") ||
    searchParams.get("guests") ||
    "";
  const currentCheckIn =
    searchParams.get("check-in") ||
    searchParams.get("checkin") ||
    searchParams.get("check_in") ||
    "";
  const currentCheckOut =
    searchParams.get("check-out") ||
    searchParams.get("checkout") ||
    searchParams.get("check_out") ||
    "";

  // Xử lý thay đổi cơ sở (property_id) đẩy thẳng lên URL
  const handleLocationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams(searchParams.toString());
    const val = e.target.value.trim();

    if (val) {
      params.set("property_id", val);
    } else {
      params.delete("property_id");
    }
    params.delete("location_code");
    params.delete("location");

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  // Xử lý thay đổi số lượng khách (capacity) đẩy thẳng lên URL
  const handleGuestsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const params = new URLSearchParams(searchParams.toString());
    const val = e.target.value.trim();

    if (val && !isNaN(Number(val)) && Number(val) > 0) {
      params.set("capacity", val);
      params.delete("max_guests");
      params.delete("guests");
    } else {
      params.delete("capacity");
      params.delete("max_guests");
      params.delete("guests");
    }

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  // Xóa bộ lọc
  const handleReset = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("property_id");
    params.delete("location_code");
    params.delete("location");
    params.delete("capacity");
    params.delete("max_guests");
    params.delete("guests");
    params.delete("checkin");
    params.delete("check_in");
    params.delete("check-in");
    params.delete("checkout");
    params.delete("check_out");
    params.delete("check-out");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const hasFilters = Boolean(
    currentLocation || currentGuests || currentCheckIn || currentCheckOut
  );

  return (
    <div
      className={`bg-white rounded-2xl border border-dark/10 p-5 sm:p-6 shadow-sm mb-8 ${className}`}
    >
      <div className="flex items-center gap-2 mb-4 text-xs font-semibold uppercase tracking-wider text-dark/60">
        <Filter className="w-3.5 h-3.5 text-primary" />
        <span>Bộ lọc tìm kiếm phòng</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
        {/* Dropdown chọn cơ sở (location) */}
        <div className="sm:col-span-7">
          <label
            htmlFor="filter-location"
            className="block text-xs font-medium text-dark/70 mb-1.5"
          >
            Cơ sở / Chi nhánh
          </label>
          <div className="relative">
            <MapPin className="w-4 h-4 text-dark/40 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              id="filter-location"
              value={currentLocation}
              onChange={handleLocationChange}
              className="w-full pl-9 pr-8 py-2.5 bg-light/50 border border-dark/15 rounded-xl text-xs sm:text-sm text-dark font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all appearance-none cursor-pointer"
            >
              <option value="">Tất cả cơ sở Kapi House</option>
              {properties.map((prop) => (
                <option key={prop.id} value={prop.id}>
                  {prop.name}
                </option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-dark/40 text-xs">
              ▼
            </div>
          </div>
        </div>

        {/* Input nhập số lượng khách (guests) */}
        <div className="sm:col-span-5">
          <label
            htmlFor="filter-guests"
            className="block text-xs font-medium text-dark/70 mb-1.5"
          >
            Số lượng khách
          </label>
          <div className="relative">
            <Users className="w-4 h-4 text-dark/40 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="filter-guests"
              type="number"
              min="1"
              max="10"
              placeholder="Nhập số khách (ví dụ: 2)"
              value={currentGuests}
              onChange={handleGuestsChange}
              className="w-full pl-9 pr-3 py-2.5 bg-light/50 border border-dark/15 rounded-xl text-xs sm:text-sm text-dark placeholder:text-dark/40 font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>
        </div>
      </div>

      {/* Hiển thị nút xóa bộ lọc khi đang có điều kiện lọc */}
      {hasFilters && (
        <div className="mt-4 pt-3 border-t border-dark/10 flex items-center justify-between">
          <span className="text-xs text-dark/60">
            Đang áp dụng bộ lọc tùy chỉnh
          </span>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>Xóa bộ lọc</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default RoomFilters;

