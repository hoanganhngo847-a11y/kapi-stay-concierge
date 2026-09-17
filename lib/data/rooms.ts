import { createClient } from "@/lib/supabase/server";

export interface PublicProperty {
  id: string;
  name: string;
  slug: string;
  address: string;
  maps_url: string | null;
}

export interface PublicRoom {
  id: string;
  property_id: string;
  name: string;
  description: string | null;
  nightly_price_vnd: number;
  capacity: number;
  amenities: string[];
  image_paths: string[];
  is_listed: boolean;
  property: PublicProperty | null;
}

// 4 Chi nhánh chính thức của Kapi House từ https://kapihouse.com/
export const SEED_PROPERTIES: PublicProperty[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Kapi House — 96 Nguyễn Đức Cảnh",
    slug: "kapi-house-nguyen-duc-canh",
    address: "96 Nguyễn Đức Cảnh (Ngõ Đặng Kim Nở), Lê Chân, Hải Phòng",
    maps_url: "https://maps.google.com/?q=96+Nguyen+Duc+Canh+Hai+Phong",
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    name: "Kapi House — 193 Văn Cao",
    slug: "kapi-house-van-cao",
    address: "193 Văn Cao, Ngô Quyền, Hải Phòng",
    maps_url: "https://maps.google.com/?q=193+Van+Cao+Hai+Phong",
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    name: "Kapi House — Lô 7C Lê Hồng Phong",
    slug: "kapi-house-le-hong-phong",
    address: "Lô 7C Lê Hồng Phong, Ngô Quyền, Hải Phòng",
    maps_url: "https://maps.google.com/?q=Lo+7C+Le+Hong+Phong+Hai+Phong",
  },
  {
    id: "44444444-4444-4444-4444-444444444444",
    name: "Kapi House — Ngõ 14 Cầu Đất",
    slug: "kapi-house-cau-dat",
    address: "Ngõ 14 Cầu Đất, Ngô Quyền, Hải Phòng",
    maps_url: "https://maps.google.com/?q=Ngo+14+Cau+Dat+Hai+Phong",
  },
];

