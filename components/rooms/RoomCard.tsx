"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
  const searchParams = useSearchParams();

  const {
    room,
    id = room?.id || "",
    name = room?.name || "Chưa cập nhật",
    location = room?.property?.name || room?.property?.address || "Chưa cập nhật",
    maxGuests = room?.capacity ?? 0,
    bedType = room?.amenities?.find((a) =>
      a.toLowerCase().includes("giường") ||
      a.toLowerCase().includes("đệm") ||
      a.toLowerCase().includes("bed")
    ) || "Chưa cập nhật",
    price = room?.nightly_price_vnd ?? 0,
  } = props;

  const rawCover =
    props.coverImage ||
    (room?.image_paths && room.image_paths.length > 0
      ? room.image_paths[0]
      : "");

  const hasImage = Boolean(rawCover && rawCover.trim() !== "");

  // Đọc các query params hiện tại (check_in, check_out, capacity) từ URL
  const checkIn =
    searchParams?.get("check_in") ??
    searchParams?.get("check-in") ??
    searchParams?.get("checkin") ??
    "";
  const checkOut =
    searchParams?.get("check_out") ??
    searchParams?.get("check-out") ??
    searchParams?.get("checkout") ??
    "";
  const capacityParam =
    searchParams?.get("capacity") ??
    searchParams?.get("max_guests") ??
    searchParams?.get("guests") ??
    "";

  // Nối các tham số lọc vào đường dẫn detailHref để khách không bị mất dữ liệu lọc
  const queryParams = new URLSearchParams();
  if (checkIn) queryParams.set("check_in", checkIn);
  if (checkOut) queryParams.set("check_out", checkOut);
  if (capacityParam) queryParams.set("capacity", capacityParam);

  const queryString = queryParams.toString();
  const basePath = id ? `/rooms/${id}` : "/rooms";
  const detailHref = queryString ? `${basePath}?${queryString}` : basePath;

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
          className={`room-placeholder w-full h-full flex flex-col items-center justify-center gap-2 p-6 text-center ${hasImage ? "hidden" : "flex"
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
        {maxGuests > 0 && (
          <div className="absolute top-3 right-3 z-10">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-dark/70 text-white backdrop-blur-md shadow-sm">
              <Users className="w-3 h-3" />
              <span>Tối đa {maxGuests} khách</span>
            </span>
          </div>
        )}
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
            <span className="truncate font-medium">
              {maxGuests > 0 ? `${maxGuests} khách` : "Chưa cập nhật"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <BedDouble className="w-3.5 h-3.5 text-secondary shrink-0" />
            <span className="truncate font-medium">{bedType || "Chưa cập nhật"}</span>
          </div>
        </div>

        {/* Giá tiền và Nút Xem chi tiết */}
        <div className="pt-4 border-t border-dark/10 flex items-center justify-between mt-auto gap-3">
          <div>
            <span className="text-xs text-dark/50 block font-medium">Giá phòng</span>
            <div>
              {price > 0 ? (
                <>
                  <span className="text-lg font-bold text-primary">
                    {formatVND(price)}
                  </span>
                  <span className="text-xs text-dark/60"> / đêm</span>
                </>
              ) : (
                <span className="text-base font-semibold text-dark/60">
                  Chưa cập nhật
                </span>
              )}
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
