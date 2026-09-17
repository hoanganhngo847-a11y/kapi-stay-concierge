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

/**
 * Fetches all listed rooms from public catalog joined with their property details.
 * Strictly uses public RLS via standard server client (no service_role).
 */
export async function getPublicRooms(): Promise<{
  data: PublicRoom[] | null;
  error: string | null;
}> {
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
      .eq("is_listed", true)
      .order("nightly_price_vnd", { ascending: true });

    if (error) {
      console.error("Error querying public rooms:", error.message);
      return { data: null, error: error.message };
    }

    if (!data) {
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
  // Defensive UUID check
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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

    if (!data) {
      return { data: null, error: null };
    }

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
  } catch (err) {
    console.error(`Unexpected error in getPublicRoomById (${id}):`, err);
    return { data: null, error: "Lỗi kết nối cơ sở dữ liệu" };
  }
}
