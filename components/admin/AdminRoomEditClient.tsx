"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Key,
  Image as ImageIcon,
  Video,
  Trash2,
  Star,
  Upload,
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  MoveUp,
  MoveDown,
  Loader2,
} from "lucide-react";
import type {
  AdminRoomDetail,
  AdminRoomMediaItem,
} from "@/lib/data/admin";
import { getStorageMediaUrl } from "@/lib/utils/media";
import {
  adminUpdateRoomAction,
  adminUpdateRoomAccessAction,
  adminUploadRoomMediaFileAction,
  adminAddRoomMediaAction,
  adminDeleteRoomMediaAction,
  adminSetCoverRoomMediaAction,
  adminReorderRoomMediaAction,
} from "@/app/admin/actions";
import { formatVND } from "@/lib/utils/format";

const COMMON_AMENITIES = [
  "Wifi",
  "Điều hòa",
  "Smart TV",
  "Tủ lạnh",
  "Máy sấy tóc",
  "Ấm siêu tốc",
  "Khăn tắm cao cấp",
  "Bàn làm việc",
  "Cửa sổ thoáng",
  "Ban công",
  "Bồn tắm",
  "Máy pha cà phê",
];

interface AdminRoomEditClientProps {
  initialData: AdminRoomDetail;
  properties: Array<{ id: string; name: string }>;
}

