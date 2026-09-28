import * as React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { getActiveProperties } from "@/lib/data/rooms";
import { BookingSearchControl } from "@/components/rooms/BookingSearchControl";
import { Reveal } from "@/components/ui/Reveal";
import { FixedBackgroundVideo } from "@/components/home/FixedBackgroundVideo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "KAPI STAY | Không gian riêng. Theo giờ của bạn.",
  description:
    "Đặt phòng linh hoạt theo giờ, tự check-in và chủ động thời gian lưu trú với hệ thống phòng cao cấp trên toàn quốc.",
};

// Cấu hình ảnh chi nhánh chất lượng cao (sharp, photography-first)
const LOCATION_IMAGES: Record<string, string> = {
  "hoàn kiếm": "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1200&q=80",
  "cầu giấy": "https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&w=1200&q=80",
  "quận 1": "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80",
  "bình thạnh": "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80",
  "mỹ khê": "https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=1200&q=80",
  "trung tâm": "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80",
  "trần phú": "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1200&q=80",
  "bãi cháy": "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=1200&q=80",
};

const DEFAULT_TILES = [
  { city: "Hà Nội", area: "Hoàn Kiếm", image: LOCATION_IMAGES["hoàn kiếm"] },
  { city: "Hà Nội", area: "Cầu Giấy", image: LOCATION_IMAGES["cầu giấy"] },
  { city: "TP.HCM", area: "Quận 1", image: LOCATION_IMAGES["quận 1"] },
  { city: "TP.HCM", area: "Bình Thạnh", image: LOCATION_IMAGES["bình thạnh"] },
  { city: "Đà Nẵng", area: "Mỹ Khê", image: LOCATION_IMAGES["mỹ khê"] },
  { city: "Đà Lạt", area: "Trung tâm", image: LOCATION_IMAGES["trung tâm"] },
  { city: "Nha Trang", area: "Trần Phú", image: LOCATION_IMAGES["trần phú"] },
  { city: "Hạ Long", area: "Bãi Cháy", image: LOCATION_IMAGES["bãi cháy"] },
];

