import { createClient } from "@/lib/supabase/server";
import { checkRoomAvailability } from "@/lib/data/bookings";

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUUID(val: unknown): val is string {
  return typeof val === "string" && UUID_REGEX.test(val.trim());
}

export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates whether a value is a valid calendar date in YYYY-MM-DD format.
 */
export function isValidCalendarDate(val: unknown): val is string {
  if (typeof val !== "string" || !DATE_REGEX.test(val.trim())) {
    return false;
  }
  const [yearStr, monthStr, dayStr] = val.trim().split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

/**
 * Lấy ngày hiện tại (YYYY-MM-DD) theo múi giờ Asia/Ho_Chi_Minh (đưa giờ về 00:00:00).
 */
export function getTodayInVietnam(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  return `${year}-${month}-${day}`;
}



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

/**
 * Defensively extracts array of amenity strings from unknown database values.
 */
export function parseAmenities(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter(
      (item): item is string => typeof item === "string" && item.trim().length > 0
    );
  }
  if (typeof raw === "string" && raw.trim().length > 0) {
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
  property_id?: string | string[];
  capacity?: number | string | string[];
  check_in?: string | string[];
  check_out?: string | string[];
  "check-in"?: string | string[];
  "check-out"?: string | string[];
  checkIn?: string | string[];
  checkOut?: string | string[];
  [key: string]: unknown;
}

/**
 * Fetches all listed rooms from public catalog joined with their property details.
 * Queries strictly the Supabase rooms table.
 * Returns empty array [] if no records exist; never uses fallback/seed data.
 */
export async function getPublicRooms(filters?: RoomCatalogFilters): Promise<{
  data: PublicRoom[];
  error: string | null;
}> {
  try {
    // =========================================================================
    // 1. VALIDATE TOÀN BỘ DỮ LIỆU ĐẦU VÀO TRƯỚC KHI TRUY VẤN DATABASE
    // Phải chặn đứng và return error ngay lập tức nếu URL sai, KHÔNG query DB.
    // =========================================================================

    // (A) Validate property_id:
    // Chuẩn hóa ID: Bỏ mọi fallback location hoặc location_code gán cho property_id. Chỉ đọc property_id.
    const rawProp = filters?.property_id;
    const propertyId =
      typeof rawProp === "string"
        ? rawProp.trim()
        : Array.isArray(rawProp) && typeof rawProp[0] === "string"
          ? rawProp[0].trim()
          : "";

    // BẮT BUỘC: Nếu có param property_id nhưng không phải UUID hợp lệ, BẮT BUỘC return ngay { data: [], error: 'Invalid property_id' }. Tuyệt đối KHÔNG silently ignore để query toàn bộ phòng (fail-open).
    if (filters?.property_id !== undefined && filters?.property_id !== null && filters?.property_id !== "") {
      if (!propertyId || !isValidUUID(propertyId)) {
        return { data: [], error: "Invalid property_id" };
      }
    }

    // (B) Validate capacity (kiểm tra nghiêm ngặt regex số nguyên dương):
    const rawCapacity =
      filters?.capacity ?? filters?.max_guests ?? filters?.guests;
    const capacityStr =
      typeof rawCapacity === "string"
        ? rawCapacity.trim()
        : Array.isArray(rawCapacity) && typeof rawCapacity[0] === "string"
          ? rawCapacity[0].trim()
          : "";

    let capacityNum = 0;
    if (rawCapacity !== undefined && rawCapacity !== null && rawCapacity !== "") {
      if (typeof rawCapacity === "number") {
        if (!Number.isInteger(rawCapacity) || rawCapacity <= 0) {
          return { data: [], error: "Số lượng khách không hợp lệ" };
        }
        capacityNum = rawCapacity;
      } else if (capacityStr) {
        if (!/^\d+$/.test(capacityStr) || parseInt(capacityStr, 10) <= 0) {
          return { data: [], error: "Số lượng khách không hợp lệ" };
        }
        capacityNum = parseInt(capacityStr, 10);
      } else {
        return { data: [], error: "Số lượng khách không hợp lệ" };
      }
    }

    // (C) Validate check-in / check-out:
    // Ưu tiên cao nhất key chuẩn (canonical) check_in và check_out. Chỉ fallback sang alias khi undefined.
    const rawCheckIn =
      filters?.check_in ??
      filters?.["check-in"] ??
      filters?.checkIn;
    const rawCheckOut =
      filters?.check_out ??
      filters?.["check-out"] ??
      filters?.checkOut;

    const checkIn =
      typeof rawCheckIn === "string"
        ? rawCheckIn.trim()
        : Array.isArray(rawCheckIn) && typeof rawCheckIn[0] === "string"
          ? rawCheckIn[0].trim()
          : "";
    const checkOut =
      typeof rawCheckOut === "string"
        ? rawCheckOut.trim()
        : Array.isArray(rawCheckOut) && typeof rawCheckOut[0] === "string"
          ? rawCheckOut[0].trim()
          : "";

    // Partial Date: Nếu URL chỉ có checkIn hoặc chỉ có checkOut (có 1 mà thiếu 1), return ngay { data: [], error: 'Vui lòng chọn đầy đủ ngày nhận và trả phòng' }. Không được bỏ qua filter.
    if ((checkIn && !checkOut) || (!checkIn && checkOut)) {
      return {
        data: [],
        error: "Vui lòng chọn đầy đủ ngày nhận và trả phòng",
      };
    }

    if (checkIn && checkOut) {
      // 1. Kiểm tra phải đúng định dạng YYYY-MM-DD và là ngày hợp lệ theo lịch
      if (!isValidCalendarDate(checkIn) || !isValidCalendarDate(checkOut)) {
        return { data: [], error: "Ngày check-in/check-out không hợp lệ" };
      }

      // 2. Quá khứ: Nếu có đủ 2 ngày hợp lệ, phải lấy ngày hiện tại (today) ép theo múi giờ Asia/Ho_Chi_Minh (đưa giờ về 00:00:00). Nếu checkIn nhỏ hơn ngày hiện tại, return ngay { data: [], error: 'Ngày nhận phòng không được nằm trong quá khứ' }.
      const todayVNStr = getTodayInVietnam();
      if (checkIn < todayVNStr) {
        return {
          data: [],
          error: "Ngày nhận phòng không được nằm trong quá khứ",
        };
      }

      // 3. Kiểm tra checkOut phải lớn hơn checkIn
      if (checkOut <= checkIn) {
        return { data: [], error: "Ngày check-in/check-out không hợp lệ" };
      }
    }

    // =========================================================================
    // 2. CHỈ KHI TẤT CẢ FILTER ĐỀU HỢP LỆ MỚI ĐƯỢC PHÉP QUERY DATABASE
    // =========================================================================
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

    if (propertyId) {
      query = query.eq("property_id", propertyId);
    }

    // Đảm bảo biến capacity nếu được truyền vào DB query phải luôn là số nguyên dương hợp lệ
    if (Number.isInteger(capacityNum) && capacityNum > 0) {
      query = query.gte("capacity", capacityNum);
    }

    query = query.order("nightly_price_vnd", { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error("Error querying public rooms:", error.message);
      return { data: [], error: error.message };
    }

    if (!data || data.length === 0) {
      return { data: [], error: null };
    }

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
        capacity: Number(item.capacity) || 0,
        amenities: parseAmenities(item.amenities),
        image_paths: parseImagePaths(item.image_paths),
        is_listed: item.is_listed,
        property,
      };
    });

    // =========================================================================
    // 3. TÍNH TOÁN AVAILABILITY CHO KHOẢNG NGÀY ĐÃ ĐƯỢC VALIDATE HỢP LỆ
    // =========================================================================
    if (checkIn && checkOut) {
      try {
        // KHÔNG ĐƯỢC catch lỗi hệ thống/RPC rồi return null bên trong mapper để tránh UI hiểu nhầm là hết phòng.
        // Để exception văng ra ngoài cho catch block xử lý và trả về error rõ ràng.
        const availabilityResults = await Promise.all(
          rooms.map(async (room) => {
            const isAvailable = await checkRoomAvailability(
              room.id,
              checkIn,
              checkOut
            );
            return isAvailable ? room : null;
          })
        );

        const availableRooms = availabilityResults.filter(
          (room): room is PublicRoom => room !== null
        );

        return { data: availableRooms, error: null };
      } catch (err) {
        console.error(
          "[getPublicRooms] Lỗi hệ thống khi gọi RPC check availability:",
          err
        );
        return {
          data: [],
          error:
            err instanceof Error
              ? err.message
              : "Không thể kiểm tra tình trạng phòng lúc này. Vui lòng thử lại.",
        };
      }
    }

    return { data: rooms, error: null };
  } catch (err) {
    console.error("Unexpected error in getPublicRooms:", err);
    return { data: [], error: "Lỗi kết nối cơ sở dữ liệu" };
  }
}

