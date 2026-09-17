"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  KeyRound,
  Headset,
  Compass,
  ArrowRight,
  Sparkles,
  Search,
  ShieldCheck,
  DoorOpen,
} from "lucide-react";
import { Button, Badge, Input, Modal } from "@/components/ui";

export default function HomePage() {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [bookingCode, setBookingCode] = React.useState("");
  const [errorMessage, setErrorMessage] = React.useState("");

  const handleAccessMyStay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingCode.trim()) {
      setErrorMessage("Vui lòng nhập mã đơn đặt phòng (ví dụ: KP-1029)");
      return;
    }
    setErrorMessage("");
    setIsModalOpen(false);
    router.push(`/my-stay?code=${encodeURIComponent(bookingCode.trim().toUpperCase())}`);
  };

  return (
    <div className="w-full flex flex-col items-center">
      {/* Hero Section */}
      <section className="relative w-full overflow-hidden bg-gradient-to-b from-light/60 via-light/20 to-white py-16 sm:py-24 lg:py-28 px-4 sm:px-6">
        {/* Background decorative elements */}
        <div
          className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-primary/10 blur-3xl pointer-events-none"
          aria-hidden="true"
        />
        <div
          className="absolute top-1/2 -right-32 w-96 h-96 rounded-full bg-secondary/10 blur-3xl pointer-events-none"
          aria-hidden="true"
        />

        <div className="relative max-w-4xl mx-auto flex flex-col items-center text-center">
          {/* Badge */}
          <div className="mb-6 animate-in fade-in slide-in-from-top-4 duration-500">
            <Badge
              variant="primary"
              size="lg"
              dot
              icon={<Sparkles className="w-3.5 h-3.5" />}
              className="px-4 py-1.5 font-medium shadow-2xs"
            >
              Homestay Tự Phục Vụ Thông Minh
            </Badge>
          </div>

          {/* Headline */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-dark leading-[1.18] sm:leading-[1.15] mb-6">
            Kapi Stay – Trải nghiệm homestay tự check-in{" "}
            <span className="text-primary underline decoration-primary/30 decoration-wavy underline-offset-8">
              24/7 thông minh
            </span>{" "}
            không lễ tân
          </h1>

          {/* Subtitle */}
          <p className="max-w-2xl text-base sm:text-lg text-dark/70 mb-10 leading-relaxed">
            Tự do khám phá không giới hạn thời gian. Nhận phòng chủ động bằng mã khóa kỹ thuật số,
            tận hưởng không gian lưu trú ấm cúng, an toàn và riêng tư tuyệt đối tại Kapi House.
          </p>

          {/* CTA Buttons */}
          <div className="w-full sm:w-auto flex flex-col sm:flex-row items-center justify-center gap-3.5 sm:gap-4">
            <Link href="/rooms" className="w-full sm:w-auto">
              <Button
                size="lg"
                className="w-full sm:w-auto h-13 px-8 text-base font-semibold shadow-md hover:shadow-lg transition-all"
                rightIcon={<ArrowRight className="w-4 h-4" />}
              >
                Khám phá phòng
              </Button>
            </Link>

            <Button
              variant="outline"
              size="lg"
              onClick={() => setIsModalOpen(true)}
              className="w-full sm:w-auto h-13 px-6 text-base font-semibold bg-white/80 hover:bg-light/60 border-dark/20 text-dark"
              leftIcon={<KeyRound className="w-4 h-4 text-primary" />}
            >
              Truy cập phòng của bạn (My Stay)
            </Button>
          </div>

          {/* Trust points */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-xs font-medium text-dark/60">
            <div className="flex items-center gap-2">
              <DoorOpen className="w-4 h-4 text-primary" />
              <span>Khóa điện tử tự động</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-secondary" />
              <span>An ninh 24/7 & Bảo mật</span>
            </div>
            <div className="flex items-center gap-2">
              <Headset className="w-4 h-4 text-dark" />
              <span>Hỗ trợ kỹ thuật trực tuyến</span>
            </div>
          </div>
        </div>
      </section>

      {/* 3 Highlight Blocks Section */}
      <section className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <div className="text-center max-w-xl mx-auto mb-12 sm:mb-16">
          <h2 className="text-2xl sm:text-3xl font-bold text-dark tracking-tight mb-3">
            Đặc quyền lưu trú tại Kapi Stay
          </h2>
          <p className="text-sm sm:text-base text-dark/60">
            Mô hình homestay tự phục vụ hiện đại kết hợp công nghệ giúp kỳ nghỉ của bạn trọn vẹn và tự do nhất.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {/* Block 1: Check-in 1 chạm */}
          <div className="group relative bg-white rounded-2xl p-7 border border-dark/10 shadow-sm hover:shadow-md hover:border-primary/40 transition-all duration-300 flex flex-col">
            <div className="w-14 h-14 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <KeyRound className="w-7 h-7" />
            </div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-xl font-bold text-dark">Check-in 1 chạm</h3>
              <Badge variant="primary" size="sm">Tức thì</Badge>
            </div>
            <p className="text-sm text-dark/70 leading-relaxed flex-1">
              Nhận mã PIN mở khóa cửa riêng biệt qua điện thoại. Bạn có thể tự do đến và nhận phòng bất kỳ khung giờ nào trong ngày mà không cần thủ tục giấy tờ hay gặp lễ tân.
            </p>
            <div className="mt-6 pt-4 border-t border-dark/5 flex items-center text-xs font-medium text-primary">
              <span>Tự do 24/7 • Không thủ tục rườm rà</span>
            </div>
          </div>

          {/* Block 2: Hỗ trợ sự cố tức thì */}
          <div className="group relative bg-white rounded-2xl p-7 border border-dark/10 shadow-sm hover:shadow-md hover:border-secondary/50 transition-all duration-300 flex flex-col">
            <div className="w-14 h-14 rounded-xl bg-secondary/20 text-secondary-800 border border-secondary/30 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <Headset className="w-7 h-7" />
            </div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-xl font-bold text-dark">Hỗ trợ sự cố tức thì</h3>
              <Badge variant="success" size="sm">&lt; 5 phút</Badge>
            </div>
            <p className="text-sm text-dark/70 leading-relaxed flex-1">
              Đội ngũ Concierge trực tuyến 24/7 qua Hotline và Zalo. Mọi thắc mắc về thiết bị phòng, mật khẩu wifi hay phát sinh kỹ thuật đều được xử lý chỉ trong vài phút.
            </p>
            <div className="mt-6 pt-4 border-t border-dark/5 flex items-center text-xs font-medium text-secondary-800">
              <span>Hotline túc trực 24/7 • Luôn sẵn sàng</span>
            </div>
          </div>

          {/* Block 3: Cẩm nang bản địa độc quyền */}
          <div className="group relative bg-white rounded-2xl p-7 border border-dark/10 shadow-sm hover:shadow-md hover:border-dark/30 transition-all duration-300 flex flex-col">
            <div className="w-14 h-14 rounded-xl bg-dark/10 text-dark border border-dark/15 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <Compass className="w-7 h-7" />
            </div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-xl font-bold text-dark">Cẩm nang bản địa</h3>
              <Badge variant="warning" size="sm">Độc quyền</Badge>
            </div>
            <p className="text-sm text-dark/70 leading-relaxed flex-1">
              Khám phá danh sách các quán ăn truyền thống ngon nức tiếng, góc cafe vibe chill và điểm check-in ít người biết được chính chủ nhà Kapi tuyển chọn dành riêng cho khách.
            </p>
            <div className="mt-6 pt-4 border-t border-dark/5 flex items-center text-xs font-medium text-dark/80">
              <span>Trải nghiệm như người bản địa • Chọn lọc kỹ</span>
            </div>
          </div>
        </div>
      </section>

      {/* Modal Truy cập My Stay */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setErrorMessage("");
        }}
        title="Truy cập phòng của bạn (My Stay)"
        description="Nhập mã đơn đặt phòng được gửi qua tin nhắn / email để xem hướng dẫn phòng, mã PIN mở cửa và tiện ích."
        size="md"
      >
        <form onSubmit={handleAccessMyStay} className="space-y-4 pt-2">
          <Input
            label="Mã đơn đặt phòng"
            placeholder="Ví dụ: KP-1029 hoặc mã booking của bạn"
            value={bookingCode}
            onChange={(e) => {
              setBookingCode(e.target.value);
              if (errorMessage) setErrorMessage("");
            }}
            errorMessage={errorMessage}
            startIcon={<Search className="w-4 h-4 text-dark/40" />}
            autoFocus
          />

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setIsModalOpen(false);
                setErrorMessage("");
              }}
            >
              Hủy
            </Button>
            <Button type="submit" rightIcon={<ArrowRight className="w-4 h-4" />}>
              Kiểm tra & Vào phòng
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
