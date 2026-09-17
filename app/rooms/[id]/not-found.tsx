import * as React from "react";
import Link from "next/link";
import { DoorClosed, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function RoomNotFound() {
  return (
    <div className="w-full max-w-lg mx-auto py-16 sm:py-24 px-4 text-center">
      <div className="bg-white rounded-2xl border border-dark/10 shadow-sm p-8 sm:p-10">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
          <DoorClosed className="w-7 h-7" />
        </div>
        <h1 className="text-2xl font-bold text-dark mb-2">
          Không tìm thấy phòng
        </h1>
        <p className="text-sm text-dark/60 mb-6 leading-relaxed">
          Phòng bạn đang tìm kiếm không tồn tại hoặc đã ngừng mở bán trên hệ thống Kapi House.
        </p>
        <Link href="/rooms">
          <Button leftIcon={<ArrowLeft className="w-4 h-4" />}>
            Xem danh sách phòng khác
          </Button>
        </Link>
      </div>
    </div>
  );
}
