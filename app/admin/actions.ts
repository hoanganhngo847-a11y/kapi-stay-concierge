"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface AdminLoginResult {
  success: boolean;
  error?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Server action to authenticate an admin using email and password.
 * Strictly verifies role = 'admin' in public.staff_roles.
 * Rejects and terminates session if role is not admin.
 * Never leaks user enumeration or raw Supabase errors.
 */
export async function adminLoginAction(formData: {
  email?: string;
  password?: string;
}): Promise<AdminLoginResult> {
  const email = (formData.email || "").trim().toLowerCase();
  const password = formData.password || "";

  if (!email || !EMAIL_REGEX.test(email) || !password) {
    return {
      success: false,
      error: "Email, mật khẩu hoặc quyền truy cập không hợp lệ.",
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return {
      success: false,
      error: "Email, mật khẩu hoặc quyền truy cập không hợp lệ.",
    };
  }

  // Authoritative check against public.staff_roles
  const { data: roleData, error: roleError } = await supabase
    .from("staff_roles")
    .select("role")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (roleError || !roleData || roleData.role !== "admin") {
    // Non-admin or unauthorized: terminate session immediately
    await supabase.auth.signOut();
    return {
      success: false,
      error: "Email, mật khẩu hoặc quyền truy cập không hợp lệ.",
    };
  }

  return { success: true };
}

/**
 * Server action to sign out from the Admin Portal.
 * Invalidates the Supabase Auth session and redirects to /admin/login.
 */
export async function adminSignOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

// ---------------------------------------------------------------------------
// ADMIN CONTENT MANAGEMENT — PHASE 2 SERVER ACTIONS
// ---------------------------------------------------------------------------

import {
  adminUpdateRoom,
  adminUpdateRoomAccess,
  adminAddRoomMedia,
  adminDeleteRoomMedia,
  adminSetCoverRoomMedia,
  adminReorderRoomMedia,
  adminCreateMenuProduct,
  adminUpdateMenuProduct,
  adminSetMenuProductActive,
  getAdminBookingDetail,
  getAdminPropertyRoomSchedule,
  updateRoomStatus,
  updateTicketStatusAdmin,
  verifyAdminRole,
  type StaffMutableRoomOperationalStatus,
  type TicketStatus,
} from "@/lib/data/admin";
import { getStorageMediaUrl } from "@/lib/utils/media";

export async function adminUpdateRoomAction(
  roomId: string,
  data: {
    name: string;
    property_id: string;
    room_number: string;
    floor_number: number;
    hourly_price_vnd: number;
    nightly_price_vnd?: number;
    capacity: number;
    description?: string;
    amenities: string[];
    is_listed: boolean;
  }
) {
  try {
    return await adminUpdateRoom(roomId, data);
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Cập nhật phòng thất bại.",
    };
  }
}

export async function adminUpdateRoomAccessAction(
  roomId: string,
  data: {
    door_access_code?: string;
    wifi_ssid?: string;
    wifi_password?: string;
    private_instructions?: string;
  }
) {
  try {
    return await adminUpdateRoomAccess(roomId, data);
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Cập nhật mã cửa thất bại.",
    };
  }
}

export async function adminAddRoomMediaAction(
  roomId: string,
  data: {
    media_type: "IMAGE" | "VIDEO";
    storage_path: string;
    sort_order?: number;
    is_cover?: boolean;
    alt_text?: string;
  }
) {
  try {
    return await adminAddRoomMedia(roomId, data);
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Thêm media thất bại.",
    };
  }
}

export async function adminDeleteRoomMediaAction(mediaId: string) {
  try {
    const res = await adminDeleteRoomMedia(mediaId);
    if (res.success && res.storage_path) {
      // Best-effort delete from storage bucket if it is a relative storage path
      if (!res.storage_path.startsWith("http")) {
        const supabase = await createClient();
        await supabase.storage.from("room-media").remove([res.storage_path]);
      }
    }
    return res;
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Xóa media thất bại.",
    };
  }
}

export async function adminSetCoverRoomMediaAction(roomId: string, mediaId: string) {
  try {
    return await adminSetCoverRoomMedia(roomId, mediaId);
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Đặt ảnh bìa thất bại.",
    };
  }
}

export async function adminReorderRoomMediaAction(roomId: string, mediaIds: string[]) {
  try {
    return await adminReorderRoomMedia(roomId, mediaIds);
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Sắp xếp media thất bại.",
    };
  }
}

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm"];
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

