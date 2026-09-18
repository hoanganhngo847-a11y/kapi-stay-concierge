"use client";

import * as React from "react";
import {
  Coffee,
  ExternalLink,
  Flame,
  HelpCircle,
  KeyRound,
  MapPin,
  Navigation,
  Phone,
  Pill,
  Play,
  Sliders,
  Tv,
  Utensils,
  Wind,
  Wrench,
  Clock,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { cn } from "@/lib/utils";

/* ==========================================================================
   1. TYPES & DATA CONTRACTS (Sẵn sàng tích hợp tài nguyên từ TV9)
   ========================================================================== */

export type DeviceCategory = "lock" | "water_heater" | "ac" | "tv_media" | "other";

export interface DeviceInstruction {
  id: string;
  title: string;
  category: DeviceCategory;
  summary: string;
  steps: string[];
  tips?: string;
  mediaType: "video" | "image";
  mediaUrl?: string; // TV9 asset URL (video MP4 / WebM hoặc ảnh nét cao)
  thumbnailUrl?: string; // TV9 thumbnail placeholder
  duration?: string; // Thời lượng video (ví dụ: '0:20')
}

export type SpotCategory = "food" | "cafe" | "pharmacy";

export interface LocalSpot {
  id: string;
  name: string;
  category: SpotCategory;
  address: string;
  distanceText: string;
  estimatedTime: string;
  openingHours: string;
  priceRange?: string;
  highlight: string;
  mapsUrl?: string;
  phoneNumber?: string;
  imageUrl?: string; // TV9 spot image
  rating?: number;
}

/* ==========================================================================
   2. MOCK DATA CHUẨN MỰC (TV9 có thể thay thế bằng file JSON hoặc CMS sau)
   ========================================================================== */

export const DEFAULT_DEVICE_INSTRUCTIONS: DeviceInstruction[] = [
  {
    id: "dev-smart-lock",
    title: "Khóa cửa thông minh (Digital Key & PIN)",
    category: "lock",
    summary:
      "Cách mở cửa an toàn bằng mã số PIN cá nhân hoặc thẻ từ RFID được cấp trong kỳ nghỉ.",
    steps: [
      "Chạm tay nhẹ vào mặt kính cảm ứng để kích hoạt bàn phím phát sáng.",
      "Nhập dãy 6 chữ số mã PIN cá nhân được cấp trong mục 'My Stay'.",
      "Nhấn phím dấu thăng (#) hoặc chờ đèn LED chuyển sang màu xanh lá cây kèm tiếng bíp.",
      "Gạt tay nắm cửa xuống để mở. Cửa sẽ tự động khóa lại sau 5 giây khi đóng kín.",
    ],
    tips: "Nếu nhập sai quá 5 lần, khóa sẽ tạm ngừng nhận tín hiệu trong 3 phút. Hãy kiểm tra lại mã trên điện thoại.",
    mediaType: "video",
    mediaUrl: "",
    thumbnailUrl: "",
    duration: "0:25",
  },
  {
    id: "dev-water-heater",
    title: "Bình nóng lạnh & Vòi sen điều nhiệt",
    category: "water_heater",
    summary:
      "Hướng dẫn bật bình nước nóng đúng cách và sử dụng vòi sen có khóa an toàn nhiệt độ.",
    steps: [
      "Bật công tắc bình nóng lạnh (có đèn đỏ báo nguồn) ở cạnh cửa phòng tắm trước khi dùng 10 - 15 phút.",
      "Khi đèn chuyển sang màu xanh lá cây hoặc sau 15 phút, nước đã đạt độ nóng lý tưởng.",
      "Tại vòi sen, xoay núm điều nhiệt theo chiều mũi tên. Nút đỏ chống bỏng giữ nhiệt độ ở mức an toàn 38°C.",
      "Để tiết kiệm điện và đảm bảo an toàn tối đa, vui lòng tắt công tắc bình nóng lạnh trước khi bước vào tắm.",
    ],
    tips: "Hệ thống đã tích hợp aptomat chống giật ELCB tự ngắt ngay lập tức khi phát hiện rò rỉ điện.",
    mediaType: "image",
    mediaUrl: "",
    thumbnailUrl: "",
  },
  {
    id: "dev-air-conditioner",
    title: "Điều hòa hai chiều Inverter",
    category: "ac",
    summary:
      "Thiết lập nhiệt độ phòng thoải mái, tiết kiệm điện năng và sử dụng chế độ làm khô khi nồm ẩm.",
    steps: [
      "Nhấn nút POWER (màu đỏ hoặc cam) trên điều khiển cầm tay để khởi động điều hòa.",
      "Cài đặt chế độ làm mát: Nhấn nút MODE và chọn biểu tượng Bông Tuyết (COOL).",
      "Khuyến nghị cài đặt nhiệt độ từ 25°C đến 27°C để có giấc ngủ sâu và tránh sốc nhiệt.",
      "Vào mùa nồm ẩm, có thể chuyển sang chế độ Giọt Nước (DRY) để hút ẩm không khí nhanh chóng.",
    ],
    tips: "Hãy đóng kín cửa kính ban công và cửa chính khi bật điều hòa để phòng đạt độ lạnh nhanh nhất.",
    mediaType: "image",
    mediaUrl: "",
    thumbnailUrl: "",
  },
  {
    id: "dev-smart-tv",
    title: "Smart TV & Chiếu màn hình điện thoại",
    category: "tv_media",
    summary:
      "Kết nối Smart TV phòng với các ứng dụng giải trí Netflix, YouTube hoặc chia sẻ màn hình điện thoại.",
    steps: [
      "Sử dụng điều khiển TV bấm nút Nguồn để bật màn hình.",
      "Chọn ứng dụng yêu thích trên thanh menu chính (YouTube, Netflix có sẵn tài khoản khách).",
      "Để chiếu màn hình điện thoại: Kết nối điện thoại vào cùng mạng Wi-Fi của phòng, chọn tính năng AirPlay (iOS) hoặc Cast (Android).",
    ],
    tips: "Vui lòng không đăng xuất tài khoản trả phí có sẵn trên TV để phục vụ cho các khách lưu trú tiếp theo.",
    mediaType: "video",
    mediaUrl: "",
    thumbnailUrl: "",
    duration: "0:30",
  },
];

export const DEFAULT_LOCAL_SPOTS: LocalSpot[] = [
  {
    id: "spot-food-1",
    name: "Phở Bò Gia Truyền Cụ Chiêu",
    category: "food",
    address: "Số 18 Ngõ Huyện, Hàng Trống, Hoàn Kiếm",
    distanceText: "180m",
    estimatedTime: "2 phút đi bộ",
    openingHours: "06:00 - 11:30 | 17:30 - 21:00",
    priceRange: "55.000đ - 85.000đ",
    highlight: "Nước dùng ninh xương thơm phức vị gừng nướng, thịt bò tái lăn mềm và quẩy giòn thơm.",
    mapsUrl: "https://maps.google.com/?q=Pho+Bo+Gia+Truyen+Hang+Trong",
    phoneNumber: "0912 345 678",
    rating: 4.8,
  },
  {
    id: "spot-food-2",
    name: "Bún Chả Cửa Đông Đậm Vị",
    category: "food",
    address: "Số 42 Cửa Đông, Hàng Bồ, Hoàn Kiếm",
    distanceText: "350m",
    estimatedTime: "5 phút đi bộ",
    openingHours: "10:30 - 15:00",
    priceRange: "60.000đ - 70.000đ",
    highlight: "Chả nướng than hoa thơm lừng, nem cua bể giòn rụm chấm cùng nước mắm chua ngọt chuẩn vị Bắc.",
    mapsUrl: "https://maps.google.com/?q=Bun+Cha+Cua+Dong",
    phoneNumber: "0983 222 111",
    rating: 4.7,
  },
  {
    id: "spot-cafe-1",
    name: "Kapi Artisan Roastery & Coffee",
    category: "cafe",
    address: "Số 8 Tông Đản, Tràng Tiền, Hoàn Kiếm",
    distanceText: "250m",
    estimatedTime: "3 phút đi bộ",
    openingHours: "07:30 - 22:30",
    priceRange: "45.000đ - 75.000đ",
    highlight: "Cà phê pha phin hảo hạng, Cold Brew hoa quả mát lạnh cùng không gian sân vườn yên tĩnh.",
    mapsUrl: "https://maps.google.com/?q=Kapi+Coffee+Tong+Dan",
    phoneNumber: "024 3828 9999",
    rating: 4.9,
  },
  {
    id: "spot-cafe-2",
    name: "Cà Phê Muối & Trà Thảo Mộc Phố Cổ",
    category: "cafe",
    address: "Số 15 Lý Quốc Sư, Hàng Trống, Hoàn Kiếm",
    distanceText: "400m",
    estimatedTime: "5 phút đi bộ",
    openingHours: "07:00 - 23:00",
    priceRange: "35.000đ - 55.000đ",
    highlight: "Kem béo ngậy kết hợp vị mặn nhẹ độc đáo, góc view ngắm phố phường cổ kính.",
    mapsUrl: "https://maps.google.com/?q=Ca+Phe+Muoi+Ly+Quoc+Su",
    rating: 4.6,
  },
  {
    id: "spot-pharmacy-1",
    name: "Nhà Thuốc Tiện Ích Pharmacity 24/7",
    category: "pharmacy",
    address: "Số 26 Nhà Chung, Hàng Trống, Hoàn Kiếm",
    distanceText: "150m",
    estimatedTime: "2 phút đi bộ",
    openingHours: "Mở cửa 24/7",
    highlight: "Đầy đủ thuốc hạ sốt, dầu gió, thuốc tiêu hóa, băng gạc y tế và đồ vệ sinh cá nhân khẩn cấp.",
    mapsUrl: "https://maps.google.com/?q=Pharmacity+Nha+Chung",
    phoneNumber: "1800 6821",
    rating: 4.9,
  },
  {
    id: "spot-pharmacy-2",
    name: "Nhà Thuốc Long Châu Hoàn Kiếm",
    category: "pharmacy",
    address: "Số 84 Hàng Trống, Hoàn Kiếm",
    distanceText: "320m",
    estimatedTime: "4 phút đi bộ",
    openingHours: "06:30 - 22:30",
    highlight: "Dược sĩ tư vấn nhiệt tình, có sẵn các loại thuốc ngoại nhập và vitamin tăng cường sức khỏe.",
    mapsUrl: "https://maps.google.com/?q=Nha+Thuoc+Long+Chau+Hang+Trong",
    phoneNumber: "1800 6928",
    rating: 4.8,
  },
];

/* ==========================================================================
   3. GUEST GUIDE PROPS & COMPONENT CHÍNH
   ========================================================================== */

export interface GuestGuideProps {
  className?: string;
  deviceInstructions?: DeviceInstruction[];
  localSpots?: LocalSpot[];
  defaultTab?: "devices" | "local";
  onReportIssueClick?: () => void;
}

export function GuestGuide({
  className,
  deviceInstructions = DEFAULT_DEVICE_INSTRUCTIONS,
  localSpots = DEFAULT_LOCAL_SPOTS,
  defaultTab = "devices",
  onReportIssueClick,
}: GuestGuideProps) {
  const [activeTab, setActiveTab] = React.useState<"devices" | "local">(defaultTab);
  const [selectedDeviceCategory, setSelectedDeviceCategory] = React.useState<string>("all");
  const [selectedSpotCategory, setSelectedSpotCategory] = React.useState<string>("all");

  // Lọc thiết bị theo category
  const filteredDevices = React.useMemo(() => {
    if (selectedDeviceCategory === "all") return deviceInstructions;
    return deviceInstructions.filter((d) => d.category === selectedDeviceCategory);
  }, [deviceInstructions, selectedDeviceCategory]);

  // Lọc địa điểm theo category
  const filteredSpots = React.useMemo(() => {
    if (selectedSpotCategory === "all") return localSpots;
    return localSpots.filter((s) => s.category === selectedSpotCategory);
  }, [localSpots, selectedSpotCategory]);

  const getDeviceIcon = (category: DeviceCategory) => {
    switch (category) {
      case "lock":
        return <KeyRound className="w-5 h-5 text-primary" />;
      case "water_heater":
        return <Flame className="w-5 h-5 text-amber-500" />;
      case "ac":
        return <Wind className="w-5 h-5 text-sky-500" />;
      case "tv_media":
        return <Tv className="w-5 h-5 text-purple-500" />;
      default:
        return <Sliders className="w-5 h-5 text-secondary" />;
    }
  };

  const getSpotIcon = (category: SpotCategory) => {
    switch (category) {
      case "food":
        return <Utensils className="w-4 h-4 text-primary" />;
      case "cafe":
        return <Coffee className="w-4 h-4 text-amber-700" />;
      case "pharmacy":
        return <Pill className="w-4 h-4 text-emerald-600" />;
    }
  };

  const getSpotCategoryLabel = (category: SpotCategory) => {
    switch (category) {
      case "food":
        return "Ăn uống";
      case "cafe":
        return "Quán cà phê";
      case "pharmacy":
        return "Hiệu thuốc";
    }
  };

  return (
    <section className={cn("w-full max-w-6xl mx-auto space-y-6", className)}>
      {/* ================= HEADER THANH ĐIỀU HƯỚNG TAB ================= */}
      <div className="bg-white rounded-2xl border border-dark/10 shadow-sm p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-dark/10">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-primary" />
              <h2 className="text-xl sm:text-2xl font-bold text-dark tracking-tight">
                Cẩm nang phòng & Tiện ích lưu trú
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-dark/60 mt-1">
              Hướng dẫn sử dụng thiết bị và khám phá các địa điểm tiện ích quanh homestay
            </p>
          </div>

          {onReportIssueClick && (
            <Button
              variant="outline"
              size="sm"
              onClick={onReportIssueClick}
              leftIcon={<Wrench className="w-3.5 h-3.5 text-primary" />}
              className="shrink-0 text-xs sm:text-sm font-medium"
            >
              Báo sự cố thiết bị
            </Button>
          )}
        </div>

        {/* 2 Tab chính */}
        <div className="flex items-center gap-2 pt-4">
          <button
            type="button"
            onClick={() => setActiveTab("devices")}
            className={cn(
              "flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 rounded-xl text-sm font-medium transition-all",
              activeTab === "devices"
                ? "bg-primary text-white shadow-sm"
                : "bg-dark/5 text-dark/70 hover:bg-dark/10 hover:text-dark"
            )}
          >
            <Sliders className="w-4 h-4 shrink-0" />
            <span>Hướng dẫn thiết bị</span>
            <span
              className={cn(
                "text-xs px-2 py-0.5 rounded-full font-mono font-semibold",
                activeTab === "devices"
                  ? "bg-white/20 text-white"
                  : "bg-dark/10 text-dark/70"
              )}
            >
              {deviceInstructions.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("local")}
            className={cn(
              "flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 rounded-xl text-sm font-medium transition-all",
              activeTab === "local"
                ? "bg-primary text-white shadow-sm"
                : "bg-dark/5 text-dark/70 hover:bg-dark/10 hover:text-dark"
            )}
          >
            <MapPin className="w-4 h-4 shrink-0" />
            <span>Cẩm nang địa phương</span>
            <span
              className={cn(
                "text-xs px-2 py-0.5 rounded-full font-mono font-semibold",
                activeTab === "local"
                  ? "bg-white/20 text-white"
                  : "bg-dark/10 text-dark/70"
              )}
            >
              {localSpots.length}
            </span>
          </button>
        </div>
      </div>

      {/* ================= NỘI DUNG TAB 1: HƯỚNG DẪN THIẾT BỊ ================= */}
      {activeTab === "devices" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Bộ lọc nhanh thiết bị */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {[
              { id: "all", label: "Tất cả thiết bị" },
              { id: "lock", label: "Khóa cửa thông minh" },
              { id: "water_heater", label: "Bình nóng lạnh" },
              { id: "ac", label: "Điều hòa nhiệt độ" },
              { id: "tv_media", label: "Smart TV & Giải trí" },
            ].map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setSelectedDeviceCategory(filter.id)}
                className={cn(
                  "px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors border",
                  selectedDeviceCategory === filter.id
                    ? "bg-dark text-white border-dark"
                    : "bg-white text-dark/70 border-dark/10 hover:border-dark/30 hover:text-dark"
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {/* Danh sách thẻ thiết bị */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredDevices.map((device) => (
              <div
                key={device.id}
                className="bg-white rounded-2xl border border-dark/10 shadow-sm overflow-hidden flex flex-col justify-between hover:border-primary/30 transition-all duration-200"
              >
                <div>
                  {/* Media Placeholder dành riêng cho TV9 chèn Video / Ảnh nét cao */}
                  <div className="relative w-full aspect-video bg-gradient-to-br from-dark-50 to-dark-100 border-b border-dark/10 flex flex-col items-center justify-center p-4 text-center overflow-hidden group">
                    <div className="w-12 h-12 rounded-full bg-white/90 shadow-md text-primary flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                      {device.mediaType === "video" ? (
                        <Play className="w-5 h-5 ml-0.5 text-primary" />
                      ) : (
                        getDeviceIcon(device.category)
                      )}
                    </div>

                    <p className="text-xs font-medium text-dark/80">
                      {device.mediaType === "video"
                        ? `Video hướng dẫn thao tác (${device.duration || "15s"})`
                        : "Ảnh trực quan vị trí & nút bấm"}
                    </p>
                    <span className="text-[10px] text-dark/50 mt-0.5">
                      (Khu vực chuẩn bị đón tài nguyên media từ TV9)
                    </span>

                    {/* Badge loại media */}
                    <div className="absolute top-3 left-3">
                      <Badge variant="neutral" size="sm">
                        {device.mediaType === "video" ? "Video HD" : "Ảnh hướng dẫn"}
                      </Badge>
                    </div>
                  </div>

                  {/* Chi tiết nội dung hướng dẫn */}
                  <div className="p-5 sm:p-6 space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 rounded-xl bg-dark/5 shrink-0 mt-0.5">
                        {getDeviceIcon(device.category)}
                      </div>
                      <div>
                        <h3 className="text-base sm:text-lg font-bold text-dark leading-snug">
                          {device.title}
                        </h3>
                        <p className="text-xs sm:text-sm text-dark/60 mt-1 leading-relaxed">
                          {device.summary}
                        </p>
                      </div>
                    </div>

                    {/* Các bước thao tác */}
                    <div className="space-y-2.5 pt-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-dark/50">
                        Các bước thực hiện:
                      </h4>
                      <ol className="space-y-2">
                        {device.steps.map((step, idx) => (
                          <li
                            key={idx}
                            className="flex items-start gap-2.5 text-xs sm:text-sm text-dark/80"
                          >
                            <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0 flex items-center justify-center mt-0.5">
                              {idx + 1}
                            </span>
                            <span className="leading-relaxed">{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>

                    {/* Mẹo / Lưu ý an toàn */}
                    {device.tips && (
                      <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200/80 flex items-start gap-2.5 text-xs text-amber-900">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div className="leading-relaxed">
                          <strong className="font-semibold">Lưu ý: </strong>
                          {device.tips}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer chân thẻ có nút hỗ trợ sự cố */}
                {onReportIssueClick && (
                  <div className="px-5 sm:px-6 py-3.5 bg-dark/2 border-t border-dark/10 flex items-center justify-between text-xs">
                    <span className="text-dark/50 flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5" />
                      Gặp khó khăn khi sử dụng?
                    </span>
                    <button
                      type="button"
                      onClick={onReportIssueClick}
                      className="font-medium text-primary hover:underline hover:text-primary-700 transition-colors"
                    >
                      Báo lỗi thiết bị này &rarr;
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================= NỘI DUNG TAB 2: CẨM NANG ĐỊA PHƯƠNG ================= */}
      {activeTab === "local" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Bộ lọc nhanh tiện ích xung quanh */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {[
              { id: "all", label: "Tất cả địa điểm" },
              { id: "food", label: "Ăn uống ngon gần đây" },
              { id: "cafe", label: "Quán cà phê & Trà" },
              { id: "pharmacy", label: "Hiệu thuốc & Y tế" },
            ].map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setSelectedSpotCategory(filter.id)}
                className={cn(
                  "px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors border",
                  selectedSpotCategory === filter.id
                    ? "bg-dark text-white border-dark"
                    : "bg-white text-dark/70 border-dark/10 hover:border-dark/30 hover:text-dark"
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {/* Lưới thẻ cẩm nang ẩm thực & tiện ích */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredSpots.map((spot) => (
              <div
                key={spot.id}
                className="bg-white rounded-2xl border border-dark/10 shadow-sm p-5 flex flex-col justify-between hover:shadow-md hover:border-dark/20 transition-all duration-200"
              >
                <div className="space-y-3.5">
                  {/* Tag phân loại và khoảng cách */}
                  <div className="flex items-center justify-between gap-2">
                    <Badge
                      variant={
                        spot.category === "food"
                          ? "primary"
                          : spot.category === "cafe"
                          ? "secondary"
                          : "success"
                      }
                      size="sm"
                      icon={getSpotIcon(spot.category)}
                    >
                      {getSpotCategoryLabel(spot.category)}
                    </Badge>

                    <div className="flex items-center gap-1 text-xs text-dark/60 font-medium">
                      <Navigation className="w-3 h-3 text-primary" />
                      <span>{spot.distanceText}</span>
                      <span className="text-dark/30">•</span>
                      <span>{spot.estimatedTime}</span>
                    </div>
                  </div>

                  {/* Tên & Địa chỉ */}
                  <div>
                    <h3 className="text-base font-bold text-dark leading-snug">
                      {spot.name}
                    </h3>
                    <p className="text-xs text-dark/60 mt-1 flex items-start gap-1 leading-normal">
                      <MapPin className="w-3.5 h-3.5 text-dark/40 shrink-0 mt-0.5" />
                      <span>{spot.address}</span>
                    </p>
                  </div>

                  {/* Giờ mở cửa & Mức giá nếu có */}
                  <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-xs text-dark/70 pt-1 border-t border-dark/10">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-dark/40" />
                      {spot.openingHours}
                    </span>
                    {spot.priceRange && (
                      <span className="text-dark/50">Khoảng: {spot.priceRange}</span>
                    )}
                  </div>

                  {/* Điểm nổi bật / Món nên thử */}
                  <div className="p-3 rounded-xl bg-dark/2 border border-dark/10 text-xs text-dark/80 leading-relaxed">
                    <strong className="text-dark font-medium block mb-0.5">
                      Gợi ý trải nghiệm:
                    </strong>
                    {spot.highlight}
                  </div>
                </div>

                {/* Các nút tương tác: Chỉ đường & Gọi điện */}
                <div className="pt-4 mt-4 border-t border-dark/10 flex items-center gap-2">
                  {spot.mapsUrl && (
                    <a
                      href={spot.mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    >
                      <span>Chỉ đường</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}

                  {spot.phoneNumber && (
                    <a
                      href={`tel:${spot.phoneNumber.replace(/\s+/g, "")}`}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-dark/20 text-dark hover:bg-dark/5 transition-colors"
                      title={`Gọi ${spot.phoneNumber}`}
                    >
                      <Phone className="w-3.5 h-3.5 text-secondary" />
                      <span className="hidden sm:inline">Gọi quán</span>
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Banner hỗ trợ thêm địa điểm */}
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-dark flex items-center justify-center sm:justify-start gap-2">
                <CheckCircle className="w-4 h-4 text-primary" />
                Cần thêm gợi ý ẩm thực hoặc tour trải nghiệm riêng?
              </h4>
              <p className="text-xs text-dark/70 max-w-xl">
                Lễ tân Kapi Stay luôn sẵn lòng tư vấn các quán ngon bí truyền của người bản địa
                hoặc hỗ trợ đặt xe, thuê xe máy giá tốt.
              </p>
            </div>
            {onReportIssueClick && (
              <Button
                variant="primary"
                size="sm"
                onClick={onReportIssueClick}
                className="shrink-0 text-xs"
              >
                Nhắn lễ tân hỗ trợ
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default GuestGuide;
