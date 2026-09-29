import * as React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  MapPin,
  Users,
  ExternalLink,
  ShieldCheck,
  Clock,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import {
  getPublicRoomById,
  getTodayInVietnam,
  isValidCalendarDate,
} from "@/lib/data/rooms";
import { Gallery } from "@/components/rooms/Gallery";
import { RoomAmenities } from "@/components/rooms/RoomAmenities";
import { RoomBookingWidget } from "@/components/rooms/RoomBookingWidget";
import { Reveal } from "@/components/ui/Reveal";

type RoomDetailSearchParams = {
  [key: string]: string | string[] | undefined;
};

interface RoomDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<RoomDetailSearchParams>;
}

function getFirstParam(value: string | string[] | undefined): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0].trim();
  }
  return "";
}

export async function generateMetadata({
  params,
}: RoomDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const { data: room } = await getPublicRoomById(id);

  if (!room) {
    return {
      title: "Không tìm thấy phòng | Kapi Stay Concierge",
    };
  }

  return {
    title: `${room.name} | Kapi Stay Concierge`,
    description:
      room.description ||
      `Trải nghiệm phòng ${room.name} tại Kapi House. Tự nhận phòng 24/7, ấm cúng và đầy đủ tiện nghi.`,
  };
}

// Dynamic rendering for room details
export const dynamic = "force-dynamic";

