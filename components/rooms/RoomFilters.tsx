"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { MapPin, Users, X, Filter, Calendar } from "lucide-react";

export interface PropertyOption {
  id: string;
  name: string;
}

export interface RoomFiltersProps {
  properties?: PropertyOption[];
  className?: string;
}

function getCurrentDateTimeInVietnam(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function getMinCheckOutDateTime(checkInDateTimeStr: string): string {
  if (!checkInDateTimeStr) return "";
  const d = new Date(
    checkInDateTimeStr.includes("Z") || checkInDateTimeStr.includes("+")
      ? checkInDateTimeStr
      : `${checkInDateTimeStr}:00+07:00`
  );
  if (isNaN(d.getTime())) return "";
  // +2 hours
  const minOut = new Date(d.getTime() + 2 * 3600 * 1000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(minOut);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function RoomFilters({
  properties = [],
  className = "",
}: RoomFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const minCheckInStr = React.useMemo(() => getCurrentDateTimeInVietnam(), []);

  // Đọc trực tiếp từ URL searchParams
  const currentLocation = searchParams.get("property_id") || "";
  const currentGuests =
    searchParams.get("capacity") ??
    searchParams.get("max_guests") ??
    searchParams.get("guests") ??
    "";
  const currentCheckIn =
    searchParams.get("check_in_at") ??
    searchParams.get("checkInAt") ??
    searchParams.get("check_in") ??
    searchParams.get("check-in") ??
    searchParams.get("checkin") ??
    "";
  const currentCheckOut =
    searchParams.get("check_out_at") ??
    searchParams.get("checkOutAt") ??
    searchParams.get("check_out") ??
    searchParams.get("check-out") ??
    searchParams.get("checkout") ??
    "";

  // Min selectable check-out datetime (ít nhất 2 giờ sau check-in)
  const minCheckOutStr = React.useMemo(() => {
    return currentCheckIn
      ? getMinCheckOutDateTime(currentCheckIn)
      : getMinCheckOutDateTime(minCheckInStr);
  }, [currentCheckIn, minCheckInStr]);

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

  // Xử lý thay đổi thời gian nhận phòng (check_in)
  const handleCheckInChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const params = new URLSearchParams(searchParams.toString());
    const val = e.target.value.trim();

    params.delete("check-in");
    params.delete("checkin");

    if (!val) {
      params.delete("check_in");
      params.delete("check_in_at");
      params.delete("check_out");
      params.delete("check_out_at");
      params.delete("check-out");
      params.delete("checkout");
    } else {
      params.set("check_in", val);
      params.set("check_in_at", val);
      // Nếu Check-in mới khiến Check-out hiện tại < check_in + 2h, tự động xóa Check-out
      if (currentCheckOut) {
        const tIn = new Date(val).getTime();
        const tOut = new Date(currentCheckOut).getTime();
        if (tOut - tIn < 2 * 3600 * 1000) {
          params.delete("check_out");
          params.delete("check_out_at");
          params.delete("check-out");
          params.delete("checkout");
        }
      }
    }

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  // Xử lý thay đổi thời gian trả phòng (check_out)
  const handleCheckOutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const params = new URLSearchParams(searchParams.toString());
    const val = e.target.value.trim();

    params.delete("check-out");
    params.delete("checkout");

    if (!val) {
      params.delete("check_out");
      params.delete("check_out_at");
    } else {
      params.set("check_out", val);
      params.set("check_out_at", val);
    }

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  // Xử lý thay đổi số lượng khách (capacity) đẩy thẳng lên URL
  const handleGuestsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const params = new URLSearchParams(searchParams.toString());
    const val = e.target.value.trim();

    params.delete("max_guests");
    params.delete("guests");

    if (/^\d+$/.test(val) && Number(val) > 0) {
      params.set("capacity", val);
    } else {
      params.delete("capacity");
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
    params.delete("check_in");
    params.delete("check_in_at");
    params.delete("check-in");
    params.delete("checkin");
    params.delete("check_out");
    params.delete("check_out_at");
    params.delete("check-out");
    params.delete("checkout");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const hasFilters = Boolean(
    currentLocation || currentGuests || currentCheckIn || currentCheckOut
  );

  return (
    <div
      className={`bg-white border border-[#E5E5E5] p-4 sm:p-5 rounded-2xl mb-8 ${className}`}
    >
      <div className="flex items-center gap-2 mb-3 text-[11px] font-medium uppercase tracking-[0.2em] text-[#707072]">
        <Filter className="w-3.5 h-3.5 text-[#111111]" />
        <span>Bộ lọc tìm kiếm phòng theo giờ</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 items-center">
        {/* Dropdown chọn cơ sở (property_id) */}
        <div>
          <label
            htmlFor="filter-location"
            className="block text-[11px] font-medium text-[#707072] uppercase tracking-wider mb-1"
          >
            Chi nhánh
          </label>
          <div className="relative">
            <MapPin className="w-3.5 h-3.5 text-[#707072] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              id="filter-location"
              value={currentLocation}
              onChange={handleLocationChange}
              className="w-full pl-9 pr-8 py-2 bg-[#F5F5F5] border border-[#E5E5E5] rounded-full text-xs sm:text-sm text-[#111111] font-medium focus:outline-none focus:border-[#111111] transition-all appearance-none cursor-pointer"
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

        {/* Ô chọn thời gian Check-in */}
        <div>
          <label
            htmlFor="filter-checkin"
            className="block text-[11px] font-medium text-[#707072] uppercase tracking-wider mb-1"
          >
            Nhận phòng
          </label>
          <div className="relative">
            <Calendar className="w-3.5 h-3.5 text-[#707072] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="filter-checkin"
              type="datetime-local"
              min={minCheckInStr}
              value={currentCheckIn}
              onChange={handleCheckInChange}
              className="w-full pl-9 pr-3 py-2 bg-[#F5F5F5] border border-[#E5E5E5] rounded-full text-xs sm:text-sm text-[#111111] font-medium focus:outline-none focus:border-[#111111] transition-all cursor-pointer"
            />
          </div>
        </div>

        {/* Ô chọn thời gian Check-out */}
        <div>
          <label
            htmlFor="filter-checkout"
            className={`block text-[11px] font-medium uppercase tracking-wider mb-1 ${
              !currentCheckIn ? "text-[#9E9EA0]" : "text-[#707072]"
            }`}
          >
            Trả phòng (Tối thiểu 2h)
          </label>
          <div className="relative">
            <Calendar
              className={`w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none ${
                !currentCheckIn ? "text-[#9E9EA0]" : "text-[#707072]"
              }`}
            />
            <input
              id="filter-checkout"
              type="datetime-local"
              disabled={!currentCheckIn}
              min={minCheckOutStr}
              value={currentCheckIn ? currentCheckOut : ""}
              onChange={handleCheckOutChange}
              className="w-full pl-9 pr-3 py-2 bg-[#F5F5F5] border border-[#E5E5E5] rounded-full text-xs sm:text-sm text-[#111111] font-medium focus:outline-none focus:border-[#111111] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            />
          </div>
        </div>

        {/* Input nhập số lượng khách (capacity) */}
        <div>
          <label
            htmlFor="filter-guests"
            className="block text-[11px] font-medium text-[#707072] uppercase tracking-wider mb-1"
          >
            Số lượng khách
          </label>
          <div className="relative">
            <Users className="w-3.5 h-3.5 text-[#707072] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="filter-guests"
              type="number"
              min="1"
              max="10"
              placeholder="Số khách"
              value={currentGuests}
              onChange={handleGuestsChange}
              className="w-full pl-9 pr-3 py-2 bg-[#F5F5F5] border border-[#E5E5E5] rounded-full text-xs sm:text-sm text-[#111111] placeholder:text-[#707072] font-medium focus:outline-none focus:border-[#111111] transition-all"
            />
          </div>
        </div>
      </div>

      {/* Hiển thị nút xóa bộ lọc khi đang có điều kiện lọc */}
      {hasFilters && (
        <div className="mt-3 pt-3 border-t border-[#E5E5E5] flex items-center justify-between">
          <span className="text-xs text-[#707072]">
            Đang áp dụng bộ lọc tùy chỉnh
          </span>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#111111] hover:underline underline-offset-4 transition-colors cursor-pointer"
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

