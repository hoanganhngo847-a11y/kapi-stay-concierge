"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Coffee, Cookie, Utensils, Sparkles, CheckCircle2, ChevronRight } from "lucide-react";
import type { MenuProduct, MenuCategory } from "@/lib/data/menu";

interface MenuClientProps {
  initialProducts: MenuProduct[];
}

type FilterTab = "ALL" | MenuCategory;

const CATEGORY_CONFIG: Record<
  MenuCategory,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  DRINK: { label: "Nước uống", icon: Coffee },
  SNACK: { label: "Đồ ăn vặt", icon: Cookie },
  MAIN_FOOD: { label: "Đồ ăn chính", icon: Utensils },
};

export function MenuClient({ initialProducts }: MenuClientProps) {
  const [selectedTab, setSelectedTab] = useState<FilterTab>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredProducts = useMemo(() => {
    return initialProducts.filter((product) => {
      const matchCategory = selectedTab === "ALL" || product.category === selectedTab;
      if (!matchCategory) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const matchName = product.name.toLowerCase().includes(q);
      const matchDesc = product.description?.toLowerCase().includes(q) ?? false;
      return matchName || matchDesc;
    });
  }, [initialProducts, selectedTab, searchQuery]);

  const counts = useMemo(() => {
    return {
      ALL: initialProducts.length,
      DRINK: initialProducts.filter((p) => p.category === "DRINK").length,
      SNACK: initialProducts.filter((p) => p.category === "SNACK").length,
      MAIN_FOOD: initialProducts.filter((p) => p.category === "MAIN_FOOD").length,
    };
  }, [initialProducts]);

  return (
    <div className="min-h-screen bg-[#FDFDFD] text-[#111111]">
      {/* ── HERO SECTION ── */}
      <section className="border-b border-[#E5E5E5] bg-white pt-12 pb-14 px-4 sm:px-6 lg:px-8">
        <div className="max-w-[1200px] mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#E5E5E5] bg-[#F7F7F8] text-[11px] font-medium uppercase tracking-widest text-[#707072]">
            <Sparkles className="w-3.5 h-3.5 text-[#111111]" />
            Thực đơn phục vụ tại chỗ & nhận phòng
          </div>

          <h1 className="text-3xl sm:text-5xl font-light tracking-tight text-[#111111]">
            Menu Kapi
          </h1>

          <p className="text-sm sm:text-base text-[#707072] max-w-xl mx-auto font-normal">
            Đồ ăn &amp; thức uống cho kỳ nghỉ của bạn.
          </p>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/rooms"
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-[#111111] bg-[#111111] text-white text-xs font-medium tracking-wide hover:bg-black transition-colors"
            >
              Đặt phòng &amp; Chọn món ngay
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
            <Link
              href="/rewards"
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-[#E5E5E5] bg-white text-[#111111] text-xs font-medium tracking-wide hover:bg-[#F7F7F8] transition-colors"
            >
              Xem ưu đãi Rewards
            </Link>
          </div>
        </div>
      </section>

      {/* ── FILTER & SEARCH TOOLBAR ── */}
      <section className="sticky top-17 z-30 bg-white/95 backdrop-blur-[4px] border-b border-[#E5E5E5] px-4 sm:px-6 lg:px-8 py-4">
        <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* 3 Categories + Tất cả */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            <button
              type="button"
              onClick={() => setSelectedTab("ALL")}
              className={`px-3.5 py-1.5 text-xs font-medium tracking-wide transition-all whitespace-nowrap ${
                selectedTab === "ALL"
                  ? "bg-[#111111] text-white"
                  : "bg-white text-[#707072] border border-[#E5E5E5] hover:text-[#111111]"
              }`}
            >
              Tất cả ({counts.ALL})
            </button>

            <button
              type="button"
              onClick={() => setSelectedTab("DRINK")}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium tracking-wide transition-all whitespace-nowrap ${
                selectedTab === "DRINK"
                  ? "bg-[#111111] text-white"
                  : "bg-white text-[#707072] border border-[#E5E5E5] hover:text-[#111111]"
              }`}
            >
              <Coffee className="w-3.5 h-3.5" />
              Nước uống ({counts.DRINK})
            </button>

            <button
              type="button"
              onClick={() => setSelectedTab("SNACK")}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium tracking-wide transition-all whitespace-nowrap ${
                selectedTab === "SNACK"
                  ? "bg-[#111111] text-white"
                  : "bg-white text-[#707072] border border-[#E5E5E5] hover:text-[#111111]"
              }`}
            >
              <Cookie className="w-3.5 h-3.5" />
              Đồ ăn vặt ({counts.SNACK})
            </button>

            <button
              type="button"
              onClick={() => setSelectedTab("MAIN_FOOD")}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium tracking-wide transition-all whitespace-nowrap ${
                selectedTab === "MAIN_FOOD"
                  ? "bg-[#111111] text-white"
                  : "bg-white text-[#707072] border border-[#E5E5E5] hover:text-[#111111]"
              }`}
            >
              <Utensils className="w-3.5 h-3.5" />
              Đồ ăn chính ({counts.MAIN_FOOD})
            </button>
          </div>

          {/* Search box */}
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#9E9EA0]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm món ăn, đồ uống..."
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-[#E5E5E5] bg-[#FDFDFD] focus:bg-white focus:outline-none focus:border-[#111111] transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[#9E9EA0] hover:text-[#111111]"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── PRODUCT GRID ── */}
      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Helper Banner */}
        <div className="mb-8 p-4 border border-[#E5E5E5] bg-[#F7F7F8] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#707072]">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#111111] shrink-0" />
            <span>
              Thực đơn đồng bộ với bước Đặt phòng (Checkout) và các mốc Kapi Rewards (Day 10, Day 20, Day 40, Day 80).
            </span>
          </div>
          <span className="font-mono text-[#111111]">
            {filteredProducts.length} món sẵn sàng
          </span>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="py-20 text-center space-y-3 border border-dashed border-[#E5E5E5]">
            <p className="text-sm text-[#707072]">Không tìm thấy món phù hợp với tìm kiếm của bạn.</p>
            <button
              type="button"
              onClick={() => {
                setSelectedTab("ALL");
                setSearchQuery("");
              }}
              className="px-3.5 py-1.5 border border-[#111111] text-xs font-medium hover:bg-[#F7F7F8]"
            >
              Xem toàn bộ menu
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {filteredProducts.map((product) => {
              const catCfg = CATEGORY_CONFIG[product.category];
              const Icon = catCfg.icon;

              return (
                <div
                  key={product.id}
                  className="group border border-[#E5E5E5] bg-white p-5 flex flex-col justify-between hover:border-[#111111] transition-colors"
                >
                  <div className="space-y-2.5">
                    {/* Badge & Status */}
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#707072] uppercase tracking-wider">
                        <Icon className="w-3 h-3" />
                        {catCfg.label}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-[#228B22] font-mono">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#228B22]" />
                        Còn phục vụ
                      </span>
                    </div>

                    {/* Name */}
                    <h3 className="text-sm font-medium text-[#111111] leading-snug group-hover:text-black">
                      {product.name}
                    </h3>

                    {/* Description */}
                    {product.description && (
                      <p className="text-xs text-[#707072] line-clamp-2 leading-relaxed">
                        {product.description}
                      </p>
                    )}
                  </div>

                  {/* Price & Action */}
                  <div className="pt-4 mt-4 border-t border-[#F2F2F2] flex items-baseline justify-between">
                    <div>
                      <span className="text-xs text-[#707072] font-mono block">GIÁ NIÊM YẾT</span>
                      <span className="text-base font-medium text-[#111111]">
                        {product.price_vnd.toLocaleString("vi-VN")} ₫
                      </span>
                    </div>

                    <Link
                      href="/rooms"
                      className="text-[11px] font-medium text-[#111111] hover:underline flex items-center gap-0.5"
                    >
                      Chọn khi đặt
                      <ChevronRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