// Danh sách phòng và giá chuẩn lấy trực tiếp từ hệ thống https://kapihouse.com/
// Ảnh phòng đã được xử lý cắt bỏ phần bảng giá ở đầu ảnh, hiển thị hình ảnh nội thất thực tế sắc nét
export const SEED_ROOMS: PublicRoom[] = [
  // Cơ sở 1: Nguyễn Đức Cảnh
  {
    id: "a1111111-1111-1111-1111-111111111111",
    property_id: "11111111-1111-1111-1111-111111111111",
    name: "Phòng Japan T4",
    description:
      "Phong cách Nhật Bản tối giản, ấm cúng dành cho cặp đôi với máy chiếu phim HD và hệ thống self-checkin riêng tư 24/7.",
    nightly_price_vnd: 250000,
    capacity: 2,
    amenities: [
      "Máy chiếu phim HD",
      "Self-checkin 24/7",
      "Điều hòa 2 chiều",
      "Wifi tốc độ cao",
      "Nước nóng 24/7",
    ],
    image_paths: ["/rooms/japan-t4.jpg"],
    is_listed: true,
    property: SEED_PROPERTIES[0],
  },
  {
    id: "b2222222-2222-2222-2222-222222222222",
    property_id: "11111111-1111-1111-1111-111111111111",
    name: "Phòng Boho T4",
    description:
      "Phong cách Bohemian phóng khoáng, góc check-in sống ảo cực chill cùng máy chiếu xem phim không giới hạn.",
    nightly_price_vnd: 250000,
    capacity: 2,
    amenities: [
      "Phong cách Bohemian",
      "Máy chiếu phim",
      "Khóa số thông minh",
      "Nước nóng 24/7",
      "Wifi tốc độ cao",
    ],
    image_paths: ["/rooms/boho-t4.jpg"],
    is_listed: true,
    property: SEED_PROPERTIES[0],
  },
  {
    id: "c3333333-3333-3333-3333-333333333333",
    property_id: "11111111-1111-1111-1111-111111111111",
    name: "Phòng Navy T2",
    description:
      "Tone xanh Navy hiện đại, mát mẻ với không gian nghỉ ngơi thư giãn tiện nghi trung tâm Hải Phòng.",
    nightly_price_vnd: 300000,
    capacity: 2,
    amenities: [
      "Tone Navy hiện đại",
      "Máy chiếu phim",
      "Tự check-in khóa điện tử",
      "Điều hòa mát sâu",
      "Wifi",
    ],
    image_paths: ["/rooms/navy-t2.jpg"],
    is_listed: true,
    property: SEED_PROPERTIES[0],
  },
  {
    id: "d4444444-4444-4444-4444-444444444444",
    property_id: "11111111-1111-1111-1111-111111111111",
    name: "Phòng Bloom T3",
    description:
      "Không gian ngập tràn sắc hoa lãng mạn, trang bị máy chiếu màn hình lớn và hệ thống khóa số riêng biệt.",
    nightly_price_vnd: 330000,
    capacity: 2,
    amenities: [
      "Máy chiếu màn hình lớn",
      "View thoáng mát",
      "Khóa cửa số",
      "Nước nóng 24/7",
    ],
    image_paths: ["/rooms/bloom-t3.jpg"],
    is_listed: true,
    property: SEED_PROPERTIES[0],
  },

  // Cơ sở 2: Văn Cao
  {
    id: "e5555555-5555-5555-5555-555555555555",
    property_id: "22222222-2222-2222-2222-222222222222",
    name: "Phòng Tropical T3",
    description:
      "Không gian nhiệt đới xanh mát tại phố Tây Văn Cao sầm uất, máy chiếu phim rạp tại gia và self-checkin 24/7.",
    nightly_price_vnd: 320000,
    capacity: 2,
    amenities: [
      "Phong cách Tropical",
      "Máy chiếu phim rạp",
      "Khu phố Tây Văn Cao",
      "Tự nhận phòng 24/7",
    ],
    image_paths: ["/rooms/tropical-t3.jpg"],
    is_listed: true,
    property: SEED_PROPERTIES[1],
  },
  {
    id: "f6666666-6666-6666-6666-666666666666",
    property_id: "22222222-2222-2222-2222-222222222222",
    name: "Phòng Latte T5",
    description:
      "Tone nâu cà phê Latte ấm cúng, thiết kế tinh tế với bồn tắm ngâm thư giãn và máy chiếu Full HD.",
    nightly_price_vnd: 350000,
    capacity: 2,
    amenities: [
      "Bồn tắm ngâm",
      "Máy chiếu Full HD",
      "Khóa số bảo mật",
      "Điều hòa 2 chiều",
    ],
    image_paths: ["/rooms/latte-t5.jpg"],
    is_listed: true,
    property: SEED_PROPERTIES[1],
  },
  {
    id: "17777777-7777-7777-7777-777777777777",
    property_id: "22222222-2222-2222-2222-222222222222",
    name: "Phòng Checker T7 (Family / Nhóm)",
    description:
      "Không gian rộng rãi với họa tiết caro cá tính, sức chứa đến 4 khách cho nhóm bạn trẻ hoặc gia đình nhỏ.",
    nightly_price_vnd: 350000,
    capacity: 4,
    amenities: [
      "Sức chứa 4 khách",
      "Không gian rộng rãi",
      "Máy chiếu phim lớn",
      "Bếp nấu tiện lợi",
    ],
    image_paths: ["/rooms/checker-t7.jpg"],
    is_listed: true,
    property: SEED_PROPERTIES[1],
  },

  // Cơ sở 3: Lê Hồng Phong
  {
    id: "28888888-8888-8888-8888-888888888888",
    property_id: "33333333-3333-3333-3333-333333333333",
    name: "Phòng Ocean T6",
    description:
      "Hơi thở đại dương với bồn tắm sang trọng, view trung tâm Lê Hồng Phong và máy chiếu rạp phim sắc nét.",
    nightly_price_vnd: 380000,
    capacity: 2,
    amenities: [
      "Bồn tắm thư giãn",
      "Máy chiếu rạp",
      "View đường lớn",
      "Self-checkin 24/7",
    ],
    image_paths: ["/rooms/ocean-t6.jpg"],
    is_listed: true,
    property: SEED_PROPERTIES[2],
  },
  {
    id: "39999999-9999-9999-9999-999999999999",
    property_id: "33333333-3333-3333-3333-333333333333",
    name: "Phòng Vinyl T4",
    description:
      "Phòng cao cấp phong cách đĩa than cổ điển kết hợp hiện đại, bồn tắm ngâm cùng máy chiếu chuẩn điện ảnh.",
    nightly_price_vnd: 400000,
    capacity: 2,
    amenities: [
      "Thiết kế Retro Vinyl",
      "Bồn tắm ngâm",
      "Máy chiếu phim chuẩn rạp",
      "Khóa số thông minh",
    ],
    image_paths: ["/rooms/vinyl-t4.jpg"],
    is_listed: true,
    property: SEED_PROPERTIES[2],
  },

  // Cơ sở 4: Cầu Đất
  {
    id: "4aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    property_id: "44444444-4444-4444-4444-444444444444",
    name: "Phòng Vani T5",
    description:
      "Tọa lạc tại ngõ ẩm thực Cầu Đất trung tâm, tone màu kem vani ngọt ngào lãng mạn cho kỳ nghỉ của bạn.",
    nightly_price_vnd: 330000,
    capacity: 2,
    amenities: [
      "Trung tâm ẩm thực Cầu Đất",
      "Máy chiếu phim",
      "Tự check-in 24/7",
      "Nước nóng 24/7",
    ],
    image_paths: ["/rooms/vani-t5.jpg"],
    is_listed: true,
    property: SEED_PROPERTIES[3],
  },
  {
    id: "5bbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    property_id: "44444444-4444-4444-4444-444444444444",
    name: "Phòng Capy T3",
    description:
      "Mang linh vật chú chuột Capybara đáng yêu của Kapi House, góc chụp ảnh dễ thương và máy chiếu phim chill.",
    nightly_price_vnd: 330000,
    capacity: 2,
    amenities: [
      "Concept Capybara",
      "Máy chiếu xem phim",
      "Khóa cửa điện tử",
      "Trà & cà phê miễn phí",
    ],
    image_paths: ["/rooms/capy-t3.jpg"],
    is_listed: true,
    property: SEED_PROPERTIES[3],
  },
  {
    id: "6ccccccc-cccc-cccc-cccc-cccccccccccc",
    property_id: "44444444-4444-4444-4444-444444444444",
    name: "Phòng Woody T3",
    description:
      "Nội thất gỗ mộc mạc ấm cúng, bồn tắm ngâm thư giãn và máy chiếu công nghệ cao chuẩn rạp.",
    nightly_price_vnd: 350000,
    capacity: 2,
    amenities: [
      "Nội thất gỗ tự nhiên",
      "Máy chiếu công nghệ cao",
      "Bồn tắm ngâm",
      "Self-checkin 24/7",
    ],
    image_paths: ["/rooms/woody-t3.jpg"],
    is_listed: true,
    property: SEED_PROPERTIES[3],
  },
];