/**
 * Fetches all active properties for filter dropdowns.
 * Returns empty array [] if no records exist; never uses fallback/seed data.
 */
export async function getActiveProperties(): Promise<{
  data: PublicProperty[];
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
      return { data: [], error: error.message };
    }

    if (data && data.length > 0) {
      return { data: data as PublicProperty[], error: null };
    }

    return { data: [], error: null };
  } catch (err) {
    console.error("Unexpected error in getActiveProperties:", err);
    return { data: [], error: "Lỗi kết nối cơ sở dữ liệu" };
  }
}

/**
 * Fetches a single public listed room by its UUID.
 * Returns null if room does not exist or is not listed; never uses fallback/seed data.
 */
export async function getPublicRoomById(id: string): Promise<{
  data: PublicRoom | null;
  error: string | null;
}> {
  if (!id || !isValidUUID(id)) {
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
        capacity: Number(data.capacity) || 0,
        amenities: parseAmenities(data.amenities),
        image_paths: parseImagePaths(data.image_paths),
        is_listed: data.is_listed,
        property,
      };

      return { data: room, error: null };
    }

    return { data: null, error: null };
  } catch (err) {
    console.error(`Unexpected error in getPublicRoomById (${id}):`, err);
    return { data: null, error: "Lỗi kết nối cơ sở dữ liệu" };
  }
}