export function AdminRoomEditClient({
  initialData,
  properties,
}: AdminRoomEditClientProps) {
  const router = useRouter();

  // SECTION A: Room Info State
  const [name, setName] = React.useState(initialData.room.name);
  const [propertyId, setPropertyId] = React.useState(initialData.room.property_id);
  const [roomNumber, setRoomNumber] = React.useState(initialData.room.room_number || "");
  const [floorNumber, setFloorNumber] = React.useState<number>(initialData.room.floor_number ?? 1);
  const [hourlyPrice, setHourlyPrice] = React.useState<number>(initialData.room.hourly_price_vnd);
  const [nightlyPrice, setNightlyPrice] = React.useState<number>(initialData.room.nightly_price_vnd);
  const [capacity, setCapacity] = React.useState<number>(initialData.room.capacity);
  const [description, setDescription] = React.useState(initialData.room.description || "");
  const [amenities, setAmenities] = React.useState<string[]>(initialData.room.amenities || []);
  const [isListed, setIsListed] = React.useState<boolean>(initialData.room.is_listed);

  const [isSavingRoom, setIsSavingRoom] = React.useState(false);
  const [roomMessage, setRoomMessage] = React.useState<{ text: string; isError?: boolean } | null>(null);

  // SECTION B: Media State
  const [mediaList, setMediaList] = React.useState<AdminRoomMediaItem[]>(initialData.media || []);
  const [isUploadingMedia, setIsUploadingMedia] = React.useState(false);
  const [mediaMessage, setMediaMessage] = React.useState<{ text: string; isError?: boolean } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // SECTION C: Access Details State
  const [doorCode, setDoorCode] = React.useState(initialData.private_details.door_access_code || "");
  const [showDoorCode, setShowDoorCode] = React.useState(false);
  const [wifiSsid, setWifiSsid] = React.useState(initialData.private_details.wifi_ssid || "");
  const [wifiPassword, setWifiPassword] = React.useState(initialData.private_details.wifi_password || "");
  const [showWifiPassword, setShowWifiPassword] = React.useState(false);
  const [privateInstructions, setPrivateInstructions] = React.useState(
    initialData.private_details.private_instructions || ""
  );

  const [isSavingAccess, setIsSavingAccess] = React.useState(false);
  const [accessMessage, setAccessMessage] = React.useState<{ text: string; isError?: boolean } | null>(null);

  // Toggle amenity
  const handleToggleAmenity = (amenity: string) => {
    setAmenities((prev) =>
      prev.includes(amenity) ? prev.filter((a) => a !== amenity) : [...prev, amenity]
    );
  };

  // Save Room Info
  const handleSaveRoomInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingRoom(true);
    setRoomMessage(null);

    const res = await adminUpdateRoomAction(initialData.room.id, {
      name,
      property_id: propertyId,
      room_number: roomNumber,
      floor_number: Number(floorNumber),
      hourly_price_vnd: Number(hourlyPrice),
      nightly_price_vnd: Number(nightlyPrice),
      capacity: Number(capacity),
      description,
      amenities,
      is_listed: isListed,
    });

    setIsSavingRoom(false);
    if (!res.success) {
      setRoomMessage({ text: res.error || "Lỗi lưu thông tin phòng", isError: true });
    } else {
      setRoomMessage({ text: "Đã cập nhật thông tin phòng thành công!" });
      router.refresh();
    }
  };

  // Save Access Details
  const handleSaveAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingAccess(true);
    setAccessMessage(null);

    const res = await adminUpdateRoomAccessAction(initialData.room.id, {
      door_access_code: doorCode,
      wifi_ssid: wifiSsid,
      wifi_password: wifiPassword,
      private_instructions: privateInstructions,
    });

    setIsSavingAccess(false);
    if (!res.success) {
      setAccessMessage({ text: res.error || "Lỗi lưu thông tin truy cập", isError: true });
    } else {
      setAccessMessage({ text: "Đã lưu mã truy cập và Wi-Fi phòng thành công!" });
      router.refresh();
    }
  };

  // Upload Media
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingMedia(true);
    setMediaMessage(null);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append("file", file);
      formData.append("property_id", propertyId);
      formData.append("room_id", initialData.room.id);

      const uploadRes = await adminUploadRoomMediaFileAction(formData);
      if (!uploadRes.success || !uploadRes.storage_path) {
        setMediaMessage({
          text: uploadRes.error || `Tải lên ${file.name} thất bại`,
          isError: true,
        });
        setIsUploadingMedia(false);
        return;
      }

      // Add to room_media table
      const addRes = await adminAddRoomMediaAction(initialData.room.id, {
        media_type: uploadRes.media_type || "IMAGE",
        storage_path: uploadRes.storage_path,
        sort_order: mediaList.length,
        is_cover: mediaList.length === 0 && uploadRes.media_type === "IMAGE",
        alt_text: file.name,
      });

      if (!addRes.success) {
        setMediaMessage({
          text: addRes.error || "Thêm media vào dữ liệu phòng thất bại",
          isError: true,
        });
        setIsUploadingMedia(false);
        return;
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
    setIsUploadingMedia(false);
    setMediaMessage({ text: "Tải lên media thành công!" });
    router.refresh();
  };

  // Delete Media
  const handleDeleteMedia = async (mediaId: string) => {
    if (!confirm("Bạn có chắc muốn xóa tập tin media này?")) return;
    setMediaMessage(null);

    const res = await adminDeleteRoomMediaAction(mediaId);
    if (!res.success) {
      setMediaMessage({ text: res.error || "Xóa media thất bại", isError: true });
    } else {
      setMediaList((prev) => prev.filter((m) => m.id !== mediaId));
      setMediaMessage({ text: "Đã xóa media thành công" });
      router.refresh();
    }
  };

  // Set Cover
  const handleSetCover = async (mediaId: string) => {
    setMediaMessage(null);
    const res = await adminSetCoverRoomMediaAction(initialData.room.id, mediaId);
    if (!res.success) {
      setMediaMessage({ text: res.error || "Đặt ảnh bìa thất bại", isError: true });
    } else {
      setMediaList((prev) =>
        prev.map((m) => ({
          ...m,
          is_cover: m.id === mediaId,
        }))
      );
      setMediaMessage({ text: "Đã đặt làm ảnh bìa phòng" });
      router.refresh();
    }
  };

  // Move Media up/down
  const handleMoveMedia = async (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= mediaList.length) return;

    const newMediaList = [...mediaList];
    const temp = newMediaList[index];
    newMediaList[index] = newMediaList[targetIndex];
    newMediaList[targetIndex] = temp;

    setMediaList(newMediaList);
    const ids = newMediaList.map((m) => m.id);
    await adminReorderRoomMediaAction(initialData.room.id, ids);
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Top Header & Breadcrumb */}
      <div>
        <Link
          href="/admin/rooms"
          className="inline-flex items-center gap-1.5 text-xs text-[#707072] hover:text-[#111111] transition-colors mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Quay lại danh sách phòng</span>
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#E5E5E5] pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs px-2 py-0.5 bg-[#111111] text-white">
                P.{initialData.room.room_number || "---"}
              </span>
              <h1 className="text-xl sm:text-2xl font-semibold text-[#111111] tracking-tight">
                {initialData.room.name}
              </h1>
            </div>
            <p className="text-xs text-[#707072] mt-1">
              Chi nhánh: {initialData.room.property_name} ({initialData.room.property_address})
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/rooms/${initialData.room.id}`}
              target="_blank"
              className="px-3 py-1.5 bg-white border border-[#E5E5E5] text-[#111111] text-xs font-medium hover:bg-[#F5F5F5] transition-colors"
            >
              Xem trang phòng ngoài web ↗
            </Link>
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* SECTION A: THÔNG TIN PHÒNG */}
      {/* =================================================================== */}
      <section className="bg-white border border-[#E5E5E5] p-6 space-y-6">
        <div className="border-b border-[#E5E5E5] pb-3">
          <h2 className="text-base font-semibold text-[#111111]">
            Phần A — Thông Tin Cơ Bản & Giá
          </h2>
          <p className="text-xs text-[#707072] mt-0.5">
            Cấu hình tên, số phòng, tầng, giá tiền và trạng thái hiển thị công khai.
          </p>
        </div>

        {roomMessage && (
          <div
            className={`p-3 text-xs flex items-center gap-2 border ${
              roomMessage.isError
                ? "bg-rose-50 border-rose-200 text-rose-800"
                : "bg-emerald-50 border-emerald-200 text-emerald-800"
            }`}
          >
            {roomMessage.isError ? (
              <AlertCircle className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{roomMessage.text}</span>
          </div>
        )}

        <form onSubmit={handleSaveRoomInfo} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Tên phòng */}
            <div>
              <label className="block text-xs font-medium text-[#111111] mb-1">
                Tên phòng <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full text-xs bg-[#F9F9F9] border border-[#E5E5E5] px-3 py-2 text-[#111111] focus:outline-none focus:border-[#111111]"
              />
            </div>

            {/* Chi nhánh */}
            <div>
              <label className="block text-xs font-medium text-[#111111] mb-1">
                Chi nhánh / Property <span className="text-rose-500">*</span>
              </label>
              <select
                required
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value)}
                className="w-full text-xs bg-[#F9F9F9] border border-[#E5E5E5] px-3 py-2 text-[#111111] focus:outline-none focus:border-[#111111]"
              >
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Số phòng & Tầng */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#111111] mb-1">
                  Số phòng <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={roomNumber}
                  onChange={(e) => setRoomNumber(e.target.value)}
                  placeholder="VD: 101, 202"
                  className="w-full text-xs bg-[#F9F9F9] border border-[#E5E5E5] px-3 py-2 text-[#111111] focus:outline-none focus:border-[#111111]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#111111] mb-1">
                  Tầng <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min={0}
                  value={floorNumber}
                  onChange={(e) => setFloorNumber(parseInt(e.target.value, 10) || 0)}
                  className="w-full text-xs bg-[#F9F9F9] border border-[#E5E5E5] px-3 py-2 text-[#111111] focus:outline-none focus:border-[#111111]"
                />
              </div>
            </div>

            {/* Sức chứa */}
            <div>
              <label className="block text-xs font-medium text-[#111111] mb-1">
                Sức chứa tối đa (khách) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                required
                min={1}
                max={20}
                value={capacity}
                onChange={(e) => setCapacity(parseInt(e.target.value, 10) || 1)}
                className="w-full text-xs bg-[#F9F9F9] border border-[#E5E5E5] px-3 py-2 text-[#111111] focus:outline-none focus:border-[#111111]"
              />
            </div>

            {/* Giá theo giờ */}
            <div>
              <label className="block text-xs font-medium text-[#111111] mb-1">
                Giá theo giờ (VND) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                required
                min={1000}
                step={1000}
                value={hourlyPrice}
                onChange={(e) => setHourlyPrice(parseInt(e.target.value, 10) || 0)}
                className="w-full text-xs bg-[#F9F9F9] border border-[#E5E5E5] px-3 py-2 text-[#111111] focus:outline-none focus:border-[#111111]"
              />
              <span className="text-[10px] text-[#707072] mt-0.5 block font-mono">
                {formatVND(hourlyPrice)} / giờ
              </span>
            </div>

            {/* Giá theo đêm */}
            <div>
              <label className="block text-xs font-medium text-[#111111] mb-1">
                Giá theo đêm (VND)
              </label>
              <input
                type="number"
                min={0}
                step={1000}
                value={nightlyPrice}
                onChange={(e) => setNightlyPrice(parseInt(e.target.value, 10) || 0)}
                className="w-full text-xs bg-[#F9F9F9] border border-[#E5E5E5] px-3 py-2 text-[#111111] focus:outline-none focus:border-[#111111]"
              />
              <span className="text-[10px] text-[#707072] mt-0.5 block font-mono">
                {formatVND(nightlyPrice)} / đêm
              </span>
            </div>
          </div>

          {/* Mô tả */}
          <div>
            <label className="block text-xs font-medium text-[#111111] mb-1">
              Mô tả chi tiết phòng
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Không gian ấm cúng, thiết kế phong cách Kapi tối giản..."
              className="w-full text-xs bg-[#F9F9F9] border border-[#E5E5E5] p-3 text-[#111111] focus:outline-none focus:border-[#111111]"
            />
          </div>

          {/* Tiện nghi */}
          <div>
            <label className="block text-xs font-medium text-[#111111] mb-2">
              Tiện nghi phòng
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {COMMON_AMENITIES.map((amenity) => {
                const checked = amenities.includes(amenity);
                return (
                  <label
                    key={amenity}
                    className={`flex items-center gap-2 p-2 border text-xs cursor-pointer select-none transition-colors ${
                      checked
                        ? "bg-[#111111] text-white border-[#111111]"
                        : "bg-[#F9F9F9] text-[#707072] border-[#E5E5E5] hover:border-[#CCCCCC]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleToggleAmenity(amenity)}
                      className="hidden"
                    />
                    <span>{checked ? "✓" : "+"}</span>
                    <span>{amenity}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Hiển thị trên Website */}
          <div className="pt-2 border-t border-[#F0F0F0]">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isListed}
                onChange={(e) => setIsListed(e.target.checked)}
                className="w-4 h-4 accent-[#111111]"
              />
              <span className="text-xs font-medium text-[#111111]">
                Hiển thị phòng trên danh mục công khai (Website Kapi)
              </span>
            </label>
          </div>

          {/* Submit Button */}
          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={isSavingRoom}
              className="px-5 py-2.5 bg-[#111111] text-white text-xs font-medium hover:bg-[#262626] transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isSavingRoom && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Lưu thay đổi thông tin phòng</span>
            </button>
          </div>
        </form>
      </section>

      {/* =================================================================== */}
      {/* SECTION B: ROOM MEDIA (ẢNH & VIDEO) */}
      {/* =================================================================== */}
      <section className="bg-white border border-[#E5E5E5] p-6 space-y-6">
        <div className="border-b border-[#E5E5E5] pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-[#111111]">
              Phần B — Hình Ảnh & Video Phòng
            </h2>
            <p className="text-xs text-[#707072] mt-0.5">
              Tải lên ảnh phòng, video walkthrough, chọn ảnh bìa và sắp xếp thứ tự hiển thị.
            </p>
          </div>
          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              multiple
              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
              className="hidden"
            />
            <button
              type="button"
              disabled={isUploadingMedia}
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-[#111111] text-white text-xs font-medium hover:bg-[#262626] transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isUploadingMedia ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              <span>Tải lên Ảnh / Video</span>
            </button>
          </div>
        </div>

        {mediaMessage && (
          <div
            className={`p-3 text-xs flex items-center gap-2 border ${
              mediaMessage.isError
                ? "bg-rose-50 border-rose-200 text-rose-800"
                : "bg-emerald-50 border-emerald-200 text-emerald-800"
            }`}
          >
            {mediaMessage.isError ? (
              <AlertCircle className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{mediaMessage.text}</span>
          </div>
        )}

        {mediaList.length === 0 ? (
          <div className="p-8 border border-dashed border-[#CCCCCC] text-center bg-[#FAFAFA]">
            <ImageIcon className="w-8 h-8 text-[#CCCCCC] mx-auto mb-2" />
            <p className="text-xs text-[#707072]">
              Chưa có hình ảnh hay video nào được cấu hình cho phòng này.
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-3 px-3 py-1.5 border border-[#111111] text-xs font-medium text-[#111111] hover:bg-[#111111] hover:text-white transition-colors"
            >
              Tải lên tập tin đầu tiên
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {mediaList.map((m, idx) => {
              const url = getStorageMediaUrl(m.storage_path, "room-media");
              const isVideo = m.media_type === "VIDEO";

              return (
                <div
                  key={m.id}
                  className={`border ${
                    m.is_cover ? "border-[#111111] ring-1 ring-[#111111]" : "border-[#E5E5E5]"
                  } bg-[#F9F9F9] flex flex-col justify-between overflow-hidden group`}
                >
                  {/* Media Preview Box */}
                  <div className="relative aspect-video bg-[#EFEFEF] flex items-center justify-center overflow-hidden">
                    {isVideo ? (
                      <video
                        src={url}
                        controls
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt={m.alt_text || "Room photo"}
                        className="w-full h-full object-cover"
                      />
                    )}

                    {/* Top tags */}
                    <div className="absolute top-2 left-2 flex items-center gap-1.5 pointer-events-none">
                      {m.is_cover && (
                        <span className="text-[10px] font-semibold bg-[#111111] text-white px-2 py-0.5 flex items-center gap-1">
                          <Star className="w-2.5 h-2.5 fill-current" /> Ảnh bìa
                        </span>
                      )}
                      {isVideo && (
                        <span className="text-[10px] font-semibold bg-blue-900 text-white px-2 py-0.5 flex items-center gap-1">
                          <Video className="w-2.5 h-2.5" /> Video
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions & Sorting Toolbar */}
                  <div className="p-3 bg-white border-t border-[#E5E5E5] flex items-center justify-between gap-1 text-xs">
                    {/* Reorder Buttons */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMoveMedia(idx, "up")}
                        title="Di chuyển lên trước"
                        className="p-1 border border-[#E5E5E5] hover:border-[#111111] disabled:opacity-30 disabled:hover:border-[#E5E5E5]"
                      >
                        <MoveUp className="w-3 h-3 text-[#111111]" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === mediaList.length - 1}
                        onClick={() => handleMoveMedia(idx, "down")}
                        title="Di chuyển xuống sau"
                        className="p-1 border border-[#E5E5E5] hover:border-[#111111] disabled:opacity-30 disabled:hover:border-[#E5E5E5]"
                      >
                        <MoveDown className="w-3 h-3 text-[#111111]" />
                      </button>
                    </div>

                    {/* Cover toggle & Delete */}
                    <div className="flex items-center gap-2">
                      {!isVideo && !m.is_cover && (
                        <button
                          type="button"
                          onClick={() => handleSetCover(m.id)}
                          className="text-[11px] text-[#707072] hover:text-[#111111] underline"
                        >
                          Đặt bìa
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteMedia(m.id)}
                        className="p-1 text-rose-600 hover:text-rose-800"
                        title="Xóa media"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* =================================================================== */}
      {/* SECTION C: ROOM ACCESS (MẬT MÃ CỬA & WI-FI) */}
      {/* =================================================================== */}
      <section className="bg-white border border-[#E5E5E5] p-6 space-y-6">
        <div className="border-b border-[#E5E5E5] pb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#111111] flex items-center gap-2">
              <Key className="w-4 h-4 text-[#111111]" />
              <span>Phần C — Mật Mã Cửa & Truy Cập Phòng</span>
            </h2>
            <p className="text-xs text-[#707072] mt-0.5">
              Cấu hình mật khẩu khóa thông minh và Wi-Fi riêng biệt. Dữ liệu này được bảo vệ nghiêm ngặt (chỉ cấp cho khách đã thanh toán trong khung giờ lưu trú).
            </p>
          </div>
          <span className="font-mono text-[10px] px-2 py-0.5 bg-[#F0F0F0] text-[#707072] border border-[#E5E5E5]">
            ADMIN SENSITIVE
          </span>
        </div>

        {accessMessage && (
          <div
            className={`p-3 text-xs flex items-center gap-2 border ${
              accessMessage.isError
                ? "bg-rose-50 border-rose-200 text-rose-800"
                : "bg-emerald-50 border-emerald-200 text-emerald-800"
            }`}
          >
            {accessMessage.isError ? (
              <AlertCircle className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{accessMessage.text}</span>
          </div>
        )}

        <form onSubmit={handleSaveAccess} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Mã khóa cửa */}
            <div>
              <label className="block text-xs font-medium text-[#111111] mb-1">
                Mã mở cửa khóa thông minh (Door PIN / Passcode)
              </label>
              <div className="relative">
                <input
                  type={showDoorCode ? "text" : "password"}
                  value={doorCode}
                  onChange={(e) => setDoorCode(e.target.value)}
                  placeholder="VD: 123456"
                  className="w-full text-xs font-mono bg-[#F9F9F9] border border-[#E5E5E5] px-3 py-2 text-[#111111] focus:outline-none focus:border-[#111111] pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowDoorCode(!showDoorCode)}
                  className="absolute right-2.5 top-2.5 text-[#707072] hover:text-[#111111]"
                  title={showDoorCode ? "Ẩn mã" : "Hiển thị mã"}
                >
                  {showDoorCode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <span className="text-[10px] text-[#707072] mt-1 block">
                Mã này dùng làm nguồn cấp Digital Key khi đơn đặt phòng chuyển trạng thái đã thanh toán.
              </span>
            </div>

            {/* Hướng dẫn mở cửa */}
            <div>
              <label className="block text-xs font-medium text-[#111111] mb-1">
                Hướng dẫn mở khóa cửa
              </label>
              <input
                type="text"
                value={privateInstructions}
                onChange={(e) => setPrivateInstructions(e.target.value)}
                placeholder="VD: Nhập mã → nhấn # → xoay tay nắm cửa"
                className="w-full text-xs bg-[#F9F9F9] border border-[#E5E5E5] px-3 py-2 text-[#111111] focus:outline-none focus:border-[#111111]"
              />
            </div>

            {/* Wi-Fi SSID */}
            <div>
              <label className="block text-xs font-medium text-[#111111] mb-1">
                Tên mạng Wi-Fi (SSID)
              </label>
              <input
                type="text"
                value={wifiSsid}
                onChange={(e) => setWifiSsid(e.target.value)}
                placeholder="VD: KapiStay_HaNoi_5G"
                className="w-full text-xs font-mono bg-[#F9F9F9] border border-[#E5E5E5] px-3 py-2 text-[#111111] focus:outline-none focus:border-[#111111]"
              />
            </div>

            {/* Wi-Fi Password */}
            <div>
              <label className="block text-xs font-medium text-[#111111] mb-1">
                Mật khẩu Wi-Fi
              </label>
              <div className="relative">
                <input
                  type={showWifiPassword ? "text" : "password"}
                  value={wifiPassword}
                  onChange={(e) => setWifiPassword(e.target.value)}
                  placeholder="VD: kapistay2026"
                  className="w-full text-xs font-mono bg-[#F9F9F9] border border-[#E5E5E5] px-3 py-2 text-[#111111] focus:outline-none focus:border-[#111111] pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowWifiPassword(!showWifiPassword)}
                  className="absolute right-2.5 top-2.5 text-[#707072] hover:text-[#111111]"
                >
                  {showWifiPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={isSavingAccess}
              className="px-5 py-2.5 bg-[#111111] text-white text-xs font-medium hover:bg-[#262626] transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isSavingAccess && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Lưu mật mã cửa & Wi-Fi</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
