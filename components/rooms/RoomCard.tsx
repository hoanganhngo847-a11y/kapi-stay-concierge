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

  // Đọc các query params hiện tại để giữ nguyên context khi đi sang Room Detail
  const propertyId = searchParams?.get("property_id") ?? "";
  const checkIn =
    searchParams?.get("check_in_at") ??
    searchParams?.get("checkInAt") ??
    searchParams?.get("check_in") ??
    searchParams?.get("check-in") ??
    searchParams?.get("checkin") ??
    "";
  const checkOut =
    searchParams?.get("check_out_at") ??
    searchParams?.get("checkOutAt") ??
    searchParams?.get("check_out") ??
    searchParams?.get("check-out") ??
    searchParams?.get("checkout") ??
    "";
  const capacityParam =
    searchParams?.get("capacity") ??
    searchParams?.get("max_guests") ??
    searchParams?.get("guests") ??
    "";

  // Nối các tham số lọc vào đường dẫn detailHref
  const queryParams = new URLSearchParams();
  if (propertyId) queryParams.set("property_id", propertyId);
  if (checkIn) {
    queryParams.set("check_in", checkIn);
    queryParams.set("check_in_at", checkIn);
  }
  if (checkOut) {
    queryParams.set("check_out", checkOut);
    queryParams.set("check_out_at", checkOut);
  }
  if (capacityParam) queryParams.set("capacity", capacityParam);

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
            className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
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
        <h2 className="text-base sm:text-lg font-medium text-[#111111] group-hover:underline underline-offset-4 line-clamp-1">
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
