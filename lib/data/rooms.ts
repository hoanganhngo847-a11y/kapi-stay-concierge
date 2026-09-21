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
  propertyId?: string;
  property_id?: string | string[];
  location_code?: string | string[];
  location?: string | string[];
  capacity?: number | string | string[];
  max_guests?: number | string | string[];
  guests?: number | string | string[];
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

    const rawProp =
      filters?.propertyId ||
      filters?.property_id ||
      filters?.location_code ||
      filters?.location;
    const propertyId =
      typeof rawProp === "string"
        ? rawProp.trim()
        : Array.isArray(rawProp) && typeof rawProp[0] === "string"
          ? rawProp[0].trim()
          : "";

    if (propertyId.length > 0) {
      query = query.eq("property_id", propertyId);
    }

    const rawCapacity =
      filters?.capacity ?? filters?.max_guests ?? filters?.guests;
    const capacityNum =
      typeof rawCapacity === "number"
        ? rawCapacity
        : typeof rawCapacity === "string"
          ? parseInt(rawCapacity, 10)
          : Array.isArray(rawCapacity) && typeof rawCapacity[0] === "string"
            ? parseInt(rawCapacity[0], 10)
            : 0;

    if (!isNaN(capacityNum) && capacityNum > 0) {
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
        capacity: Number(item.capacity) || 2,
        amenities: parseAmenities(item.amenities),
        image_paths: parseImagePaths(item.image_paths),
        is_listed: item.is_listed,
        property,
      };
    });

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
  if (!id || typeof id !== "string") {
    return { data: null, error: "ID phòng không hợp lệ" };
  }

  // Defensive UUID check (32 hex characters with standard hyphenation)
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
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
        capacity: Number(data.capacity) || 2,
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