export async function adminUploadRoomMediaFileAction(formData: FormData): Promise<{
  success: boolean;
  storage_path?: string;
  media_type?: "IMAGE" | "VIDEO";
  error?: string;
}> {
  try {
    await verifyAdminRole();
    const file = formData.get("file") as File | null;
    const propertyId = (formData.get("property_id") as string) || "general";
    const roomId = (formData.get("room_id") as string) || "general";

    if (!file || file.size === 0) {
      return { success: false, error: "Tập tin không hợp lệ hoặc rỗng." };
    }

    const mimeType = file.type.toLowerCase();
    const isImage = ALLOWED_IMAGE_TYPES.includes(mimeType);
    const isVideo = ALLOWED_VIDEO_TYPES.includes(mimeType);

    if (!isImage && !isVideo) {
      return {
        success: false,
        error: "Định dạng tập tin không được hỗ trợ. Vui lòng chọn ảnh (JPG, PNG, WebP) hoặc video (MP4, WebM).",
      };
    }

    if (isImage && file.size > MAX_IMAGE_SIZE_BYTES) {
      return { success: false, error: "Kích thước ảnh vượt quá giới hạn cho phép (tối đa 10MB)." };
    }
    if (isVideo && file.size > MAX_VIDEO_SIZE_BYTES) {
      return { success: false, error: "Kích thước video vượt quá giới hạn cho phép (tối đa 50MB)." };
    }

    const extension = mimeType.split("/")[1] || (isImage ? "webp" : "mp4");
    const safeExt = extension === "jpeg" ? "jpg" : extension;
    const uniqueFileName = `${crypto.randomUUID()}.${safeExt}`;
    const cleanPropId = propertyId.replace(/[^a-zA-Z0-9_-]/g, "");
    const cleanRoomId = roomId.replace(/[^a-zA-Z0-9_-]/g, "");
    const storagePath = `${cleanPropId}/${cleanRoomId}/${uniqueFileName}`;

    const supabase = await createClient();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from("room-media")
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error("[adminUploadRoomMediaFileAction] Storage upload error:", uploadError.message);
      return { success: false, error: `Lỗi tải lên lưu trữ: ${uploadError.message}` };
    }

    return {
      success: true,
      storage_path: storagePath,
      media_type: isVideo ? "VIDEO" : "IMAGE",
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Tải lên tập tin thất bại.",
    };
  }
}

export async function adminCreateMenuProductAction(data: {
  name: string;
  slug: string;
  category: "DRINK" | "SNACK" | "MAIN_FOOD";
  description?: string;
  price_vnd: number;
  image_url?: string;
  sort_order?: number;
  is_active?: boolean;
}) {
  try {
    return await adminCreateMenuProduct(data);
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Thêm món mới thất bại.",
    };
  }
}

export async function adminUpdateMenuProductAction(
  id: string,
  data: {
    name: string;
    slug: string;
    category: "DRINK" | "SNACK" | "MAIN_FOOD";
    description?: string;
    price_vnd: number;
    image_url?: string;
    sort_order?: number;
    is_active?: boolean;
  }
) {
  try {
    return await adminUpdateMenuProduct(id, data);
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Cập nhật món ăn thất bại.",
    };
  }
}

export async function adminSetMenuProductActiveAction(id: string, isActive: boolean) {
  try {
    return await adminSetMenuProductActive(id, isActive);
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Thay đổi trạng thái thất bại.",
    };
  }
}

export async function adminUploadMenuMediaFileAction(formData: FormData): Promise<{
  success: boolean;
  image_url?: string;
  error?: string;
}> {
  try {
    await verifyAdminRole();
    const file = formData.get("file") as File | null;
    const category = (formData.get("category") as string) || "GENERAL";
    const productId = (formData.get("product_id") as string) || "new";

    if (!file || file.size === 0) {
      return { success: false, error: "Tập tin ảnh không hợp lệ hoặc rỗng." };
    }

    const mimeType = file.type.toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
      return { success: false, error: "Định dạng ảnh không được hỗ trợ (JPG, PNG, WebP)." };
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return { success: false, error: "Kích thước ảnh vượt quá giới hạn 10MB." };
    }

    const extension = mimeType.split("/")[1] || "webp";
    const safeExt = extension === "jpeg" ? "jpg" : extension;
    const uniqueFileName = `${crypto.randomUUID()}.${safeExt}`;
    const cleanCat = category.replace(/[^a-zA-Z0-9_-]/g, "");
    const cleanProdId = productId.replace(/[^a-zA-Z0-9_-]/g, "");
    const storagePath = `${cleanCat}/${cleanProdId}/${uniqueFileName}`;

    const supabase = await createClient();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from("menu-media")
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error("[adminUploadMenuMediaFileAction] Storage upload error:", uploadError.message);
      return { success: false, error: `Lỗi tải lên ảnh thực đơn: ${uploadError.message}` };
    }

    const publicUrl = getStorageMediaUrl(storagePath, "menu-media");
    return {
      success: true,
      image_url: publicUrl,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Tải lên ảnh thất bại.",
    };
  }
}

// ---------------------------------------------------------------------------
// UNIFIED OPERATIONS BOARD ACTIONS
// ---------------------------------------------------------------------------

export async function fetchAdminBookingDetailAction(bookingId: string) {
  try {
    return await getAdminBookingDetail(bookingId);
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Không thể tải chi tiết đặt phòng.",
    };
  }
}

export async function fetchAdminPropertyScheduleAction(
  propertyId: string,
  rangeStart: string,
  rangeEnd: string
) {
  try {
    return await getAdminPropertyRoomSchedule(propertyId, rangeStart, rangeEnd);
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Không thể tải lịch phòng.",
    };
  }
}

export async function updateAdminRoomStatusAction(
  roomId: string,
  status: StaffMutableRoomOperationalStatus
) {
  try {
    await verifyAdminRole();
    const res = await updateRoomStatus(roomId, status);
    return { success: true, data: res };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Không thể cập nhật trạng thái phòng.",
    };
  }
}

export async function updateAdminTicketStatusAction(
  ticketId: string,
  status: TicketStatus
) {
  try {
    await verifyAdminRole();
    const res = await updateTicketStatusAdmin(ticketId, status);
    return { success: true, data: res };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Không thể cập nhật sự cố.",
    };
  }
}


