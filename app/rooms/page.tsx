import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, DoorOpen, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { RoomCard } from "@/components/rooms/RoomCard";
import { RoomFilters } from "@/components/rooms/RoomFilters";
import { getPublicRooms, getActiveProperties } from "@/lib/data/rooms";
import { Reveal } from "@/components/ui/Reveal";

export const metadata = {
  title: "Danh sách phòng | Kapi Stay Concierge",
  description:
    "Khám phá các phòng homestay tự check-in 24/7 thông minh tại Kapi Stay. Riêng tư, ấm cúng và đầy đủ tiện nghi.",
};

// Đảm bảo cập nhật tức thì khi URL query parameters thay đổi
export const dynamic = "force-dynamic";

interface RoomsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function RoomsPage({ searchParams }: RoomsPageProps) {
  const resolvedParams = (await searchParams) || {};

  // Chỉ đọc property_id từ query parameters. Bỏ qua hoàn toàn các query parameters ngày/giờ/khách cũ.
  const rawPropertyId = resolvedParams.property_id;
  const propertyId =
    typeof rawPropertyId === "string"
      ? rawPropertyId.trim()
      : Array.isArray(rawPropertyId) && typeof rawPropertyId[0] === "string"
        ? rawPropertyId[0].trim()
        : "";

  // Lấy danh sách phòng (chỉ lọc theo property_id) và danh sách cơ sở đang hoạt động
  const [roomsRes, propertiesRes] = await Promise.all([
    getPublicRooms({
      property_id: propertyId || undefined,
    }),
    getActiveProperties(),
  ]);

  const roomsList = roomsRes.data || [];
  const roomsError = roomsRes.error;
  const propertiesList = propertiesRes.data || [];
  const propertiesError = propertiesRes.error;

  const loadError = roomsError || propertiesError;
  if (loadError) {
    console.error("[RoomsPage] Lỗi tải dữ liệu phòng từ Supabase:", loadError);
  }

  const activeProperty = propertiesList.find((p) => p.id === propertyId);
  const activePropertyName = activeProperty?.name;

  return (
    <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16 animate-page-entrance">
      {/* Tiêu đề & Điều hướng */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 mb-8">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#707072] hover:text-[#111111] mb-3 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Quay lại trang chủ</span>
          </Link>
          <h1 className="text-3xl sm:text-4xl font-normal text-[#111111] tracking-tight">
            Danh sách phòng theo giờ
          </h1>
          <p className="text-sm text-[#707072] mt-1.5">
            Thuê phòng theo giờ linh hoạt, tự check-in 24/7 với các chi nhánh trên toàn quốc.
          </p>
        </div>
      </div>

      {/* Bộ lọc chi nhánh RoomFilters */}
      <Suspense
        fallback={
          <div className="h-24 max-w-xl bg-[#F5F5F5] rounded-2xl animate-pulse mb-8" />
        }
      >
        <RoomFilters properties={propertiesList} />
      </Suspense>

      {/* Error State: Hiển thị khi có lỗi tải dữ liệu hoặc property_id không hợp lệ */}
      {loadError ? (
        <div className="bg-white border border-[#E5E5E5] p-8 sm:p-12 text-center max-w-lg mx-auto my-12">
          <div className="w-12 h-12 rounded-full bg-[#F5F5F5] text-rose-600 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-medium text-[#111111] mb-2">
            {loadError === "Invalid property_id"
              ? "Chi nhánh không hợp lệ"
              : "Đã xảy ra lỗi khi tải dữ liệu"}
          </h2>
          <p className="text-xs sm:text-sm text-[#707072] mb-6 leading-relaxed">
            {loadError === "Invalid property_id"
              ? "Mã chi nhánh không tồn tại trên hệ thống. Vui lòng chọn lại chi nhánh."
              : "Không thể tải dữ liệu phòng lúc này. Vui lòng thử lại."}
          </p>
          <Link href="/rooms">
            <Button variant="outline" size="sm">
              Xem tất cả chi nhánh
            </Button>
          </Link>
        </div>
      ) : (
        <>
          {/* Số lượng phòng */}
          <div className="flex items-center justify-between text-xs text-[#707072] mb-6 pb-2 border-b border-[#E5E5E5]">
            <span>
              {activePropertyName ? (
                <>
                  <strong className="text-[#111111] font-medium">{roomsList.length}</strong> phòng tại {activePropertyName}
                </>
              ) : (
                <>
                  Hiện có <strong className="text-[#111111] font-medium">{roomsList.length}</strong> phòng tại các chi nhánh Kapi Stay
                </>
              )}
            </span>
          </div>

          {/* Empty State: Hiển thị khi không tìm thấy phòng */}
          {roomsList.length === 0 ? (
            <div className="bg-white border border-[#E5E5E5] p-10 sm:p-14 text-center max-w-lg mx-auto my-12">
              <div className="w-12 h-12 rounded-full bg-[#F5F5F5] text-[#707072] flex items-center justify-center mx-auto mb-4">
                <DoorOpen className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-medium text-[#111111] mb-2">
                Chưa có phòng mở bán
              </h2>
              <p className="text-xs sm:text-sm text-[#707072] mb-6 leading-relaxed">
                {propertyId
                  ? "Chi nhánh này hiện chưa có phòng đang mở bán."
                  : "Hiện chưa có phòng nào đang mở bán trên hệ thống. Quý khách vui lòng quay lại sau."}
              </p>
              {propertyId && (
                <Link href="/rooms">
                  <Button variant="primary" size="sm">
                    Xem tất cả chi nhánh
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            /* Render danh sách phòng: Desktop 3 cols, Tablet 2 cols, Mobile 1 col */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10 sm:gap-x-8 sm:gap-y-12">
              {roomsList.map((room, idx) => {
                const bedType =
                  room.amenities.find(
                    (a) =>
                      a.toLowerCase().includes("giường") ||
                      a.toLowerCase().includes("đệm") ||
                      a.toLowerCase().includes("bed")
                  ) || "Chưa cập nhật";

                const coverImage =
                  room.image_paths && room.image_paths.length > 0
                    ? room.image_paths[0]
                    : "";

                const locationName =
                  room.property?.name ||
                  room.property?.address ||
                  "Chưa cập nhật";

                const delay = Math.min(360, idx * 60);

                return (
                  <Reveal key={room.id} delay={delay}>
                    <RoomCard
                      id={room.id}
                      coverImage={coverImage}
                      name={room.name || "Chưa cập nhật"}
                      location={locationName}
                      bedType={bedType}
                      price={room.hourly_price_vnd}
                      room={room}
                    />
                  </Reveal>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
