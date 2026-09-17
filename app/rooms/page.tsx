import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, DoorOpen, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/server";
import { RoomCard } from "@/components/rooms/RoomCard";
import { RoomFilters } from "@/components/rooms/RoomFilters";
import {
  SEED_ROOMS,
  SEED_PROPERTIES,
  parseAmenities,
  parseImagePaths,
  type PublicRoom,
  type PublicProperty,
} from "@/lib/data/rooms";

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
  const resolvedParams = searchParams ? await searchParams : {};

  // 1. Đọc tham số lọc từ URL: location và guests theo đúng yêu cầu
  const rawLocation = resolvedParams?.location || resolvedParams?.property_id;
  const location =
    typeof rawLocation === "string"
      ? rawLocation.trim()
      : Array.isArray(rawLocation)
        ? rawLocation[0].trim()
        : "";

  const rawGuests = resolvedParams?.guests || resolvedParams?.capacity;
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

  // 2. Fetch danh sách cơ sở từ Supabase properties để truyền vào Dropdown lọc
  let propertiesList: PublicProperty[] = SEED_PROPERTIES;
  let roomsList: PublicRoom[] = [];
  let queryError: string | null = null;

  try {
    const supabase = await createClient();

    // Query danh sách cơ sở
    const { data: propData } = await supabase
      .from("properties")
      .select("id, name, slug, address, maps_url")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (propData && propData.length > 0) {
      propertiesList = propData as PublicProperty[];
    }

    // 3. Query dữ liệu CHỈ TỪ BẢNG rooms (TUYỆT ĐỐI KHÔNG đụng tới room_operations)
    let query = supabase
      .from("rooms")
      .select(
        `
        id,
        property_id,
        name,
        description,
        nightly_price_vnd,
        capacity,
        amenities,
        image_paths,
        is_listed,
        properties (
          id,
          name,
          slug,
          address,
          maps_url
        )
      `
      )
      .eq("is_listed", true);

    // Lọc theo cơ sở (location)
    if (location) {
      query = query.eq("property_id", location);
    }

    // Lọc theo số lượng khách (guests)
    if (guests > 0) {
      query = query.gte("capacity", guests);
    }

    // Sắp xếp theo giá tiền tăng dần (khách tự chọn phòng, không can thiệp AI gợi ý hay xếp hạng)
    query = query.order("nightly_price_vnd", { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error("Lỗi truy vấn bảng rooms Supabase:", error.message);
      queryError = error.message;
    }

    if (data && data.length > 0) {
      roomsList = data.map((item) => {
        const propRaw = item.properties as unknown;
        const property = Array.isArray(propRaw)
          ? (propRaw[0] as PublicProperty | null)
          : (propRaw as PublicProperty | null);

        return {
          id: item.id,
          property_id: item.property_id,
          name: item.name,
          description: item.description,
          nightly_price_vnd: Number(item.nightly_price_vnd) || 0,
          capacity: Number(item.capacity) || 2,
          amenities: parseAmenities(item.amenities),
          image_paths: parseImagePaths(item.image_paths),
          is_listed: item.is_listed,
          property,
        };
      });
    } else {
      // Fallback danh mục phòng thực tế khi cơ sở dữ liệu cloud chưa seed dữ liệu
      let filtered = SEED_ROOMS;
      if (location) {
        filtered = filtered.filter((r) => r.property_id === location);
      }
      if (guests > 0) {
        filtered = filtered.filter((r) => r.capacity >= guests);
      }
      roomsList = filtered;
    }
  } catch (err) {
    console.error("Lỗi kết nối Supabase:", err);
    // Fallback an toàn
    let filtered = SEED_ROOMS;
    if (location) {
      filtered = filtered.filter((r) => r.property_id === location);
    }
    if (guests > 0) {
      filtered = filtered.filter((r) => r.capacity >= guests);
    }
    roomsList = filtered;
  }

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

      {/* Thông báo trạng thái lỗi kết nối (nếu có sự cố mạng) */}
      {queryError && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-800 mb-6 flex items-center justify-between">
          <span>
            Đang hiển thị danh mục phòng Kapi House từ bộ nhớ dự phòng (kết nối máy chủ: {queryError}).
          </span>
          <Link href="/rooms" className="font-semibold underline ml-2">
            Thử lại
          </Link>
        </div>
      )}

      {/* Số lượng phòng tìm thấy */}
      <div className="flex items-center justify-between text-xs text-dark/60 mb-6">
        <span>
          Tìm thấy <strong className="text-dark font-semibold">{roomsList.length}</strong> phòng khả dụng
          {activePropertyName ? ` tại "${activePropertyName}"` : ""}
          {guests > 0 ? ` (cho từ ${guests} khách)` : ""}
        </span>
      </div>

      {/* Empty State: Hiển thị khi không có phòng nào phù hợp với bộ lọc */}
      {roomsList.length === 0 ? (
        <div className="bg-white border border-dark/10 rounded-2xl p-10 sm:p-14 text-center max-w-lg mx-auto my-12 shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
            <DoorOpen className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-dark mb-2">
            Không tìm thấy phòng phù hợp
          </h2>
          <p className="text-sm text-dark/60 mb-6 leading-relaxed">
            {hasActiveFilters
              ? `Không có phòng nào đáp ứng tiêu chí lọc${activePropertyName ? ` tại "${activePropertyName}"` : ""
              }${guests > 0 ? ` cho từ ${guests} khách` : ""}. Quý khách vui lòng thử chọn cơ sở khác hoặc điều chỉnh số lượng khách.`
              : "Hiện chưa có phòng nào được mở bán trên hệ thống. Quý khách vui lòng quay lại sau."}
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
        /* Render danh sách phòng bằng component RoomCard với đầy đủ props tĩnh */
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