/**
 * Defensively extracts an array of amenity strings from unknown database values.
 */
export function parseAmenities(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter(
      (item): item is string => typeof item === "string" && item.trim().length > 0
    );
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item): item is string => typeof item === "string" && item.trim().length > 0
        );
      }
    } catch {
      return [raw.trim()];
    }
  }
  return [];
}

/**
 * Defensively extracts image path strings from unknown database values.
 */
export function parseImagePaths(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter(
      (item): item is string => typeof item === "string" && item.trim().length > 0
    );
  }
  return [];
}

export interface RoomCatalogFilters {
  propertyId?: string;
  capacity?: number;
  checkIn?: string;
  checkOut?: string;
}

/**
 * Fetches all listed rooms from public catalog joined with their property details.
 * Supports optional filters by propertyId, minimum capacity, and stay dates.
 * Strictly uses public RLS via standard server client (no service_role).
 */
export async function getPublicRooms(filters?: RoomCatalogFilters): Promise<{
  data: PublicRoom[] | null;
  error: string | null;
}> {
  try {
    const supabase = await createClient();

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

    if (filters?.propertyId && filters.propertyId.trim().length > 0) {
      query = query.eq("property_id", filters.propertyId.trim());
    }

    if (filters?.capacity && filters.capacity > 0) {
      query = query.gte("capacity", filters.capacity);
    }

    // Exclude rooms with confirmed overlapping bookings for the selected date range
    if (filters?.checkIn && filters?.checkOut && filters.checkOut > filters.checkIn) {
      const { data: bookedRows } = await supabase
        .from("bookings")
        .select("room_id")
        .in("booking_status", ["confirmed", "checked_in"])
        .lt("check_in", filters.checkOut)
        .gt("check_out", filters.checkIn);

      if (bookedRows && bookedRows.length > 0) {
        const bookedRoomIds = bookedRows.map((b) => b.room_id);
        query = query.not("id", "in", `(${bookedRoomIds.join(",")})`);
      }
    }

    query = query.order("nightly_price_vnd", { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error("Error querying public rooms:", error.message);
      return { data: null, error: error.message };
    }

    // If Supabase returns records, map and return them
    if (data && data.length > 0) {
      const rooms: PublicRoom[] = data.map((item) => {
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

      return { data: rooms, error: null };
    }

    // Fallback to real Kapi House rooms from kapihouse.com when database has 0 rows
    let fallbackRooms = SEED_ROOMS;
    if (filters?.propertyId && filters.propertyId.trim().length > 0) {
      fallbackRooms = fallbackRooms.filter(
        (r) => r.property_id === filters.propertyId?.trim()
      );
    }
    if (filters?.capacity && filters.capacity > 0) {
      fallbackRooms = fallbackRooms.filter(
        (r) => r.capacity >= (filters.capacity || 0)
      );
    }

    return { data: fallbackRooms, error: null };
  } catch (err) {
    console.error("Unexpected error in getPublicRooms:", err);
    return { data: null, error: "Lỗi kết nối cơ sở dữ liệu" };
  }
}

/**
 * Fetches all active properties for filter dropdowns.
 */
export async function getActiveProperties(): Promise<{
  data: PublicProperty[] | null;
  error: string | null;
}> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("properties")
      .select("id, name, slug, address, maps_url")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      console.error("Error querying properties:", error.message);
      return { data: null, error: error.message };
    }

    if (data && data.length > 0) {
      return { data: data as PublicProperty[], error: null };
    }

    // Fallback to official Kapi House branches
    return { data: SEED_PROPERTIES, error: null };
  } catch (err) {
    console.error("Unexpected error in getActiveProperties:", err);
    return { data: null, error: "Lỗi kết nối cơ sở dữ liệu" };
  }
}