export default async function HomePage() {
  const { data: properties = [] } = await getActiveProperties();

  // Ghép nối danh sách properties thực tế với visual tiles
  const propertyTiles = DEFAULT_TILES.map((tile) => {
    const matched = properties.find((p) =>
      p.name.toLowerCase().includes(tile.area.toLowerCase()) ||
      p.address.toLowerCase().includes(tile.area.toLowerCase())
    );
    return {
      ...tile,
      propertyId: matched?.id,
      slug: matched?.slug,
      name: matched?.name || `${tile.city} – ${tile.area}`,
    };
  });

  return (
    <div className="relative w-full flex flex-col bg-transparent min-h-screen">
      {/* ── 0. FIXED CINEMATIC BACKGROUND VIDEO (Persistent across entire homepage) ── */}
      <FixedBackgroundVideo />

      {/* ── 1. HERO SECTION (Photography-first, original room image, fully covers video) ── */}
      <section className="relative z-20 w-full h-[88vh] min-h-[580px] max-h-[920px] flex items-end overflow-hidden bg-[#111111]">
        {/* Full-bleed background photo (restored original room image) */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=2000&q=85"
            alt="Kapi Stay Không gian lưu trú cao cấp"
            className="w-full h-full object-cover select-none animate-hero-image"
          />
          {/* Subtle gradient overlay strictly for high-contrast typography readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/20" />
        </div>

        {/* Hero content */}
        <div className="relative z-10 w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pb-16 sm:pb-20 text-white">
          <p
            className="text-xs sm:text-sm font-medium tracking-[0.2em] uppercase text-white/80 mb-3 animate-hero-headline"
            style={{ animationDelay: "0ms" }}
          >
            KAPI STAY
          </p>
          <h1
            className="text-4xl sm:text-6xl lg:text-7xl font-normal tracking-tight leading-[1.02] max-w-3xl mb-4 animate-hero-headline"
            style={{ animationDelay: "60ms" }}
          >
            Không gian riêng.<br />
            Theo giờ của bạn.
          </h1>
          <p
            className="text-sm sm:text-base lg:text-lg text-white/90 max-w-xl font-normal leading-relaxed mb-8 animate-hero-headline"
            style={{ animationDelay: "120ms" }}
          >
            Đặt phòng linh hoạt theo giờ, tự check-in và chủ động thời gian lưu trú.
          </p>

          <div
            className="animate-hero-headline"
            style={{ animationDelay: "220ms" }}
          >
            <Link
              href="#search"
              className="inline-flex items-center justify-center px-8 py-3.5 rounded-full bg-white text-[#111111] hover:bg-[#F5F5F5] font-medium text-sm sm:text-base transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              Tìm phòng
            </Link>
          </div>
        </div>
      </section>

      {/* ── HOMEPAGE CONTENT LAYER (Transparent sections revealing the fixed background video) ── */}
      <div className="relative z-10 w-full bg-transparent">
        {/* ── 2. QUICK SEARCH SECTION (Booking search control) ── */}
        <section id="search" className="relative w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 bg-transparent">
          <Reveal>
            <div className="mb-6 inline-block bg-white/85 backdrop-blur-[4px] px-5 py-3 border border-[#E5E5E5]">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#707072] mb-1">
                Tìm phòng nhanh
              </p>
              <h2 className="text-2xl sm:text-3xl font-medium tracking-tight text-[#111111]">
                Chọn điểm đến và khung giờ của bạn
              </h2>
            </div>

            <BookingSearchControl properties={properties} />
          </Reveal>
        </section>

        {/* ── 3. LOCATIONS / PROPERTY TILES (Sharp photography grid) ── */}
        <section id="locations" className="relative w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 border-t border-[#E5E5E5]/60 bg-transparent">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
            <div className="inline-block bg-white/85 backdrop-blur-[4px] px-5 py-3 border border-[#E5E5E5]">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#707072] mb-1">
                Điểm đến
              </p>
              <h2 className="text-3xl sm:text-4xl font-normal tracking-tight text-[#111111]">
                Hệ thống Kapi Stay
              </h2>
            </div>

            <Link
              href="/rooms"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#111111] hover:underline underline-offset-4 bg-white/85 backdrop-blur-[4px] px-4 py-2 border border-[#E5E5E5] w-fit"
            >
              <span>Xem tất cả phòng</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* 4-column responsive grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {propertyTiles.map((tile, idx) => {
              const href = tile.propertyId ? `/rooms?property_id=${tile.propertyId}` : "/rooms";

              return (
                <Reveal key={tile.city + tile.area} delay={Math.min(300, idx * 60)}>
                  <Link
                    href={href}
                    className="group block relative overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111111]"
                  >
                    {/* Aspect ratio container */}
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#F5F5F5] group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={tile.image}
                        alt={`Kapi Stay ${tile.city} ${tile.area}`}
                        className="w-full h-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.025]"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/10 transition-opacity duration-300 group-hover:opacity-90" />
                    </div>

                    {/* Content overlay */}
                    <div className="absolute inset-0 p-5 flex flex-col justify-between pointer-events-none transition-transform duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-1">
                      <div>
                        <span className="text-[11px] font-medium tracking-widest uppercase text-white/80 block mb-1">
                          {tile.city}
                        </span>
                        <h3 className="text-2xl font-medium tracking-tight text-white">
                          {tile.area}
                        </h3>
                      </div>

                      <span className="inline-flex items-center px-4 py-1.5 rounded-full bg-white text-[#111111] text-xs font-medium opacity-90 group-hover:opacity-100 transition-all duration-400 hover:scale-[1.02]">
                        Khám phá
                      </span>
                    </div>
                  </Link>
                </Reveal>
              );
            })}
          </div>
        </section>

        {/* ── 4. KAPI REWARDS PRESENTATION ── */}
        <section id="rewards" className="relative w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 border-t border-[#E5E5E5]/60 bg-transparent">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            <div className="lg:col-span-6">
              <Reveal>
                <div className="p-6 sm:p-8 bg-white/85 backdrop-blur-[4px] border border-[#E5E5E5] space-y-4">
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#707072]">
                    Kapi Rewards
                  </p>
                  <h2 className="text-3xl sm:text-4xl font-normal tracking-tight text-[#111111] mt-2">
                    Tích lũy điểm.<br />Nhận ưu đãi kỳ nghỉ.
                  </h2>
                  <p className="text-sm sm:text-base text-[#707072] leading-relaxed max-w-lg mt-3">
                    Mỗi giờ lưu trú tại Kapi đều tích lũy điểm thưởng. Sử dụng điểm để quy đổi voucher giảm giá 40% trực tiếp khi đặt phòng.
                  </p>

                  <div className="pt-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full border border-[#111111] flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-3 h-3 text-[#111111]" />
                      </div>
                      <div className="text-sm">
                        <strong className="font-medium text-[#111111]">500 điểm = 1 Voucher 40%</strong>
                        <p className="text-xs text-[#707072]">Giảm tối đa 400.000đ, áp dụng cho mọi phòng.</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full border border-[#111111] flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-3 h-3 text-[#111111]" />
                      </div>
                      <div className="text-sm">
                        <strong className="font-medium text-[#111111]">Điểm danh mỗi ngày +5 điểm</strong>
                        <p className="text-xs text-[#707072]">Chỉ cần đăng nhập và xác nhận một chạm.</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full border border-[#111111] flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-3 h-3 text-[#111111]" />
                      </div>
                      <div className="text-sm">
                        <strong className="font-medium text-[#111111]">1 VND = 0.00025 điểm</strong>
                        <p className="text-xs text-[#707072]">Tích điểm tự động sau khi thanh toán thành công.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </Reveal>
            </div>

            {/* Loyalty card presentation */}
            <div className="lg:col-span-6">
              <Reveal delay={120}>
                <div className="border border-[#E5E5E5] bg-white p-6 sm:p-8">
                  <div className="flex items-center justify-between pb-6 border-b border-[#E5E5E5]">
                    <div>
                      <span className="text-xs uppercase tracking-widest text-[#707072]">
                        Điểm thành viên
                      </span>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-4xl sm:text-5xl font-normal text-[#111111]">
                          425
                        </span>
                        <span className="text-xs uppercase tracking-widest text-[#707072]">
                          POINTS
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-mono text-[#707072]">425 / 500</span>
                      <div className="w-32 h-1.5 bg-[#F5F5F5] rounded-full overflow-hidden mt-2">
                        <div className="w-[85%] h-full bg-[#111111]" />
                      </div>
                    </div>
                  </div>

                  <div className="py-6 border-b border-[#E5E5E5]">
                    <p className="text-xs sm:text-sm text-[#707072]">
                      Còn <strong>75 điểm</strong> để nhận voucher giảm giá 40% tiếp theo
                    </p>
                  </div>

                  <div className="pt-6 flex flex-col sm:flex-row items-center gap-3">
                    <Link
                      href="/login"
                      className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 rounded-full bg-[#111111] text-white text-xs sm:text-sm font-medium hover:bg-[#2A2A2A] transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                    >
                      Đăng nhập để xem ưu đãi
                    </Link>
                    <Link
                      href="/rooms"
                      className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 rounded-full border border-[#E5E5E5] text-[#111111] text-xs sm:text-sm font-medium hover:bg-[#F5F5F5] transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                    >
                      Khám phá phòng ngay
                    </Link>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── 5. THREE CORE SERVICE PRINCIPLES (Minimal typography rows) ── */}
        <section className="relative w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 border-t border-[#E5E5E5]/60 bg-transparent">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 sm:gap-12">
            {[
              {
                num: "01",
                title: "Tự nhận phòng 24/7",
                desc: "Mã mở cửa Digital Key được cấp tự động cho kỳ nghỉ của bạn. Đến và nhận phòng bất kỳ khung giờ nào mà không cần gặp lễ tân.",
              },
              {
                num: "02",
                title: "Không gian riêng biệt",
                desc: "Thiết kế tối giản, sạch sẽ, yên tĩnh và tiện nghi. Đảm bảo trải nghiệm nghỉ ngơi trọn vẹn và an tâm tuyệt đối.",
              },
              {
                num: "03",
                title: "Hỗ trợ kỹ thuật trực tuyến",
                desc: "Hệ thống Concierge và tổng đài trực tuyến hỗ trợ liên tục qua Hotline và tin nhắn, giải quyết thắc mắc tức thì.",
              },
            ].map((principle, idx) => (
              <Reveal key={principle.num} delay={idx * 80}>
                <div className="p-6 sm:p-8 bg-white/85 backdrop-blur-[4px] border border-[#E5E5E5] space-y-2 h-full">
                  <span className="text-xs font-mono text-[#707072]">{principle.num}</span>
                  <h3 className="text-lg font-medium text-[#111111]">{principle.title}</h3>
                  <p className="text-sm text-[#707072] leading-relaxed">
                    {principle.desc}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
