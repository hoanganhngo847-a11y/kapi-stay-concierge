"use client";
import KeyCard from "@/components/my-stay/KeyCard";
import WifiWidget from "@/components/my-stay/WifiWidget";
import QuickActions from "@/components/my-stay/QuickActions";
import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { KeyRound, Search, ArrowRight, ShieldCheck, Phone } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { getMyStayBookingDetails, type MyStayBookingDetails } from "@/lib/api";
function MyStayContent() {
  const searchParams = useSearchParams();
  const initialCode = searchParams.get("code") || searchParams.get("booking") || "";
  const [prevCode, setPrevCode] = React.useState(initialCode);
  const [errorMessage, setErrorMessage] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [bookingCode, setBookingCode] = React.useState(initialCode);

  const [stayData, setStayData] = React.useState<MyStayBookingDetails | null>(null);

  if (initialCode !== prevCode) {
    setPrevCode(initialCode);
    setBookingCode(initialCode);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingCode.trim()) {
      setErrorMessage("Vui lòng nhập mã đơn đặt phòng (Ví dụ: KP-1029)");
      return;
    }
    setErrorMessage("");
    setIsLoading(true);

    try {
      const data = await getMyStayBookingDetails(bookingCode.trim());

      if (data) {
        setStayData(data);
      } else {
        setStayData(null);
        setErrorMessage("Không tìm thấy thông tin đặt phòng hoặc bạn không có quyền truy cập.");
      }
    } catch {
      setErrorMessage("Có lỗi xảy ra khi kết nối máy chủ. Vui lòng thử lại.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto py-12 sm:py-20 px-4">
      <div className="bg-white rounded-2xl border border-dark/10 shadow-sm p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center mx-auto mb-3">
            <KeyRound className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-dark">Truy cập phòng của bạn</h1>
          <p className="text-sm text-dark/60 mt-1">
            Tra cứu thông tin nhận phòng, hướng dẫn mật mã và tiện ích homestay
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Mã đơn đặt phòng (Booking Code)"
            placeholder="Ví dụ: KP-1029"
            value={bookingCode}
            onChange={(e) => {
              setBookingCode(e.target.value);
              if (errorMessage) setErrorMessage("");
            }}
            errorMessage={errorMessage}
            startIcon={<Search className="w-4 h-4 text-dark/40" />}
            autoFocus
          />

          <Button
            type="submit"
            isLoading={isLoading}
            className="w-full h-11 text-base font-medium"
            rightIcon={<ArrowRight className="w-4 h-4" />}
          >
            Tra cứu đơn phòng
          </Button>
        </form>

        <div className="mt-8 pt-6 border-t border-dark/10 flex flex-col gap-3 text-xs text-dark/60">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-secondary shrink-0" />
            <span>Mã đặt phòng được gửi qua SMS hoặc email khi đặt phòng thành công.</span>
          </div>
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-primary shrink-0" />
            <span>Cần trợ giúp khẩn cấp? Gọi Hotline <strong>1900 xxxx</strong></span>          </div>
        </div>
      </div>
      {/* Chỉ render KeyCard và WifiWidget khi tra cứu đúng dữ liệu từ Server */}
      {stayData ? (
        <>
          <KeyCard
            roomName={stayData.roomName || "Phòng nghỉ Kapi"}
            passcode={stayData.passcode || "123456"}
            address={stayData.propertyAddress || "Số 12 Ngõ 45 Chùa Bộc, Đống Đa, Hà Nội"}
            mapUrl={stayData.propertyMapsUrl || "https://maps.google.com"}
          />

          <WifiWidget
            ssid={stayData.wifiSsid || "Kapi Stay Free WiFi"}
            password={stayData.wifiPass || "kapistay2026"}
          />

          <QuickActions bookingId={bookingCode} />
        </>
      ) : (
        <div className="text-center py-6 text-sm text-dark/60 bg-gray-50 rounded-xl mt-6 border border-dark/5">
          Vui lòng nhập mã đơn đặt phòng hợp lệ phía trên để hiển thị Mã khóa cửa và Wi-Fi.
        </div>
      )}
    </div>
  );
}

export function MyStayClient() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-dark/60">Đang tải...</div>}>
      <MyStayContent />
    </Suspense>
  );
}