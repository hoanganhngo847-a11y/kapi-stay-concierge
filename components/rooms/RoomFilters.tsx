"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { MapPin, X } from "lucide-react";

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

  // Đọc trực tiếp property_id từ URL searchParams
  const currentLocation = searchParams.get("property_id") || "";

  // Xử lý thay đổi cơ sở (property_id) đẩy lên URL
  const handleLocationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value.trim();
    const params = new URLSearchParams();

    if (val) {
      params.set("property_id", val);
    }

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  // Xem tất cả chi nhánh (reset bộ lọc)
  const handleReset = () => {
    router.push(pathname, { scroll: false });
  };

  return (
    <div
      className={`bg-white border border-[#E5E5E5] p-5 sm:p-6 rounded-2xl max-w-xl mb-8 ${className}`}
    >
      <div className="flex items-center gap-2 mb-3 text-[11px] font-medium uppercase tracking-[0.2em] text-[#707072]">
        <MapPin className="w-3.5 h-3.5 text-[#111111]" />
        <span>Xem phòng theo chi nhánh</span>
      </div>

      <div>
        <label
          htmlFor="filter-property"
          className="block text-[11px] font-medium text-[#707072] uppercase tracking-wider mb-1.5"
        >
          Chi nhánh
        </label>
        <div className="relative">
          <MapPin className="w-3.5 h-3.5 text-[#707072] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <select
            id="filter-property"
            value={currentLocation}
            onChange={handleLocationChange}
            aria-label="Chọn chi nhánh"
            className="w-full pl-9 pr-8 py-2.5 bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl text-xs sm:text-sm text-[#111111] font-medium focus:outline-none focus:border-[#111111] transition-all appearance-none cursor-pointer"
          >
            <option value="">Tất cả chi nhánh</option>
            {properties.map((prop) => (
              <option key={prop.id} value={prop.id}>
                {prop.name}
              </option>
            ))}
          </select>
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#707072] text-[10px]">
            ▼
          </div>
        </div>
      </div>

      {currentLocation && (
        <div className="mt-3 pt-3 border-t border-[#E5E5E5] flex items-center justify-between">
          <span className="text-xs text-[#707072]">
            Đang lọc theo chi nhánh
          </span>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#111111] hover:underline underline-offset-4 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>Xem tất cả chi nhánh</span>
          </button>
        </div>
      )}
    </div>
  );
}

export { RoomFilters as PropertyRoomFilter };
export default RoomFilters;
