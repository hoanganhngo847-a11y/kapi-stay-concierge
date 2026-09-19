"use client";

import * as React from "react";
import Link from "next/link";
import { DoorOpen, Users, ArrowRight, MapPin, KeyRound, BedDouble } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatVND } from "@/lib/utils/format";
import type { PublicRoom } from "@/lib/data/rooms";

export interface RoomCardProps {
  // Thông tin tĩnh của phòng theo đúng yêu cầu
  id?: string;
  coverImage?: string;
  name?: string;
  location?: string;
  maxGuests?: number;
  bedType?: string;
  price?: number;

  // Hỗ trợ truyền theo đối tượng room (nếu có)
  room?: PublicRoom;
}

export function RoomCard(props: RoomCardProps) {
  const {
    room,
    id = room?.id || "",
    name = room?.name || "Phòng nghỉ Kapi House",
    location = room?.property?.name || room?.property?.address || "Hải Phòng",
    maxGuests = room?.capacity || 2,
    bedType = room?.amenities?.find((a) =>
      a.toLowerCase().includes("giường") ||
      a.toLowerCase().includes("đệm") ||
      a.toLowerCase().includes("bed")
    ) || "1 Giường đôi King size",
    price = room?.nightly_price_vnd || 250000,
  } = props;

  const rawCover =
    props.coverImage ||
    (room?.image_paths && room.image_paths.length > 0
      ? room.image_paths[0]
      : "/rooms/japan-t4.jpg");

  const hasImage = Boolean(rawCover);
  const detailHref = id ? `/rooms/${id}` : "/rooms";

  return (
    <div className="bg-white rounded-2xl border border-dark/10 overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col group">
      {/* Khung ảnh Cover với Badge "Self check-in" */}
      <div className="h-52 bg-light/70 border-b border-dark/10 flex items-center justify-center relative overflow-hidden">
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={rawCover}
            alt={name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={(e) => {
              e.currentTarget.style.display = "none";
              const parent = e.currentTarget.parentElement;
              if (parent) {
                const placeholder = parent.querySelector(".room-placeholder");
                if (placeholder) (placeholder as HTMLElement).style.display = "flex";
              }
            }}
          />
        ) : null}

        {/* Placeholder dự phòng */}
        <div
          className={`room-placeholder w-full h-full flex flex-col items-center justify-center gap-2 p-6 text-center ${
            hasImage ? "hidden" : "flex"
          }`}
        >
          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <DoorOpen className="w-6 h-6" />
          </div>
          <span className="text-xs text-dark/40 font-medium tracking-wide">
            Kapi Stay Concierge
          </span>
        </div>

        {/* Badge "Self check-in" bắt buộc theo yêu cầu */}
        <div className="absolute top-3 left-3 z-10">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-700/90 text-white backdrop-blur-md shadow-sm">
            <KeyRound className="w-3 h-3" />
            <span>Self check-in</span>
          </span>
        </div>

        {/* Badge số khách tối đa */}
        <div className="absolute top-3 right-3 z-10">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-dark/70 text-white backdrop-blur-md shadow-sm">
            <Users className="w-3 h-3" />
            <span>Tối đa {maxGuests} khách</span>
          </span>
        </div>
      </div>

      {/* Nội dung thông tin tĩnh của thẻ */}
      <div className="p-5 sm:p-6 flex flex-col flex-1">
        {/* Vị trí phòng */}
        {location && (
          <div className="flex items-center gap-1.5 text-xs text-primary font-medium mb-1.5">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{location}</span>
          </div>
        )}

        {/* Tên phòng */}
        <h2 className="text-lg font-bold text-dark mb-2 group-hover:text-primary transition-colors">
          <Link href={detailHref}>{name}</Link>
        </h2>

        {/* Thông tin số khách và loại giường */}
        <div className="grid grid-cols-2 gap-2 my-3 py-2.5 px-3 rounded-xl bg-light/50 border border-dark/5 text-xs text-dark/80">
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="truncate font-medium">{maxGuests} khách</span>
          </div>
          <div className="flex items-center gap-1.5">
            <BedDouble className="w-3.5 h-3.5 text-secondary shrink-0" />
            <span className="truncate font-medium">{bedType}</span>
          </div>
        </div>

        {/* Giá tiền và Nút Xem chi tiết */}
        <div className="pt-4 border-t border-dark/10 flex items-center justify-between mt-auto gap-3">
          <div>
            <span className="text-xs text-dark/50 block font-medium">Giá phòng</span>
            <div>
              <span className="text-lg font-bold text-primary">
                {formatVND(price)}
              </span>
              <span className="text-xs text-dark/60"> / đêm</span>
            </div>
          </div>

          <Link href={detailHref}>
            <Button size="sm" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
              Xem chi tiết
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default RoomCard;
