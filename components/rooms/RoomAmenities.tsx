import * as React from "react";
import {
  Wifi,
  Wind,
  KeyRound,
  Tv,
  UtensilsCrossed,
  Bath,
  Mountain,
  CheckCircle2,
  Sparkles,
} from "lucide-react";

export interface RoomAmenitiesProps {
  amenities: string[];
}

/**
 * Maps amenity string to a semantic Lucide icon based on keyword matching (case-insensitive).
 */
function getAmenityIcon(
  label: string
): React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }> {
  const normalized = label.toLowerCase();

  if (normalized.includes("wifi") || normalized.includes("mạng")) {
    return Wifi;
  }
  if (normalized.includes("điều hòa") || normalized.includes("máy lạnh")) {
    return Wind;
  }
  if (
    normalized.includes("khóa") ||
    normalized.includes("check-in") ||
    normalized.includes("mã số")
  ) {
    return KeyRound;
  }
  if (
    normalized.includes("tivi") ||
    normalized.includes("tv") ||
    normalized.includes("máy chiếu")
  ) {
    return Tv;
  }
  if (
    normalized.includes("bếp") ||
    normalized.includes("nấu") ||
    normalized.includes("tủ lạnh")
  ) {
    return UtensilsCrossed;
  }
  if (
    normalized.includes("tắm") ||
    normalized.includes("nước nóng") ||
    normalized.includes("bồn tắm")
  ) {
    return Bath;
  }
  if (
    normalized.includes("ban công") ||
    normalized.includes("view") ||
    normalized.includes("thung lũng")
  ) {
    return Mountain;
  }

  return CheckCircle2;
}

export function RoomAmenities({ amenities }: RoomAmenitiesProps) {
  const validAmenities = Array.isArray(amenities)
    ? amenities
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item): item is string => item.length > 0)
    : [];

  if (validAmenities.length === 0) {
    return (
      <section aria-labelledby="room-amenities-heading" className="space-y-3 pt-2">
        <h2 id="room-amenities-heading" className="text-lg font-medium text-[#111111]">
          Tiện nghi phòng
        </h2>
        <div className="p-4 border border-[#E5E5E5] text-xs sm:text-sm text-[#707072] flex items-center gap-2.5">
          <Sparkles className="w-4 h-4 text-[#111111] shrink-0" aria-hidden="true" />
          <span>Tiện nghi tiêu chuẩn đầy đủ theo quy chuẩn Kapi Stay.</span>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="room-amenities-heading" className="space-y-4 pt-2">
      <h2 id="room-amenities-heading" className="text-lg font-medium text-[#111111]">
        Tiện nghi phòng
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
        {validAmenities.map((amenity, idx) => {
          const Icon = getAmenityIcon(amenity);

          return (
            <div
              key={`${amenity}-${idx}`}
              className="flex items-center gap-3 p-3 border border-[#E5E5E5] text-xs sm:text-sm text-[#111111]"
            >
              <Icon className="w-4 h-4 text-[#707072] shrink-0" aria-hidden="true" />
              <span className="font-normal truncate">{amenity}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default RoomAmenities;
