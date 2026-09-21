import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, DoorOpen } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { RoomCard } from "@/components/rooms/RoomCard";
import { RoomFilters } from "@/components/rooms/RoomFilters";
import { getPublicRooms, getActiveProperties } from "@/lib/data/rooms";

export const metadata = {
  title: "Danh sách phòng | Kapi Stay Concierge",
  description:
    "Khám phá các phòng homestay tự check-in 24/7 thông minh tại Kapi House. Riêng tư, ấm cúng và đầy đủ tiện nghi.",
};

// Đảm bảo cập nhật tức thì khi URL query parameters thay đổi
export const dynamic = "force-dynamic";

interface RoomsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function RoomsPage({ searchParams }: RoomsPageProps) {
  const resolvedParams = (await searchParams) || {};

  // Lấy danh sách phòng trực tiếp từ hàm getPublicRooms và danh sách cơ sở từ getActiveProperties
  const [{ data: roomsList = [] }, { data: propertiesList = [] }] =
    await Promise.all([
      getPublicRooms(resolvedParams),
      getActiveProperties(),
    ]);

  const rawLocation =
    resolvedParams.location_code ||
    resolvedParams.location ||
    resolvedParams.property_id;
  const location =
    typeof rawLocation === "string"
      ? rawLocation.trim()
      : Array.isArray(rawLocation)
        ? rawLocation[0].trim()
        : "";

  const rawGuests =
    resolvedParams.max_guests ||
    resolvedParams.guests ||
    resolvedParams.capacity;
  const guestsStr =
    typeof rawGuests === "string"
      ? rawGuests.trim()
      : Array.isArray(rawGuests)
        ? rawGuests[0].trim()
        : "";
  const guests =
    guestsStr && !isNaN(parseInt(guestsStr, 10))
      ? parseInt(guestsStr, 10)
      : 0;

  const hasActiveFilters = Boolean(location || guests > 0);
  const activePropertyName = propertiesList.find((p) => p.id === location)?.name;

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      {/* Tiêu đề & Điều hướng */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-dark/60 hover:text-primary mb-2 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Quay lại trang chủ</span>
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold text-dark tracking-tight">
            Danh sách phòng tại Kapi House
          </h1>
          <p className="text-sm text-dark/60 mt-1">
            Tất cả các phòng đều được trang bị hệ thống tự check-in 24/7 bằng mã khóa riêng biệt.
          </p>
        </div>
      </div>

      {/* Thanh công cụ lọc RoomFilters */}
      <Suspense
        fallback={
          <div className="h-28 bg-dark/5 rounded-2xl animate-pulse mb-8" />
        }
      >
        <RoomFilters properties={propertiesList} />
      </Suspense>

      {/* Số lượng phòng tìm thấy */}
      <div className="flex items-center justify-between text-xs text-dark/60 mb-6">
        <span>
          Tìm thấy <strong className="text-dark font-semibold">{roomsList.length}</strong> phòng phù hợp
          {activePropertyName ? ` tại "${activePropertyName}"` : ""}
          {guests > 0 ? ` (cho từ ${guests} khách)` : ""}
        </span>
      </div>

      {/* Empty State: Hiển thị khi không tìm thấy phòng */}
      {roomsList.length === 0 ? (
        <div className="bg-white border border-dark/10 rounded-2xl p-10 sm:p-14 text-center max-w-lg mx-auto my-12 shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
            <DoorOpen className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-dark mb-2">
            Không tìm thấy phòng
          </h2>
          <p className="text-sm text-dark/60 mb-6 leading-relaxed">
            {hasActiveFilters
              ? `Không có phòng nào đáp ứng tiêu chí lọc${activePropertyName ? ` tại "${activePropertyName}"` : ""
              }${guests > 0 ? ` cho từ ${guests} khách` : ""
              }. Quý khách vui lòng thử chọn cơ sở khác hoặc điều chỉnh số lượng khách.`
              : "Không tìm thấy phòng phù hợp trên hệ thống. Quý khách vui lòng quay lại sau."}
          </p>
          {hasActiveFilters && (
            <Link href="/rooms">
              <Button variant="outline" size="sm">
                Xóa bộ lọc & Xem tất cả phòng
              </Button>
            </Link>
          )}
        </div>
      ) : (
        /* Render danh sách phòng bằng component RoomCard */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {roomsList.map((room) => {
            const bedType =
              room.amenities.find(
                (a) =>
                  a.toLowerCase().includes("giường") ||
                  a.toLowerCase().includes("đệm") ||
                  a.toLowerCase().includes("bed")
              ) || "1 Giường đôi King size";

            const coverImage =
              room.image_paths && room.image_paths.length > 0
                ? room.image_paths[0]
                : "/rooms/japan-t4.jpg";

            const locationName =
              room.property?.name ||
              room.property?.address ||
              "Kapi House Hải Phòng";

            return (
              <RoomCard
                key={room.id}
                id={room.id}
                coverImage={coverImage}
                name={room.name}
                location={locationName}
                maxGuests={room.capacity}
                bedType={bedType}
                price={room.nightly_price_vnd}
                room={room}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
