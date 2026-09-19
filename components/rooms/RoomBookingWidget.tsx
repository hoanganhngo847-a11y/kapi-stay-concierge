"use client";

import * as React from "react";
import Link from "next/link";
import {
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Calendar,
  Phone,
  User,
  MapPin,
  Clock,
  Sparkles,
} from "lucide-react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { formatVND } from "@/lib/utils/format";
import type { PublicRoom } from "@/lib/data/rooms";

interface RoomBookingWidgetProps {
  room: PublicRoom;
  initialCheckIn?: string;
  initialCheckOut?: string;
}

export function RoomBookingWidget({
  room,
  initialCheckIn = "",
  initialCheckOut = "",
}: RoomBookingWidgetProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Đọc ngày trực tiếp từ URL thông qua useSearchParams (không dùng useState / useEffect)
  const checkIn =
    searchParams.get("check_in") ||
    searchParams.get("checkin") ||
    searchParams.get("checkIn") ||
    initialCheckIn ||
    "";

  const checkOut =
    searchParams.get("check_out") ||
    searchParams.get("checkout") ||
    searchParams.get("checkOut") ||
    initialCheckOut ||
    "";

  // Today's date string YYYY-MM-DD
  const todayStr = React.useMemo(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }, []);

  const [validationError, setValidationError] = React.useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [guestName, setGuestName] = React.useState("");
  const [guestPhone, setGuestPhone] = React.useState("");
  const [guestNote, setGuestNote] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [bookingSuccessData, setBookingSuccessData] = React.useState<{
    bookingCode: string;
    pinCode: string;
  } | null>(null);

  // Compute number of nights
  const nights = React.useMemo(() => {
    if (!checkIn || !checkOut) return 0;
    const d1 = new Date(checkIn);
    const d2 = new Date(checkOut);
    const diffTime = d2.getTime() - d1.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  }, [checkIn, checkOut]);

  const estimatedTotal = nights * room.nightly_price_vnd;

  const handleCheckInChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setValidationError(null);
    const params = new URLSearchParams(searchParams.toString());
    if (val) {
      params.set("check_in", val);
      params.set("checkIn", val);
    } else {
      params.delete("check_in");
      params.delete("checkIn");
    }
    if (checkOut && val >= checkOut) {
      params.delete("check_out");
      params.delete("checkOut");
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const handleCheckOutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setValidationError(null);
    const params = new URLSearchParams(searchParams.toString());
    if (val) {
      params.set("check_out", val);
      params.set("checkOut", val);
    } else {
      params.delete("check_out");
      params.delete("checkOut");
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const handleOpenBookingModal = (e: React.FormEvent) => {
    e.preventDefault();

    if (!checkIn) {
      setValidationError("Vui lòng chọn ngày nhận phòng (Check-in).");
      return;
    }
    if (!checkOut) {
      setValidationError("Vui lòng chọn ngày trả phòng (Check-out).");
      return;
    }
    if (checkOut <= checkIn) {
      setValidationError("Ngày trả phòng phải sau ngày nhận phòng ít nhất 1 đêm.");
      return;
    }

    setValidationError(null);
    setBookingSuccessData(null);
    setIsModalOpen(true);
  };

  const handleConfirmBooking = (e: React.FormEvent) => {
    e.preventDefault();

    if (!guestName.trim()) {
      alert("Vui lòng nhập họ và tên người đặt phòng.");
      return;
    }
    if (!guestPhone.trim() || guestPhone.trim().length < 9) {
      alert("Vui lòng nhập số điện thoại hợp lệ để nhận mã khóa phòng.");
      return;
    }

    setIsSubmitting(true);

    // Simulate instant reservation confirmation with generated 24/7 Digital PIN
    setTimeout(() => {
      const randomNum = Math.floor(100000 + Math.random() * 900000);
      const generatedCode = `KP-${randomNum}`;
      const generatedPin = `${Math.floor(100000 + Math.random() * 900000)}`;

      setBookingSuccessData({
        bookingCode: generatedCode,
        pinCode: generatedPin,
      });
      setIsSubmitting(false);
    }, 600);
  };

  return (
    <>
      <div className="bg-white rounded-2xl border border-dark/10 shadow-sm p-6 lg:p-7 sticky top-24">
        {/* Price header */}
        <div className="flex items-baseline justify-between pb-5 border-b border-dark/10 mb-6">
          <div>
            <span className="text-2xl sm:text-3xl font-bold text-primary">
              {formatVND(room.nightly_price_vnd)}
            </span>
            <span className="text-sm text-dark/60"> / đêm</span>
          </div>
          <span className="text-xs text-dark/50 font-medium">
            Tối đa {room.capacity} khách
          </span>
        </div>

        <form onSubmit={handleOpenBookingModal} className="space-y-4">
          {/* Date Selection Box */}
          <div className="rounded-xl border border-dark/15 overflow-hidden">
            <div className="grid grid-cols-2 divide-x divide-dark/15">
              {/* Check-in */}
              <div className="p-3 bg-light/30">
                <label
                  htmlFor="checkin-date"
                  className="block text-[11px] font-semibold text-dark/60 uppercase tracking-wider mb-1"
                >
                  Nhận phòng
                </label>
                <div className="relative">
                  <input
                    id="checkin-date"
                    type="date"
                    min={todayStr}
                    value={checkIn}
                    onChange={handleCheckInChange}
                    className="w-full bg-transparent text-sm font-medium text-dark focus:outline-none cursor-pointer"
                  />
                </div>
              </div>

              {/* Check-out */}
              <div className="p-3 bg-light/30">
                <label
                  htmlFor="checkout-date"
                  className="block text-[11px] font-semibold text-dark/60 uppercase tracking-wider mb-1"
                >
                  Trả phòng
                </label>
                <div className="relative">
                  <input
                    id="checkout-date"
                    type="date"
                    min={checkIn || todayStr}
                    value={checkOut}
                    onChange={handleCheckOutChange}
                    className="w-full bg-transparent text-sm font-medium text-dark focus:outline-none cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Validation Error */}
          {validationError && (
            <p className="text-xs text-red-600 font-medium" role="alert">
              {validationError}
            </p>
          )}

          {/* Price Estimation Preview */}
          {nights > 0 && (
            <div className="pt-2 pb-1 text-xs space-y-2 text-dark/70">
              <div className="flex justify-between items-center">
                <span>
                  {formatVND(room.nightly_price_vnd)} × {nights} đêm
                </span>
                <span className="font-semibold text-dark">
                  {formatVND(estimatedTotal)}
                </span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-dark/10 text-sm font-bold text-dark">
                <span>Tổng tiền dự kiến</span>
                <span className="text-primary">{formatVND(estimatedTotal)}</span>
              </div>
            </div>
          )}

          {/* CTA Button */}
          <Button
            type="submit"
            className="w-full h-12 text-base font-semibold shadow-sm justify-center"
            rightIcon={<ArrowRight className="w-4 h-4" />}
          >
            Đặt phòng ngay
          </Button>

          <div className="pt-4 border-t border-dark/10 flex items-center justify-center gap-2 text-xs text-dark/50">
            <ShieldCheck className="w-4 h-4 text-secondary shrink-0" />
            <span>Tự check-in 24/7 • Riêng tư tuyệt đối</span>
          </div>
        </form>
      </div>

      {/* Booking Confirmation & Success Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={
          bookingSuccessData ? (
            <span className="flex items-center gap-2 text-primary">
              <CheckCircle2 className="w-5 h-5" />
              Đặt phòng thành công!
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Xác nhận đặt phòng — {room.name}
            </span>
          )
        }
        size="lg"
      >
        {bookingSuccessData ? (
          // Success Screen
          <div className="space-y-6 py-2">
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-emerald-950 mb-1">
                Kỳ nghỉ của bạn đã được ghi nhận!
              </h3>
              <p className="text-xs text-emerald-800">
                Thông tin xác nhận đã sẵn sàng. Bạn có thể tự check-in 24/7 khi đến
                giờ nhận phòng.
              </p>
            </div>

            {/* Access credentials card */}
            <div className="bg-light/60 rounded-2xl p-5 border border-dark/10 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded-xl p-3.5 border border-dark/10 shadow-xs">
                  <span className="text-[11px] font-semibold text-dark/50 uppercase tracking-wider block mb-1">
                    Mã đặt phòng (Booking Code)
                  </span>
                  <span className="text-base sm:text-lg font-bold text-primary font-mono">
                    {bookingSuccessData.bookingCode}
                  </span>
                </div>

                <div className="bg-white rounded-xl p-3.5 border border-dark/10 shadow-xs">
                  <span className="text-[11px] font-semibold text-dark/50 uppercase tracking-wider block mb-1">
                    Mã PIN khóa phòng tạm thời
                  </span>
                  <span className="text-base sm:text-lg font-bold text-secondary font-mono flex items-center gap-1.5">
                    <KeyRound className="w-4 h-4" />
                    {bookingSuccessData.pinCode}
                  </span>
                </div>
              </div>

              {/* Summary Details */}
              <div className="space-y-2 pt-2 text-xs text-dark/70 border-t border-dark/10">
                <div className="flex justify-between">
                  <span className="text-dark/50">Phòng lưu trú:</span>
                  <strong className="text-dark">{room.name}</strong>
                </div>
                {room.property && (
                  <div className="flex justify-between">
                    <span className="text-dark/50">Địa chỉ chi nhánh:</span>
                    <strong className="text-dark text-right max-w-[65%]">
                      {room.property.address}
                    </strong>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-dark/50">Thời gian lưu trú:</span>
                  <strong className="text-dark">
                    {checkIn} (14:00) → {checkOut} (12:00) • {nights} đêm
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark/50">Khách lưu trú:</span>
                  <strong className="text-dark">{guestName} ({guestPhone})</strong>
                </div>
                <div className="flex justify-between pt-2 border-t border-dark/10 text-sm">
                  <span className="font-semibold text-dark">Tổng thanh toán:</span>
                  <strong className="text-primary text-base">
                    {formatVND(estimatedTotal)}
                  </strong>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Link
                href={`/my-stay?code=${bookingSuccessData.bookingCode}`}
                className="flex-1"
              >
                <Button className="w-full justify-center h-11">
                  Xem kỳ nghỉ của tôi
                </Button>
              </Link>
              <Button
                variant="outline"
                className="flex-1 justify-center h-11"
                onClick={() => setIsModalOpen(false)}
              >
                Đóng
              </Button>
            </div>
          </div>
        ) : (
          // Confirmation & Form Screen
          <form onSubmit={handleConfirmBooking} className="space-y-5 py-1">
            {/* Booking overview summary */}
            <div className="bg-light/50 rounded-xl p-4 border border-dark/10 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-dark/60">Cơ sở:</span>
                <span className="font-semibold text-dark flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-primary" />
                  {room.property?.name}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-dark/60">Thời gian nhận/trả:</span>
                <span className="font-semibold text-dark flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-primary" />
                  {checkIn} → {checkOut} ({nights} đêm)
                </span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-dark/10 text-sm">
                <span className="font-bold text-dark">Tổng cộng:</span>
                <span className="font-bold text-primary text-base">
                  {formatVND(estimatedTotal)}
                </span>
              </div>
            </div>

            {/* Contact details */}
            <div className="space-y-3.5">
              <div>
                <label
                  htmlFor="guest-name"
                  className="block text-xs font-semibold text-dark/80 mb-1.5"
                >
                  Họ và tên người đại diện *
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-3.5 pointer-events-none text-dark/40">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    id="guest-name"
                    required
                    type="text"
                    placeholder="Ví dụ: Nguyễn Văn A"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    className="w-full h-11 pl-10 pr-3.5 text-sm bg-white text-dark rounded-lg border border-dark/20 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-colors"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="guest-phone"
                  className="block text-xs font-semibold text-dark/80 mb-1.5"
                >
                  Số điện thoại nhận mã PIN mở khóa *
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-3.5 pointer-events-none text-dark/40">
                    <Phone className="w-4 h-4" />
                  </div>
                  <input
                    id="guest-phone"
                    required
                    type="tel"
                    placeholder="Ví dụ: 0988123456"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    className="w-full h-11 pl-10 pr-3.5 text-sm bg-white text-dark rounded-lg border border-dark/20 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-colors"
                  />
                </div>
                <span className="text-[11px] text-dark/50 block mt-1">
                  Mã khóa cửa điện tử 24/7 sẽ được gửi qua SMS/Zalo trước giờ check-in.
                </span>
              </div>

              <div>
                <label
                  htmlFor="guest-note"
                  className="block text-xs font-semibold text-dark/80 mb-1.5"
                >
                  Yêu cầu thêm (Tùy chọn)
                </label>
                <input
                  id="guest-note"
                  type="text"
                  placeholder="Ví dụ: Cần thêm chăn ga, nhận phòng muộn..."
                  value={guestNote}
                  onChange={(e) => setGuestNote(e.target.value)}
                  className="w-full h-11 px-3.5 text-sm bg-white text-dark rounded-lg border border-dark/20 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-colors"
                />
              </div>
            </div>

            {/* Check-in rules guarantee */}
            <div className="p-3 bg-amber-50/70 border border-amber-200/60 rounded-xl text-xs text-amber-900 flex items-start gap-2">
              <Clock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <span>
                Giờ nhận phòng: <strong>14:00</strong> • Giờ trả phòng:{" "}
                <strong>12:00</strong>. Khóa cửa kích hoạt mã tự động, khách đến bất
                kỳ lúc nào cũng có thể tự vào phòng.
              </span>
            </div>

            {/* Submit button */}
            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 h-11"
                onClick={() => setIsModalOpen(false)}
              >
                Hủy bỏ
              </Button>
              <Button
                type="submit"
                className="flex-1 h-11 justify-center"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Đang xử lý..." : "Xác nhận đặt phòng"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

export default RoomBookingWidget;
