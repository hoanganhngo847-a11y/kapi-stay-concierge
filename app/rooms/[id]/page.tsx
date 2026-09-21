import * as React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  DoorOpen,
  MapPin,
  Users,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Clock,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { getPublicRoomById } from "@/lib/data/rooms";
import { RoomBookingWidget } from "@/components/rooms/RoomBookingWidget";

interface RoomDetailPageProps {
  params: Promise<{ id: string }>;
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

export default async function RoomDetailPage({ params }: RoomDetailPageProps) {
  const { id } = await params;
  const { data: room, error } = await getPublicRoomById(id);

  if (error || !room) {
    notFound();
  }

  const primaryImage =
    room.image_paths && room.image_paths.length > 0
      ? room.image_paths[0]
      : null;

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      {/* Back to catalog navigation */}
      <Link
        href="/rooms"
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
            {room.property && (
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="primary" size="sm" icon={<Sparkles className="w-3 h-3" />}>
                  {room.property.name}
                </Badge>
              </div>
            )}
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

          {/* Primary Visual Banner */}
          <div className="w-full h-72 sm:h-96 rounded-2xl border border-dark/10 bg-light/70 overflow-hidden relative flex items-center justify-center">
            {primaryImage && primaryImage.startsWith("/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={primaryImage}
                alt={room.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                  const parent = e.currentTarget.parentElement;
                  if (parent) {
                    const ph = parent.querySelector(".detail-placeholder");
                    if (ph) (ph as HTMLElement).style.display = "flex";
                  }
                }}
              />
            ) : null}

            {/* Tasteful Neutral Placeholder */}
            <div
              className={`detail-placeholder w-full h-full flex flex-col items-center justify-center gap-3 p-8 text-center ${
                primaryImage && primaryImage.startsWith("/") ? "hidden" : "flex"
              }`}
            >
              <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <DoorOpen className="w-8 h-8" />
              </div>
              <div className="flex flex-col items-center">
                <span className="font-semibold text-base text-dark">
                  Kapi Stay Concierge
                </span>
                <span className="text-xs text-dark/40 mt-0.5">
                  Hình ảnh thực tế đang được đồng bộ
                </span>
              </div>
            </div>

            <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-xs px-3 py-1.5 rounded-lg border border-dark/10 text-xs font-medium text-dark flex items-center gap-1.5 shadow-2xs">
              <Users className="w-3.5 h-3.5 text-primary" />
              <span>Sức chứa: Tối đa {room.capacity} khách</span>
            </div>
          </div>

          {/* Description Section */}
          <div className="space-y-3 pt-2">
            <h2 className="text-xl font-bold text-dark">Mô tả phòng</h2>
            <p className="text-sm sm:text-base text-dark/70 leading-relaxed whitespace-pre-line">
              {room.description ||
                "Phòng nghỉ đầy đủ tiện nghi, thiết kế ấm cúng hiện đại, lý tưởng cho kỳ nghỉ thư giãn và trải nghiệm Đà Lạt trọn vẹn."}
            </p>
          </div>

          {/* Amenities Section */}
          {room.amenities.length > 0 && (
            <div className="space-y-4 pt-4 border-t border-dark/10">
              <h2 className="text-xl font-bold text-dark">Tiện nghi có sẵn</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {room.amenities.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-light/40 border border-dark/5 text-sm text-dark/80"
                  >
                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

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
          <RoomBookingWidget room={room} />
        </div>
      </div>
    </div>
  );
}
