import * as React from "react";
import Link from "next/link";
import { ArrowLeft, DoorOpen, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { getPublicRooms } from "@/lib/data/rooms";
import { RoomCard } from "@/components/rooms/RoomCard";

export const metadata = {
  title: "Danh sách phòng | Kapi Stay Concierge",
  description:
    "Khám phá các phòng homestay tự check-in 24/7 thông minh tại Kapi House. Riêng tư, ấm cúng và đầy đủ tiện nghi.",
};

// Ensure catalog updates dynamically
export const dynamic = "force-dynamic";

export default async function RoomsPage() {
  const { data: rooms, error } = await getPublicRooms();

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-dark/60 hover:text-primary mb-2 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Quay lại trang chủ</span>
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold text-dark tracking-tight">
            Danh sách phòng tại Kapi House
          </h1>
          <p className="text-sm text-dark/60 mt-1">
            Tất cả các phòng đều được trang bị hệ thống tự check-in 24/7 bằng mã khóa riêng biệt.
          </p>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center max-w-lg mx-auto my-12">
          <div className="w-12 h-12 rounded-xl bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-dark mb-2">
            Không thể tải danh mục phòng
          </h2>
          <p className="text-sm text-dark/60 mb-6 leading-relaxed">
            Đã xảy ra sự cố khi kết nối với máy chủ dữ liệu. Quý khách vui lòng thử lại sau giây lát.
          </p>
          <Link href="/rooms">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Tải lại trang
            </Button>
          </Link>
        </div>
      )}

      {/* Empty State */}
      {!error && (!rooms || rooms.length === 0) && (
        <div className="bg-white border border-dark/10 rounded-2xl p-10 sm:p-14 text-center max-w-lg mx-auto my-12 shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
            <DoorOpen className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-dark mb-2">
            Hiện chưa có phòng được mở bán
          </h2>
          <p className="text-sm text-dark/60 mb-6 leading-relaxed">
            Kapi House đang cập nhật danh mục phòng lưu trú tự phục vụ. Quý khách vui lòng quay lại sau hoặc liên hệ Hotline để được hỗ trợ.
          </p>
          <Link href="/">
            <Button variant="outline" size="sm">
              Về trang chủ
            </Button>
          </Link>
        </div>
      )}

      {/* Room Grid */}
      {!error && rooms && rooms.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rooms.map((room) => (
            <RoomCard key={room.id} room={room} />
          ))}
        </div>
      )}
    </div>
  );
}
