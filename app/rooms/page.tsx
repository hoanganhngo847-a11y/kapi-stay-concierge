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
    "Khám phá các phòng homestay tự check-in 24/7 thông minh tại Kapi House. Riêng tư, ấm cúng và đầy đủ tiện nghi.",
};

// Đảm bảo cập nhật tức thì khi URL query parameters thay đổi
export const dynamic = "force-dynamic";

interface RoomsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function RoomsPage({ searchParams }: RoomsPageProps) {
  const resolvedParams = (await searchParams) || {};

  // Chuẩn hóa ID: Bỏ ngay lập tức việc dùng fallback location hoặc location_code gán cho property_id. Chỉ đọc property_id.
  const rawPropertyId = resolvedParams.property_id;
  const propertyId =
    typeof rawPropertyId === "string"
      ? rawPropertyId.trim()
      : Array.isArray(rawPropertyId) && typeof rawPropertyId[0] === "string"
        ? rawPropertyId[0].trim()
        : "";

  const rawCapacity =
    resolvedParams.capacity ??
    resolvedParams.max_guests ??
    resolvedParams.guests;
  const capacityStr =
    typeof rawCapacity === "string"
      ? rawCapacity.trim()
      : Array.isArray(rawCapacity) && typeof rawCapacity[0] === "string"
        ? rawCapacity[0].trim()
        : "";

  let capacity = 0;
  let capacityError: string | null = null;

  // Kiểm tra nghiêm ngặt biến capacity từ URL:
  // Tuyệt đối KHÔNG dùng parseInt lỏng lẻo (ví dụ 2abc thành 2).
  // Nếu capacityStr tồn tại, BẮT BUỘC kiểm tra nghiêm ngặt bằng Regex /^\d+$/.
  // Nếu chứa ký tự lạ (như 2abc, 2.9, abc) hoặc giá trị <= 0, chặn ngay lập tức: gán thành lỗi 'Số lượng khách không hợp lệ'.
  if (rawCapacity !== undefined && rawCapacity !== null && rawCapacity !== "") {
    if (typeof rawCapacity === "number") {
      if (!Number.isInteger(rawCapacity) || rawCapacity <= 0) {
        capacityError = "Số lượng khách không hợp lệ";
      } else {
        capacity = rawCapacity;
      }
    } else if (capacityStr) {
      if (!/^\d+$/.test(capacityStr) || parseInt(capacityStr, 10) <= 0) {
        capacityError = "Số lượng khách không hợp lệ";
      } else {
        capacity = parseInt(capacityStr, 10);
      }
    } else {
      capacityError = "Số lượng khách không hợp lệ";
    }
  }

  // Lấy tham số check-in và check-out từ URL:
  const rawCheckIn =
    resolvedParams.check_in_at ??
    resolvedParams.checkInAt ??
    resolvedParams.check_in ??
    resolvedParams["check-in"] ??
    resolvedParams.checkin;
  const checkIn =
    typeof rawCheckIn === "string"
      ? rawCheckIn.trim()
      : Array.isArray(rawCheckIn) && typeof rawCheckIn[0] === "string"
        ? rawCheckIn[0].trim()
        : "";

  const rawCheckOut =
    resolvedParams.check_out_at ??
    resolvedParams.checkOutAt ??
    resolvedParams.check_out ??
    resolvedParams["check-out"] ??
    resolvedParams.checkout;
  const checkOut =
    typeof rawCheckOut === "string"
      ? rawCheckOut.trim()
      : Array.isArray(rawCheckOut) && typeof rawCheckOut[0] === "string"
        ? rawCheckOut[0].trim()
        : "";

