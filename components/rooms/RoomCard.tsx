"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DoorOpen } from "lucide-react";
import { formatVND } from "@/lib/utils/format";
import type { PublicRoom } from "@/lib/data/rooms";

export interface RoomCardProps {
  id?: string;
  coverImage?: string;
  name?: string;
  location?: string;
  maxGuests?: number;
  bedType?: string;
  price?: number;
  room?: PublicRoom;
}

export function RoomCard(props: RoomCardProps) {
  const searchParams = useSearchParams();

  const {
    room,
    id = room?.id || "",
    name = room?.name || "Chưa cập nhật",
    location = room?.property?.name || room?.property?.address || "Chưa cập nhật",
    maxGuests = room?.capacity ?? 0,
    price = room?.hourly_price_vnd ?? room?.nightly_price_vnd ?? 0,
  } = props;

  const rawCover =
    props.coverImage ||
    (room?.image_paths && room.image_paths.length > 0
      ? room.image_paths[0]
      : "");

  const hasImage = Boolean(rawCover && rawCover.trim() !== "");

  // Chỉ giữ property_id để Back button trên Room Detail có thể quay lại đúng chi nhánh.
  // Không mang theo các tham số thời gian lưu trú hay số lượng khách sang Room Detail.
  const propertyId = searchParams?.get("property_id") ?? "";

  const queryParams = new URLSearchParams();
  if (propertyId) {
    queryParams.set("property_id", propertyId);
  }

  const queryString = queryParams.toString();
  const basePath = id ? `/rooms/${id}` : "/rooms";
  const detailHref = queryString ? `${basePath}?${queryString}` : basePath;

  return (
    <Link
      href={detailHref}
      className="group block select-none transition-opacity hover:opacity-95"
    >
      {/* Khung ảnh Cover: full bleed, zero radius, no border, no shadow */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#F5F5F5]">
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={rawCover}
            alt={name}
            className="w-full h-full object-cover transition-transform duration-[550ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.035] animate-in fade-in duration-400"
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

        {/* Neutral Placeholder dự phòng */}
        <div
          className={`room-placeholder w-full h-full flex flex-col items-center justify-center gap-2 p-6 text-center ${
            hasImage ? "hidden" : "flex"
          }`}
        >
          <div className="w-10 h-10 rounded-full bg-[#E5E5E5] text-[#707072] flex items-center justify-center">
            <DoorOpen className="w-5 h-5" />
          </div>
          <span className="text-xs text-[#707072] font-medium tracking-wide">
            KAPI STAY
          </span>
        </div>
      </div>

      {/* Information Hierarchy */}
      <div className="pt-3 pb-1">
        <h2 className="relative inline-block text-base sm:text-lg font-medium text-[#111111] line-clamp-1 transition-transform duration-200 ease-out group-hover:translate-x-[2px] after:content-[''] after:absolute after:bottom-0 after:left-0 after:h-[1px] after:w-full after:bg-[#111111] after:scale-x-0 group-hover:after:scale-x-100 after:transition-transform after:duration-[220ms] after:ease-out after:origin-left">
          {name}
        </h2>
        <p className="text-xs sm:text-sm text-[#707072] mt-0.5 line-clamp-1">
          {location}
        </p>
        <p className="text-xs sm:text-sm text-[#707072] mt-0.5">
          {maxGuests > 0 ? `${maxGuests} khách` : "Chưa cập nhật"}
        </p>
        <p className="text-sm sm:text-base font-medium text-[#111111] mt-2">
          {price > 0 ? `${formatVND(price)} / giờ` : "Chưa cập nhật"}
        </p>
      </div>
    </Link>
  );
}

export default RoomCard;
