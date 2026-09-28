"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, MapPin, Calendar, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface PropertyOption {
  id: string;
  name: string;
}

export interface BookingSearchControlProps {
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

function getMinCheckOutDateTime(checkInStr: string): string {
  if (!checkInStr) return "";
  const d = new Date(
    checkInStr.includes("Z") || checkInStr.includes("+")
      ? checkInStr
      : `${checkInStr}:00+07:00`
  );
  if (isNaN(d.getTime())) return "";

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

export function BookingSearchControl({
  properties = [],
  className = "",
}: BookingSearchControlProps) {
  const router = useRouter();
  const minNowStr = React.useMemo(() => getCurrentDateTimeInVietnam(), []);

  const [propertyId, setPropertyId] = React.useState("");
  const [checkIn, setCheckIn] = React.useState("");
  const [checkOut, setCheckOut] = React.useState("");
  const [guests, setGuests] = React.useState("2");

  const minCheckOutStr = React.useMemo(() => {
    return checkIn ? getMinCheckOutDateTime(checkIn) : getMinCheckOutDateTime(minNowStr);
  }, [checkIn, minNowStr]);

  const handleCheckInChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCheckIn(val);

    if (val && checkOut) {
      const tIn = new Date(val).getTime();
      const tOut = new Date(checkOut).getTime();
      if (tOut - tIn < 2 * 3600 * 1000) {
        setCheckOut("");
      }
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();

    if (propertyId) params.set("property_id", propertyId);
    if (checkIn) {
      params.set("check_in", checkIn);
      params.set("check_in_at", checkIn);
    }
    if (checkOut) {
      params.set("check_out", checkOut);
      params.set("check_out_at", checkOut);
    }
    if (guests && Number(guests) > 0) {
      params.set("capacity", guests);
    }

    const query = params.toString();
    router.push(query ? `/rooms?${query}` : "/rooms");
  };

  return (
    <form
      onSubmit={handleSearch}
      className={`w-full max-w-5xl bg-white border border-[#E5E5E5] p-2 sm:p-3 rounded-3xl sm:rounded-full ${className}`}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 items-center divide-y sm:divide-y-0 sm:divide-x divide-[#E5E5E5]">
        {/* Chi nhánh */}
        <div className="px-4 py-2 sm:py-1">
          <label className="block text-[11px] font-medium uppercase tracking-wider text-[#707072] mb-0.5">
            Chi nhánh
          </label>
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#707072] shrink-0" />
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              aria-label="Chọn chi nhánh"
              className="w-full text-sm font-medium text-[#111111] bg-transparent focus:outline-none cursor-pointer truncate"
            >
              <option value="">Tất cả chi nhánh</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Nhận phòng */}
        <div className="px-4 py-2 sm:py-1">
          <label className="block text-[11px] font-medium uppercase tracking-wider text-[#707072] mb-0.5">
            Nhận phòng
          </label>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#707072] shrink-0" />
            <input
              type="datetime-local"
              min={minNowStr}
              value={checkIn}
              onChange={handleCheckInChange}
              aria-label="Thời gian nhận phòng"
              className="w-full text-sm font-medium text-[#111111] bg-transparent focus:outline-none cursor-pointer"
            />
          </div>
        </div>

        {/* Trả phòng */}
        <div className="px-4 py-2 sm:py-1">
          <label className="block text-[11px] font-medium uppercase tracking-wider text-[#707072] mb-0.5">
            Trả phòng
          </label>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#707072] shrink-0" />
            <input
              type="datetime-local"
              min={minCheckOutStr}
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
              aria-label="Thời gian trả phòng"
              className="w-full text-sm font-medium text-[#111111] bg-transparent focus:outline-none cursor-pointer"
            />
          </div>
        </div>

        {/* Khách & CTA Button */}
        <div className="px-4 py-2 sm:py-1 flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-[#707072] mb-0.5">
              Số khách
            </label>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#707072] shrink-0" />
              <select
                value={guests}
                onChange={(e) => setGuests(e.target.value)}
                aria-label="Số lượng khách"
                className="w-full text-sm font-medium text-[#111111] bg-transparent focus:outline-none cursor-pointer"
              >
                <option value="1">1 khách</option>
                <option value="2">2 khách</option>
                <option value="3">3 khách</option>
                <option value="4">4+ khách</option>
              </select>
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="md"
            className="shrink-0 px-6 h-11 text-sm font-medium"
            leftIcon={<Search className="w-4 h-4" />}
          >
            Tìm phòng
          </Button>
        </div>
      </div>
    </form>
  );
}
