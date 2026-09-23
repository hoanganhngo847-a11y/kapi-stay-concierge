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
  Sparkles,
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
    resolvedSearchParams.check_in ??
      resolvedSearchParams["check-in"] ??
      resolvedSearchParams.checkin
  );
  const checkOut = getFirstParam(
    resolvedSearchParams.check_out ??
      resolvedSearchParams["check-out"] ??
      resolvedSearchParams.checkout
  );
  const capacityRaw = getFirstParam(
    resolvedSearchParams.capacity ??
      resolvedSearchParams.max_guests ??
      resolvedSearchParams.guests
  );

  const todayVN = getTodayInVietnam();
  const hasValidDatePair =
    isValidCalendarDate(checkIn) &&
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
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      {/* Back to catalog navigation */}
      <Link
        href={catalogHref}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-dark/60 hover:text-primary mb-6 transition-colors"
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
                <Badge variant="primary" size="sm" icon={<Sparkles className="w-3 h-3" />}>
                  {room.property.name}
                </Badge>
              )}
              <Badge variant="neutral" size="sm" icon={<Users className="w-3 h-3" />}>
                Tối đa {room.capacity} khách
              </Badge>
            </div>

            <h1 className="text-2xl sm:text-4xl font-bold text-dark tracking-tight mb-3">
              {room.name}
            </h1>

            {room.property?.address && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-dark/70">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span>{room.property.address}</span>
                </div>
                {room.property.maps_url && (
                  <a
                    href={room.property.maps_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
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

          {/* Description Section */}
          <div className="space-y-3 pt-2">
            <h2 className="text-xl font-bold text-dark">Mô tả phòng</h2>
            <p className="text-sm sm:text-base text-dark/70 leading-relaxed whitespace-pre-line">
              {room.description ||
                "Phòng nghỉ đầy đủ tiện nghi, thiết kế ấm cúng hiện đại, lý tưởng cho kỳ nghỉ thư giãn và trải nghiệm Đà Lạt trọn vẹn."}
            </p>
          </div>

          {/* Amenities Section */}
          <div className="pt-4 border-t border-dark/10">
            <RoomAmenities amenities={room.amenities} />
          </div>

          {/* Stay Features & House Rules */}
          <div className="space-y-4 pt-4 border-t border-dark/10">
            <h2 className="text-xl font-bold text-dark">Quy chuẩn lưu trú Kapi Stay</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-dark/70">
              <div className="flex items-start gap-2.5 p-3.5 rounded-xl border border-dark/10 bg-white">
                <Clock className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-dark font-medium mb-0.5">
                    Nhận phòng tự phục vụ 24/7
                  </strong>
                  <span>
                    Chủ động nhận phòng bất kỳ lúc nào bằng mã khóa điện tử bảo mật.
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-3.5 rounded-xl border border-dark/10 bg-white">
                <ShieldCheck className="w-4 h-4 text-secondary shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-dark font-medium mb-0.5">
                    Riêng tư & An toàn tuyệt đối
                  </strong>
                  <span>
                    Hệ thống an ninh thông minh cùng đội ngũ hỗ trợ trực tuyến 24/7.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Column (1 col): Booking Widget */}
        <div className="lg:col-span-1">
          <RoomBookingWidget
            room={room}
            initialCheckIn={hasValidDatePair ? checkIn : undefined}
            initialCheckOut={hasValidDatePair ? checkOut : undefined}
            initialGuests={initialGuests}
          />
        </div>
      </div>
    </div>
  );
}
