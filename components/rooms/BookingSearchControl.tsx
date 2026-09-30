"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, MapPin, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface PropertyOption {
  id: string;
  name: string;
}

export interface BookingSearchControlProps {
  properties?: PropertyOption[];
  className?: string;
}

export function BookingSearchControl({
  properties = [],
  className = "",
}: BookingSearchControlProps) {
  const router = useRouter();
  const [propertyId, setPropertyId] = React.useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (propertyId) {
      router.push(`/rooms?property_id=${encodeURIComponent(propertyId)}`);
    } else {
      router.push("/rooms");
    }
  };

  return (
    <form
      onSubmit={handleSearch}
      className={`w-full max-w-2xl bg-white border border-[#E5E5E5] hover:border-[#111111] focus-within:border-[#111111] transition-colors duration-200 p-2 sm:p-2.5 rounded-2xl sm:rounded-full ${className}`}
    >
      <div className="flex flex-col sm:flex-row items-center gap-3">
        {/* Chi nhánh */}
        <div className="flex-1 w-full px-4 py-1.5">
          <label className="block text-[11px] font-medium uppercase tracking-wider text-[#707072] mb-0.5">
            Chi nhánh Kapi Stay
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

        {/* CTA Button */}
        <Button
          type="submit"
          variant="primary"
          size="md"
          className="w-full sm:w-auto shrink-0 px-7 h-11 text-sm font-medium rounded-xl sm:rounded-full"
          leftIcon={<Search className="w-4 h-4" />}
          rightIcon={<ArrowRight className="w-4 h-4" />}
        >
          Khám phá phòng
        </Button>
      </div>
    </form>
  );
}

export default BookingSearchControl;
