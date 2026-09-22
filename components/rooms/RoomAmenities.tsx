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
 * Falls back to CheckCircle2 if no keyword matches.
 */
function getAmenityIcon(
  label: string
): React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }> {
  const normalized = label.toLowerCase();

  // 1. Wifi / mạng
  if (normalized.includes("wifi") || normalized.includes("mạng")) {
    return Wifi;
  }
  // 2. Điều hòa / máy lạnh
  if (normalized.includes("điều hòa") || normalized.includes("máy lạnh")) {
    return Wind;
  }
  // 3. Khóa / check-in / mã số
  if (
    normalized.includes("khóa") ||
    normalized.includes("check-in") ||
    normalized.includes("mã số")
  ) {
    return KeyRound;
  }
  // 4. Tivi / tv / máy chiếu
  if (
    normalized.includes("tivi") ||
    normalized.includes("tv") ||
    normalized.includes("máy chiếu")
  ) {
    return Tv;
  }
  // 5. Bếp / nấu / tủ lạnh
  if (
    normalized.includes("bếp") ||
    normalized.includes("nấu") ||
    normalized.includes("tủ lạnh")
  ) {
    return UtensilsCrossed;
  }
  // 6. Tắm / nước nóng / bồn tắm
  if (
    normalized.includes("tắm") ||
    normalized.includes("nước nóng") ||
    normalized.includes("bồn tắm")
  ) {
    return Bath;
  }
  // 7. Ban công / view / thung lũng
  if (
    normalized.includes("ban công") ||
    normalized.includes("view") ||
    normalized.includes("thung lũng")
  ) {
    return Mountain;
  }

  // Default fallback icon
  return CheckCircle2;
}

/**
 * Server / Presentational component rendering the room's amenities list with semantic icons.
 */
export function RoomAmenities({ amenities }: RoomAmenitiesProps) {
  // Defensive extraction: ensure array of non-empty strings
  const validAmenities = Array.isArray(amenities)
    ? amenities
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item): item is string => item.length > 0)
    : [];

  // Empty state: gentle notice conforming to Kapi Stay standards
  if (validAmenities.length === 0) {
    return (
      <section aria-labelledby="room-amenities-heading" className="space-y-3 pt-2">
        <h2 id="room-amenities-heading" className="text-xl font-bold text-dark">
          Tiện nghi phòng
        </h2>
        <div className="p-4 rounded-xl bg-light/40 border border-dark/5 text-xs sm:text-sm text-dark/70 flex items-center gap-2.5">
          <Sparkles className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
          <span>Tiện nghi tiêu chuẩn đầy đủ theo quy chuẩn Kapi House.</span>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="room-amenities-heading" className="space-y-4 pt-2">
      <h2 id="room-amenities-heading" className="text-xl font-bold text-dark">
        Tiện nghi phòng
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {validAmenities.map((amenity, idx) => {
          const Icon = getAmenityIcon(amenity);

          return (
            <div
              key={`${amenity}-${idx}`}
              className="flex items-center gap-2.5 p-3 rounded-xl bg-light/40 border border-dark/5 text-sm text-dark/80 transition-colors hover:bg-light/60"
            >
              <Icon className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
              <span className="font-medium truncate">{amenity}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
