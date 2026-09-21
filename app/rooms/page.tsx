import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, DoorOpen } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/server";
import { RoomCard } from "@/components/rooms/RoomCard";
import { RoomFilters } from "@/components/rooms/RoomFilters";
import {
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

  // 1. Đọc tham số lọc từ URL: location_code/location và max_guests/guests
  const rawLocation =
    resolvedParams?.location_code ||
    resolvedParams?.location ||
    resolvedParams?.property_id;
  const location =
    typeof rawLocation === "string"
      ? rawLocation.trim()
      : Array.isArray(rawLocation)
        ? rawLocation[0].trim()
        : "";

  const rawGuests =
    resolvedParams?.max_guests ||
    resolvedParams?.guests ||
    resolvedParams?.capacity;
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

  let propertiesList: PublicProperty[] = [];
  let roomsList: PublicRoom[] = [];

  try {
    const supabase = await createClient();

    // Query danh sách cơ sở từ bảng properties để hiển thị bộ lọc
    const { data: propData } = await supabase
      .from("properties")
      .select("id, name, slug, address, maps_url")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (propData && propData.length > 0) {
      propertiesList = propData as PublicProperty[];
    }

    // Query dữ liệu bảng rooms: supabase.from('rooms').select('*')
    // TUYỆT ĐỐI KHÔNG query bảng bookings để tránh lỗi RLS
    // Dùng .eq('location_code'), .gte('max_guests') từ tham số URL
    interface SupabaseRoomRow {
      id: string;
      property_id?: string;
      location_code?: string;
      name: string;
      description: string | null;
      nightly_price_vnd: number;
      capacity?: number;
      max_guests?: number;
      amenities: unknown;
      image_paths: unknown;
      is_listed?: boolean;
    }

    interface DynamicQueryResult {
      data: SupabaseRoomRow[] | null;
      error: { code?: string; message: string } | null;
    }

    interface DynamicQueryBuilder extends PromiseLike<DynamicQueryResult> {
      eq: (col: string, val: string | number) => DynamicQueryBuilder;
      gte: (col: string, val: string | number) => DynamicQueryBuilder;
      order: (
        col: string,
        opts: { ascending: boolean }
      ) => DynamicQueryBuilder;
    }

    interface DynamicSupabaseClient {
      from: (table: string) => {
        select: (cols: string) => DynamicQueryBuilder;
      };
    }

    const dynamicClient = supabase as unknown as DynamicSupabaseClient;
    let query = dynamicClient.from("rooms").select("*");

    // Lọc theo cơ sở (location_code) nếu có
    if (location) {
      query = query.eq("location_code", location);
    }

    // Lọc theo số lượng khách (max_guests) nếu có
    if (guests > 0) {
      query = query.gte("max_guests", guests);
    }

    // Sắp xếp theo giá phòng tăng dần
    query = query.order("nightly_price_vnd", { ascending: true });

    let { data, error } = await query;

    // Hỗ trợ database schema khi sử dụng property_id và capacity (mã lỗi 42703: column does not exist)
    if (error && error.code === "42703") {
      let dbQuery = supabase.from("rooms").select("*");
      if (location) {
        dbQuery = dbQuery.eq("property_id", location);
      }
      if (guests > 0) {
        dbQuery = dbQuery.gte("capacity", guests);
      }
      dbQuery = dbQuery.order("nightly_price_vnd", { ascending: true });
      const res = await dbQuery;
      data = res.data as SupabaseRoomRow[] | null;
      error = res.error;
    }

    if (error) {
      console.error("Lỗi truy vấn bảng rooms Supabase:", error.message);
    } else if (data && data.length > 0) {
      roomsList = data.map((item: SupabaseRoomRow) => {
        const property =
          propertiesList.find((p) => p.id === (item.property_id || item.location_code)) || null;

        return {
          id: item.id,
          property_id: item.property_id || item.location_code || "",
          name: item.name,
          description: item.description,
          nightly_price_vnd: Number(item.nightly_price_vnd) || 0,
          capacity: Number(item.capacity || item.max_guests) || 2,
          amenities: parseAmenities(item.amenities),
          image_paths: parseImagePaths(item.image_paths),
          is_listed: item.is_listed ?? true,
          property,
        };
      });
    }
  } catch (err) {
    console.error("Lỗi kết nối Supabase:", err);
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