  // Lấy danh sách phòng trực tiếp từ hàm getPublicRooms (đã bao gồm lọc availability qua RPC) và danh sách cơ sở từ getActiveProperties
  const [roomsRes, propertiesRes] = await Promise.all([
    capacityError
      ? Promise.resolve({ data: [], error: capacityError })
      : getPublicRooms({
        property_id: propertyId || undefined,
        capacity: capacity > 0 ? capacity : undefined,
        check_in: checkIn || undefined,
        check_out: checkOut || undefined,
        check_in_at: checkIn || undefined,
        check_out_at: checkOut || undefined,
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
  const hasActiveFilters = Boolean(
    propertyId || capacity > 0 || (checkIn && checkOut)
  );
  const activePropertyName = propertiesList.find((p) => p.id === propertyId)?.name;

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

      {/* Thanh công cụ lọc RoomFilters */}
      <Suspense
        fallback={
          <div className="h-24 bg-[#F5F5F5] rounded-2xl animate-pulse mb-8" />
        }
      >
        <RoomFilters properties={propertiesList} />
      </Suspense>

      {/* Error State: Bắt buộc render khi có lỗi từ getPublicRooms hoặc getActiveProperties */}
      {loadError ? (
        <div className="bg-white border border-[#E5E5E5] p-8 sm:p-12 text-center max-w-lg mx-auto my-12">
          <div className="w-12 h-12 rounded-full bg-[#F5F5F5] text-rose-600 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-medium text-[#111111] mb-2">
            {loadError === "Số lượng khách không hợp lệ" ||
              loadError === "Vui lòng chọn đầy đủ ngày nhận và trả phòng" ||
              loadError === "Ngày nhận phòng không được nằm trong quá khứ" ||
              loadError === "Ngày check-in/check-out không hợp lệ" ||
              loadError === "Invalid property_id"
              ? loadError
              : "Đã xảy ra lỗi khi tải dữ liệu"}
          </h2>
          <p className="text-xs sm:text-sm text-[#707072] mb-6 leading-relaxed">
            {loadError === "Số lượng khách không hợp lệ" ||
              loadError === "Vui lòng chọn đầy đủ ngày nhận và trả phòng" ||
              loadError === "Ngày nhận phòng không được nằm trong quá khứ" ||
              loadError === "Ngày check-in/check-out không hợp lệ" ||
              loadError === "Invalid property_id"
              ? `${loadError}. Vui lòng kiểm tra lại bộ lọc tìm kiếm.`
              : "Không thể tải dữ liệu phòng lúc này. Vui lòng thử lại."}
          </p>
          <Link href="/rooms">
            <Button variant="outline" size="sm">
              Xóa bộ lọc và thử lại
            </Button>
          </Link>
        </div>
      ) : (
        <>
          {/* Số lượng phòng tìm thấy */}
          <div className="flex items-center justify-between text-xs text-[#707072] mb-6 pb-2 border-b border-[#E5E5E5]">
            <span>
              Tìm thấy <strong className="text-[#111111] font-medium">{roomsList.length}</strong> phòng phù hợp
              {activePropertyName ? ` tại "${activePropertyName}"` : ""}
              {capacity > 0 ? ` (từ ${capacity} khách)` : ""}
              {checkIn && checkOut ? ` (${checkIn} → ${checkOut})` : ""}
            </span>
          </div>

          {/* Empty State: Hiển thị khi không tìm thấy phòng */}
          {roomsList.length === 0 ? (
            <div className="bg-white border border-[#E5E5E5] p-10 sm:p-14 text-center max-w-lg mx-auto my-12">
              <div className="w-12 h-12 rounded-full bg-[#F5F5F5] text-[#707072] flex items-center justify-center mx-auto mb-4">
                <DoorOpen className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-medium text-[#111111] mb-2">
                Không tìm thấy phòng phù hợp
              </h2>
              <p className="text-xs sm:text-sm text-[#707072] mb-6 leading-relaxed">
                {hasActiveFilters
                  ? `Không có phòng nào đáp ứng tiêu chí lọc${
                      activePropertyName ? ` tại "${activePropertyName}"` : ""
                    }${capacity > 0 ? ` cho từ ${capacity} khách` : ""}${
                      checkIn && checkOut ? ` trong khoảng ${checkIn} → ${checkOut}` : ""
                    }. Quý khách vui lòng thử chọn chi nhánh khác hoặc điều chỉnh thời gian lưu trú.`
                  : "Không tìm thấy phòng khả dụng trên hệ thống. Quý khách vui lòng quay lại sau."}
              </p>
              {hasActiveFilters && (
                <Link href="/rooms">
                  <Button variant="primary" size="sm">
                    Xóa bộ lọc & Xem tất cả
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
                      maxGuests={room.capacity}
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