/**
 * Fetches a single public listed room by its UUID.
 * Returns null if room does not exist or is not listed.
 */
export async function getPublicRoomById(id: string): Promise<{
  data: PublicRoom | null;
  error: string | null;
}> {
  if (!id || typeof id !== "string") {
    return { data: null, error: "ID phòng không hợp lệ" };
  }

  // Check seed fallback first for instant resolution or matching fallback
  const seedRoom = SEED_ROOMS.find((r) => r.id.toLowerCase() === id.toLowerCase());

  // Defensive UUID check (32 hex characters with standard hyphenation)
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    if (seedRoom) {
      return { data: seedRoom, error: null };
    }
    return { data: null, error: "ID phòng không hợp lệ" };
  }

  try {
    const supabase = await createClient();

    const { data, error } = await supabase
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
      .eq("id", id)
      .eq("is_listed", true)
      .maybeSingle();

    if (error) {
      console.error(`Error querying room by id ${id}:`, error.message);
      if (seedRoom) {
        return { data: seedRoom, error: null };
      }
      return { data: null, error: error.message };
    }

    if (data) {
      const propRaw = data.properties as unknown;
      const property = Array.isArray(propRaw)
        ? (propRaw[0] as PublicProperty | null)
        : (propRaw as PublicProperty | null);

      const room: PublicRoom = {
        id: data.id,
        property_id: data.property_id,
        name: data.name,
        description: data.description,
        nightly_price_vnd: Number(data.nightly_price_vnd) || 0,
        capacity: Number(data.capacity) || 2,
        amenities: parseAmenities(data.amenities),
        image_paths: parseImagePaths(data.image_paths),
        is_listed: data.is_listed,
        property,
      };

      return { data: room, error: null };
    }

    // Fallback to seed room if database has 0 rows
    if (seedRoom) {
      return { data: seedRoom, error: null };
    }

    return { data: null, error: null };
  } catch (err) {
    console.error(`Unexpected error in getPublicRoomById (${id}):`, err);
    if (seedRoom) {
      return { data: seedRoom, error: null };
    }
    return { data: null, error: "Lỗi kết nối cơ sở dữ liệu" };
  }
}