export default async function RoomDetailPage({
  params,
  searchParams,
}: RoomDetailPageProps) {
  const [{ id }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const { data: room, error } = await getPublicRoomById(id);

  if (error || !room) {
    notFound();
  }

  const propertyId = getFirstParam(resolvedSearchParams.property_id);
  const checkIn = getFirstParam(
    resolvedSearchParams.check_in_at ??
      resolvedSearchParams.checkInAt ??
      resolvedSearchParams.check_in ??
      resolvedSearchParams["check-in"] ??
      resolvedSearchParams.checkin
  );
  const checkOut = getFirstParam(
    resolvedSearchParams.check_out_at ??
      resolvedSearchParams.checkOutAt ??
      resolvedSearchParams.check_out ??
      resolvedSearchParams["check-out"] ??
      resolvedSearchParams.checkout
  );
  const capacityRaw = getFirstParam(
    resolvedSearchParams.capacity ??
      resolvedSearchParams.max_guests ??
      resolvedSearchParams.guests
  );
  const conflict = getFirstParam(resolvedSearchParams.conflict);
  const initialConflict =
    conflict === "held"
      ? "Khung giờ này vừa được một khách khác chọn. Vui lòng chọn khung giờ khác."
      : undefined;

  const todayVN = getTodayInVietnam();
  const isHourly = checkIn.includes("T") || checkIn.includes(":");
  const hasValidDatePair = isHourly
    ? Boolean(checkIn && checkOut && checkOut > checkIn)
    : isValidCalendarDate(checkIn) &&
      isValidCalendarDate(checkOut) &&
      checkIn >= todayVN &&
      checkOut > checkIn;

  const capacityNum = /^\d+$/.test(capacityRaw) ? Number(capacityRaw) : 0;
  const initialGuests =
    Number.isInteger(capacityNum) &&
    capacityNum > 0 &&
    capacityNum <= room.capacity
      ? capacityNum
      : undefined;

  const catalogParams = new URLSearchParams();
  if (propertyId === room.property_id) {
    catalogParams.set("property_id", propertyId);
  }
  if (hasValidDatePair) {
    catalogParams.set("check_in", checkIn);
    catalogParams.set("check_out", checkOut);
  }
  if (initialGuests) {
    catalogParams.set("capacity", String(initialGuests));
  }

  const catalogQuery = catalogParams.toString();
  const catalogHref = catalogQuery ? `/rooms?${catalogQuery}` : "/rooms";

  return (
    <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 animate-page-entrance">
      {/* Back to catalog navigation */}
      <Link
        href={catalogHref}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#707072] hover:text-[#111111] mb-6 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Xem tất cả phòng</span>
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
        {/* Main Column (2 cols) */}
        <div className="lg:col-span-2 space-y-8">
          {/* Header Info */}
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {room.property && (
                <Badge variant="primary" size="sm">
                  {room.property.name}
                </Badge>
              )}
              <Badge variant="neutral" size="sm" icon={<Users className="w-3 h-3" />}>
                Tối đa {room.capacity} khách
              </Badge>
            </div>

            <h1 className="text-2xl sm:text-4xl font-normal text-[#111111] tracking-tight mb-2">
              {room.name}
            </h1>

            {room.property?.address && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs sm:text-sm text-[#707072]">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#707072] shrink-0" />
                  <span>{room.property.address}</span>
                </div>
                {room.property.maps_url && (
                  <a
                    href={room.property.maps_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[#111111] hover:underline font-medium"
                  >
                    <span>Xem bản đồ</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Gallery Component */}
          <Gallery
            imagePaths={room.image_paths}
            roomName={room.name}
          />

          {/* Video Walkthrough if present */}
          {room.media?.some((m) => m.media_type === "VIDEO") && (
            <div className="space-y-3 pt-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[#111111]">
                Video trải nghiệm phòng
              </h2>
              <div className="grid grid-cols-1 gap-4">
                {room.media
                  .filter((m) => m.media_type === "VIDEO")
                  .map((video) => {
                    const videoUrl =
                      video.storage_path.startsWith("http://") ||
                      video.storage_path.startsWith("https://") ||
                      video.storage_path.startsWith("/")
                        ? video.storage_path
                        : `${(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "")}/storage/v1/object/public/room-media/${video.storage_path.replace(/^\//, "")}`;
                    return (
                      <div
                        key={video.id}
                        className="border border-[#E5E5E5] bg-black overflow-hidden aspect-video"
                      >
                        <video
                          src={videoUrl}
                          controls
                          playsInline
                          muted
                          className="w-full h-full object-contain"
                        />
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Description Section */}
          <Reveal>
            <div className="space-y-3 pt-2">
              <h2 className="text-lg font-medium text-[#111111]">Mô tả phòng</h2>
              <p className="text-sm sm:text-base text-[#707072] leading-relaxed whitespace-pre-line">
                {room.description ||
                  "Phòng nghỉ đầy đủ tiện nghi, thiết kế ấm cúng hiện đại, lý tưởng cho kỳ nghỉ thư giãn và trải nghiệm trọn vẹn."}
              </p>
            </div>
          </Reveal>

          {/* Amenities Section */}
          <Reveal>
            <div className="pt-4 border-t border-[#E5E5E5]">
              <RoomAmenities amenities={room.amenities} />
            </div>
          </Reveal>

          {/* Stay Features & House Rules */}
          <Reveal>
            <div className="space-y-4 pt-4 border-t border-[#E5E5E5]">
              <h2 className="text-lg font-medium text-[#111111]">Quy chuẩn lưu trú Kapi Stay</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm text-[#707072]">
                <div className="flex items-start gap-3 p-4 border border-[#E5E5E5] bg-white">
                  <Clock className="w-4 h-4 text-[#111111] shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-[#111111] font-medium mb-0.5">
                      Nhận phòng tự phục vụ 24/7
                    </strong>
                    <span>
                      Chủ động nhận phòng bất kỳ lúc nào bằng mã khóa điện tử bảo mật.
                    </span>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 border border-[#E5E5E5] bg-white">
                  <ShieldCheck className="w-4 h-4 text-[#111111] shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-[#111111] font-medium mb-0.5">
                      Riêng tư & An toàn
                    </strong>
                    <span>
                      Không gian phòng độc lập hoàn toàn, hỗ trợ trực tuyến 24/7 khi cần.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>

        {/* Sidebar Column (1 col): Booking Widget */}
        <div className="lg:col-span-1">
          <RoomBookingWidget
            room={room}
            initialCheckIn={hasValidDatePair ? checkIn : undefined}
            initialCheckOut={hasValidDatePair ? checkOut : undefined}
            initialGuests={initialGuests}
            initialConflict={initialConflict}
          />
        </div>
      </div>
    </div>
  );
}
