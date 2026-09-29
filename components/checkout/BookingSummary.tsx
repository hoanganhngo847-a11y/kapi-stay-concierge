"use client";

/**
 * @file components/checkout/BookingSummary.tsx
 * @owner TV4 — Linh (feat/booking-checkout)
 *
 * Hiển thị tóm tắt đặt phòng, bảng kê chi phí, khu vực áp voucher,
 * và form thông tin khách lưu trú.
 *
 * Chỉ sử dụng: @/components/ui, @/lib/data/checkout, @/lib/utils/format
 * KHÔNG sửa bất kỳ file nào ngoài components/checkout/**
 */

import React, { useState, useTransition } from "react";
import {
  MapPin,
  Tag,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  X,
  Ticket,
  User,
  Phone,
  Mail,
  BedDouble,
  Gift,
  Utensils,
  Plus,
  Minus,
  Trash2,
  Search,
} from "lucide-react";
import { Button, Input, Badge, Reveal } from "@/components/ui";
import { formatVND } from "@/lib/utils/format";
import type { MenuProduct } from "@/lib/data/menu";
import type {
  CheckoutSessionWithRoom,
  CheckoutVoucherItem,
  CheckoutPhysicalReward,
  CheckoutMenuItem,
  CheckoutMenuItemRecord,
  CheckoutMenuItemPayload,
} from "@/lib/data/checkout";

// ---------------------------------------------------------------------------
// Kiểu dữ liệu
// ---------------------------------------------------------------------------

export interface GuestInfo {
  fullName: string;
  phone: string;
  email: string;
}

export interface GuestInfoErrors {
  fullName?: string;
  phone?: string;
  email?: string;
}

export interface BookingSummaryProps {
  /** Dữ liệu phiên checkout kèm chi tiết phòng */
  session: CheckoutSessionWithRoom;
  /** Danh sách voucher còn hiệu lực của user */
  availableVouchers: CheckoutVoucherItem[];
  /** ID redemption đang được chọn (null = chưa chọn) */
  selectedRedemptionId: string | null;
  /** Số tiền được giảm hiện tại */
  discountAmountVnd: number;
  /** Callback khi user áp / hủy voucher */
  onApplyVoucher: (redemptionId: string) => Promise<void>;
  onReleaseVoucher: () => Promise<void>;
  /** Trạng thái đang xử lý voucher */
  isVoucherLoading: boolean;
  /** Lỗi voucher từ server */
  voucherError: string | null;
  /** Danh sách phần thưởng hiện vật / ẩm thực còn hiệu lực */
  availablePhysicalRewards?: CheckoutPhysicalReward[];
  /** ID entitlement phần thưởng hiện vật đang chọn */
  selectedPhysicalRewardId?: string | null;
  /** ID món ăn đã chọn (nếu là MEAL_CHOICE) */
  selectedMenuItemId?: string | null;
  /** Danh mục thực đơn phần thưởng đang active */
  menuItems?: CheckoutMenuItem[];
  /** Toàn bộ catalog món ăn & thức uống active */
  allMenuProducts?: MenuProduct[];
  /** Danh sách món user đã chọn trong phiên checkout */
  selectedMenuItems?: CheckoutMenuItemRecord[];
  /** Tổng tiền món ăn & thức uống (tính từ server) */
  menuAmountVnd?: number;
  /** Callback cập nhật danh sách món (thêm, sửa số lượng, xóa) */
  onUpdateMenuItems?: (itemsPayload: CheckoutMenuItemPayload[]) => Promise<void>;
  /** Trạng thái đang tải/cập nhật món */
  isMenuLoading?: boolean;
  /** Lỗi cập nhật thực đơn */
  menuError?: string | null;
  /** Callback áp phần thưởng hiện vật */
  onApplyPhysicalReward?: (entitlementId: string, menuItemId?: string) => Promise<void>;
  /** Callback hủy phần thưởng hiện vật */
  onReleasePhysicalReward?: () => Promise<void>;
  /** Trạng thái đang xử lý phần thưởng */
  isPhysicalRewardLoading?: boolean;
  /** Lỗi phần thưởng từ server */
  physicalRewardError?: string | null;
  /** Thông tin khách hiện tại */
  guestInfo: GuestInfo;
  /** Lỗi validation thông tin khách */
  guestInfoErrors: GuestInfoErrors;
  /** Callback cập nhật thông tin khách */
  onGuestInfoChange: (field: keyof GuestInfo, value: string) => void;
  /** Callback khi user bấm "Tiến hành thanh toán" */
  onProceedToPayment: () => void;
  /** Đang xử lý (nút CTA) */
  isSubmitting: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Tính số giờ giữa 2 mốc thời gian (check_in_at / check_out_at hoặc legacy check_in / check_out) */
function calcHours(
  checkInAt?: string | null,
  checkOutAt?: string | null,
  checkIn?: string | null,
  checkOut?: string | null
): number {
  const startStr = checkInAt || (checkIn ? (checkIn.includes("T") ? checkIn : `${checkIn}T14:00:00+07:00`) : "");
  const endStr = checkOutAt || (checkOut ? (checkOut.includes("T") ? checkOut : `${checkOut}T18:00:00+07:00`) : "");
  if (!startStr || !endStr) return 2;
  const a = new Date(startStr).getTime();
  const b = new Date(endStr).getTime();
  const diffMinutes = Math.max(0, (b - a) / (1000 * 60));
  return Math.max(2, Math.ceil(diffMinutes / 60));
}

/** Format thời gian hiển thị thân thiện (HH:mm dd/MM/yyyy hoặc dd/MM/yyyy) */
function formatDateTime(isoOrDateStr?: string | null): string {
  if (!isoOrDateStr) return "—";
  try {
    const d = new Date(isoOrDateStr);
    if (isNaN(d.getTime())) return isoOrDateStr;
    if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDateStr)) {
      const [y, m, day] = isoOrDateStr.split("-");
      return `${day}/${m}/${y}`;
    }
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour12: false,
    }).format(d);
  } catch {
    return isoOrDateStr;
  }
}

/** Format thời gian hết hạn voucher còn lại */
function formatVoucherExpiry(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Đã hết hạn";
  const hours = Math.floor(diff / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (hours > 0) return `Còn ${hours}g ${mins}p`;
  return `Còn ${mins} phút`;
}

// ---------------------------------------------------------------------------
// Sub-component: VoucherCard — mỗi voucher trong danh sách
// ---------------------------------------------------------------------------

interface VoucherCardProps {
  item: CheckoutVoucherItem;
  isSelected: boolean;
  grossAmountVnd: number;
  onSelect: (redemptionId: string) => void;
  disabled: boolean;
}

function VoucherCard({
  item,
  isSelected,
  grossAmountVnd,
  onSelect,
  disabled,
}: VoucherCardProps) {
  const v = item.voucher;
  if (!v) return null;

  const eligibleBase = Math.min(grossAmountVnd, v.max_eligible_base_vnd);
  const discount = Math.floor((eligibleBase * v.discount_percentage) / 100);

  const sourceLabel =
    v.source === "150_DAY_STREAK"
      ? "150-Day Streak Reward"
      : v.source === "365_DAY_STREAK"
      ? "365-Day Streak Reward"
      : "500 Points Reward";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(item.id)}
      aria-pressed={isSelected}
      className={[
        "w-full text-left border p-4 transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#111111]",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        isSelected
          ? "border-[#111111] bg-[#F5F5F5]"
          : "border-[#E5E5E5] bg-white hover:border-[#111111]",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Icon + Tên voucher */}
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={[
              "shrink-0 w-8 h-8 flex items-center justify-center",
              isSelected
                ? "bg-[#111111] text-white"
                : "bg-[#F5F5F5] text-[#111111]",
            ].join(" ")}
          >
            <Ticket className="w-4 h-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-[#111111] truncate">{v.name}</p>
              <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 bg-[#EAEAEA] text-[#333333]">
                {sourceLabel}
              </span>
            </div>
            <p className="text-xs text-[#707072] mt-0.5">
              Giảm {v.discount_percentage}% · Tối đa{" "}
              {formatVND(
                Math.floor((v.max_eligible_base_vnd * v.discount_percentage) / 100)
              )}
            </p>
          </div>
        </div>

        {/* Số tiền giảm + badge */}
        <div className="shrink-0 text-right">
          <p className="text-sm font-medium text-[#111111]">-{formatVND(discount)}</p>
          <div className="flex items-center gap-1 mt-1 justify-end">
            <Clock className="w-3 h-3 text-[#707072]" aria-hidden="true" />
            <span className="text-xs text-[#707072]">
              {formatVoucherExpiry(item.expires_at)}
            </span>
          </div>
        </div>
      </div>

      {/* Checkbox indicator */}
      {isSelected && (
        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-[#E5E5E5]">
          <CheckCircle2
            className="w-3.5 h-3.5 text-[#111111] shrink-0"
            aria-hidden="true"
          />
          <span className="text-xs font-medium text-[#111111]">
            Đã áp dụng voucher này
          </span>
        </div>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component: BookingSummary
// ---------------------------------------------------------------------------

export function BookingSummary({
  session,
  availableVouchers,
  selectedRedemptionId,
  discountAmountVnd,
  onApplyVoucher,
  onReleaseVoucher,
  isVoucherLoading,
  voucherError,
  availablePhysicalRewards = [],
  selectedPhysicalRewardId = null,
  selectedMenuItemId = null,
  menuItems = [],
  allMenuProducts = [],
  selectedMenuItems = [],
  menuAmountVnd = 0,
  onUpdateMenuItems,
  isMenuLoading = false,
  menuError = null,
  onApplyPhysicalReward,
  onReleasePhysicalReward,
  isPhysicalRewardLoading = false,
  physicalRewardError = null,
  guestInfo,
  guestInfoErrors,
  onGuestInfoChange,
  onProceedToPayment,
  isSubmitting,
}: BookingSummaryProps) {
  const [showVoucherPanel, setShowVoucherPanel] = useState(false);
  const [showPhysicalRewardPanel, setShowPhysicalRewardPanel] = useState(false);
  const [showCatalogPicker, setShowCatalogPicker] = useState(false);
  const [menuSearch, setMenuSearch] = useState("");
  const [menuActiveCategory, setMenuActiveCategory] = useState<"ALL" | "DRINK" | "SNACK" | "MAIN_FOOD">("ALL");

  const [tempMenuItemId, setTempMenuItemId] = useState<string | null>(
    selectedMenuItemId || (menuItems.length > 0 ? menuItems[0].id : null)
  );
  const [isPending, startTransition] = useTransition();

  const hours = calcHours(
    session.check_in_at,
    session.check_out_at,
    session.check_in,
    session.check_out
  );
  const gross = session.gross_amount_vnd;
  const discount = discountAmountVnd;
  const menuTotal = menuAmountVnd;
  // Rule J: Voucher applies to room charge ONLY. Addons are strictly excluded.
  // final_payable = room_gross - room_discount + menu_addon_total
  const finalAmount = Math.max(0, gross - discount) + menuTotal;

  const room = session.room;
  const hourlyPrice =
    room?.hourly_price_vnd ??
    (room?.nightly_price_vnd ? Math.round(room.nightly_price_vnd / 5) : Math.round(gross / hours));

  function handleApply(redemptionId: string) {
    startTransition(() => {
      onApplyVoucher(redemptionId);
    });
  }

  function handleRelease() {
    startTransition(() => {
      onReleaseVoucher();
    });
  }

  async function handleIncreaseMenuQty(item: CheckoutMenuItemRecord) {
    if (!onUpdateMenuItems || isMenuLoading) return;
    const payload: CheckoutMenuItemPayload[] = selectedMenuItems.map((i) => ({
      menu_product_id: i.menu_product_id,
      quantity: i.id === item.id ? i.quantity + 1 : i.quantity,
      source_type: i.source_type,
      entitlement_id: i.entitlement_id || undefined,
    }));
    await onUpdateMenuItems(payload);
  }

  async function handleDecreaseMenuQty(item: CheckoutMenuItemRecord) {
    if (!onUpdateMenuItems || isMenuLoading) return;
    let payload: CheckoutMenuItemPayload[];
    if (item.quantity > 1) {
      payload = selectedMenuItems.map((i) => ({
        menu_product_id: i.menu_product_id,
        quantity: i.id === item.id ? i.quantity - 1 : i.quantity,
        source_type: i.source_type,
        entitlement_id: i.entitlement_id || undefined,
      }));
    } else {
      payload = selectedMenuItems
        .filter((i) => i.id !== item.id)
        .map((i) => ({
          menu_product_id: i.menu_product_id,
          quantity: i.quantity,
          source_type: i.source_type,
          entitlement_id: i.entitlement_id || undefined,
        }));
    }
    await onUpdateMenuItems(payload);
  }

  async function handleRemoveMenuItem(item: CheckoutMenuItemRecord) {
    if (!onUpdateMenuItems || isMenuLoading) return;
    const payload: CheckoutMenuItemPayload[] = selectedMenuItems
      .filter((i) => i.id !== item.id)
      .map((i) => ({
        menu_product_id: i.menu_product_id,
        quantity: i.quantity,
        source_type: i.source_type,
        entitlement_id: i.entitlement_id || undefined,
      }));
    await onUpdateMenuItems(payload);
  }

  async function handleAddProductToCart(prod: MenuProduct) {
    if (!onUpdateMenuItems || isMenuLoading) return;
    const existing = selectedMenuItems.find(
      (i) => i.menu_product_id === prod.id && i.source_type === "PURCHASE"
    );
    let payload: CheckoutMenuItemPayload[];
    if (existing) {
      payload = selectedMenuItems.map((i) => ({
        menu_product_id: i.menu_product_id,
        quantity: i.id === existing.id ? i.quantity + 1 : i.quantity,
        source_type: i.source_type,
        entitlement_id: i.entitlement_id || undefined,
      }));
    } else {
      payload = [
        ...selectedMenuItems.map((i) => ({
          menu_product_id: i.menu_product_id,
          quantity: i.quantity,
          source_type: i.source_type,
          entitlement_id: i.entitlement_id || undefined,
        })),
        {
          menu_product_id: prod.id,
          quantity: 1,
          source_type: "PURCHASE",
        },
      ];
    }
    await onUpdateMenuItems(payload);
  }

  const filteredCatalog = allMenuProducts.filter((p) => {
    if (menuActiveCategory !== "ALL" && p.category !== menuActiveCategory) return false;
    if (menuSearch.trim()) {
      return p.name.toLowerCase().includes(menuSearch.toLowerCase().trim());
    }
    return true;
  });

  return (
    <div className="w-full space-y-6">
      {/* ── Card 1: Tóm tắt đặt phòng ─────────────────────────────────── */}
      <Reveal distance={12} delay={0}>
        <section
          className="bg-white border border-[#E5E5E5] p-5 sm:p-6 space-y-5"
          aria-labelledby="booking-summary-heading"
        >
          {/* Header phòng */}
          <div className="flex items-start gap-4 pb-5 border-b border-[#E5E5E5]">
            {/* Thumbnail phòng */}
            {room?.image_paths?.[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={room.image_paths[0]}
                alt={room.name}
                className="w-20 h-20 object-cover shrink-0 bg-[#F5F5F5]"
              />
            ) : (
              <div className="w-20 h-20 bg-[#F5F5F5] text-[#707072] flex items-center justify-center shrink-0">
                <BedDouble
                  className="w-7 h-7"
                  aria-hidden="true"
                />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <span className="text-[11px] font-medium tracking-widest uppercase text-[#707072] block mb-1">
                Phòng đã chọn
              </span>
              <h2
                id="booking-summary-heading"
                className="text-lg font-medium text-[#111111] leading-snug truncate"
              >
                {room?.name ?? "Phòng đã chọn"}
              </h2>
              {room?.property && (
                <div className="flex items-center gap-1.5 mt-1 text-xs text-[#707072]">
                  <MapPin
                    className="w-3.5 h-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  <p className="truncate">
                    {room.property.name} · {room.property.address}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Chi tiết lịch trình: Nhận phòng, Trả phòng, Thời lượng, Khách */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <p className="font-medium text-[#707072] uppercase tracking-wider text-[11px] mb-1">
                Nhận phòng
              </p>
              <p className="text-sm font-medium text-[#111111]">
                {formatDateTime(session.check_in_at || session.check_in)}
              </p>
            </div>

            <div>
              <p className="font-medium text-[#707072] uppercase tracking-wider text-[11px] mb-1">
                Trả phòng
              </p>
              <p className="text-sm font-medium text-[#111111]">
                {formatDateTime(session.check_out_at || session.check_out)}
              </p>
            </div>

            <div>
              <p className="font-medium text-[#707072] uppercase tracking-wider text-[11px] mb-1">
                Thời lượng
              </p>
              <p className="text-sm font-medium text-[#111111]">
                {hours} giờ
              </p>
            </div>

            <div>
              <p className="font-medium text-[#707072] uppercase tracking-wider text-[11px] mb-1">
                Số khách
              </p>
              <p className="text-sm font-medium text-[#111111]">
                {session.guest_count} khách
              </p>
            </div>
          </div>
        </section>
      </Reveal>

      {/* ── Card 2: Voucher ──────────────────────────────────────────────── */}
      <Reveal distance={12} delay={80}>
        <section
          className="bg-white border border-[#E5E5E5] overflow-hidden"
          aria-labelledby="voucher-section-heading"
        >
          <button
            type="button"
            id="voucher-section-heading"
            onClick={() => setShowVoucherPanel((p) => !p)}
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[#F5F5F5] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#111111]"
            aria-expanded={showVoucherPanel}
            aria-controls="voucher-panel"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-[#F5F5F5] text-[#111111] flex items-center justify-center">
                <Tag className="w-4 h-4" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#111111]">Mã ưu đãi</p>
                {selectedRedemptionId ? (
                  <p className="text-xs text-[#111111] font-medium mt-0.5">
                    Đã áp dụng · Tiết kiệm {formatVND(discountAmountVnd)}
                  </p>
                ) : (
                  <p className="text-xs text-[#707072] mt-0.5">
                    {availableVouchers.length > 0
                      ? `Bạn có ${availableVouchers.length} voucher có thể dùng`
                      : "Không có voucher khả dụng"}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selectedRedemptionId && (
                <Badge variant="primary" size="sm" dot>
                  Đã áp
                </Badge>
              )}
              {showVoucherPanel ? (
                <ChevronUp className="w-4 h-4 text-[#707072]" aria-hidden="true" />
              ) : (
                <ChevronDown
                  className="w-4 h-4 text-[#707072]"
                  aria-hidden="true"
                />
              )}
            </div>
          </button>

          {/* Panel voucher mở rộng */}
          {showVoucherPanel && (
            <div
              id="voucher-panel"
              className="px-5 pb-5 border-t border-[#E5E5E5] pt-4 space-y-3"
            >
              {/* Lỗi voucher */}
              {voucherError && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 bg-[#F5F5F5] border border-[#E5E5E5] p-3.5"
                >
                  <X
                    className="w-4 h-4 text-[#111111] shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <p className="text-sm text-[#111111]">{voucherError}</p>
                </div>
              )}

              {availableVouchers.length === 0 ? (
                <div className="text-center py-6">
                  <Ticket
                    className="w-8 h-8 text-[#9E9EA0] mx-auto mb-2"
                    aria-hidden="true"
                  />
                  <p className="text-sm text-[#707072]">
                    Bạn chưa có voucher nào khả dụng.
                  </p>
                  <p className="text-xs text-[#9E9EA0] mt-1">
                    Tích điểm qua Kapi Rewards để đổi voucher nhé!
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5" role="radiogroup" aria-label="Chọn voucher">
                  {availableVouchers.map((item) => (
                    <VoucherCard
                      key={item.id}
                      item={item}
                      isSelected={selectedRedemptionId === item.id}
                      grossAmountVnd={gross}
                      onSelect={handleApply}
                      disabled={isVoucherLoading || isPending}
                    />
                  ))}
                </div>
              )}

              {/* Nút hủy voucher đã chọn */}
              {selectedRedemptionId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRelease}
                  isLoading={isVoucherLoading || isPending}
                  className="w-full text-[#707072] hover:text-[#111111] hover:bg-[#F5F5F5] mt-1"
                >
                  Hủy áp dụng voucher
                </Button>
              )}
            </div>
          )}
        </section>
      </Reveal>

      {/* ── Card 2B: Phần thưởng hiện vật & ẩm thực (Tùy chọn) ──────────── */}
      {availablePhysicalRewards.length > 0 && (
        <Reveal distance={12} delay={120}>
          <section
            className="bg-white border border-[#E5E5E5]"
            aria-labelledby="physical-reward-heading"
          >
            <button
              type="button"
              onClick={() => setShowPhysicalRewardPanel((prev) => !prev)}
              aria-expanded={showPhysicalRewardPanel}
              aria-controls="physical-reward-panel"
              className="w-full flex items-center justify-between p-5 sm:p-6 text-left hover:bg-[#FAFAFA] transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 bg-[#F5F5F5] text-[#111111] flex items-center justify-center shrink-0">
                  <Gift className="w-4 h-4" aria-hidden="true" />
                </span>
                <div>
                  <h2
                    id="physical-reward-heading"
                    className="text-sm font-medium text-[#111111]"
                  >
                    Phần thưởng hiện vật & ẩm thực
                  </h2>
                  <p className="text-xs text-[#707072] mt-0.5">
                    {selectedPhysicalRewardId
                      ? "Đã chọn phần thưởng đi kèm"
                      : `${availablePhysicalRewards.length} phần thưởng chuỗi khả dụng · Dùng kèm voucher`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {selectedPhysicalRewardId && (
                  <Badge variant="primary" size="sm" dot>
                    Đã áp
                  </Badge>
                )}
                {showPhysicalRewardPanel ? (
                  <ChevronUp className="w-4 h-4 text-[#707072]" aria-hidden="true" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[#707072]" aria-hidden="true" />
                )}
              </div>
            </button>

            {showPhysicalRewardPanel && (
              <div
                id="physical-reward-panel"
                className="px-5 pb-5 border-t border-[#E5E5E5] pt-4 space-y-3"
              >
                {physicalRewardError && (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 bg-[#F5F5F5] border border-[#E5E5E5] p-3.5"
                  >
                    <X
                      className="w-4 h-4 text-[#111111] shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <p className="text-sm text-[#111111]">{physicalRewardError}</p>
                  </div>
                )}

                <div className="space-y-3" role="radiogroup" aria-label="Chọn phần thưởng hiện vật">
                  {availablePhysicalRewards.map((reward) => {
                    const isSelected = selectedPhysicalRewardId === reward.id;
                    const isMeal = reward.reward_type === "MEAL_CHOICE";

                    return (
                      <div
                        key={reward.id}
                        className={[
                          "border p-4 transition-all duration-150",
                          isSelected
                            ? "border-[#111111] bg-[#F5F5F5]"
                            : "border-[#E5E5E5] bg-white",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <span
                              className={[
                                "shrink-0 w-8 h-8 flex items-center justify-center",
                                isSelected
                                  ? "bg-[#111111] text-white"
                                  : "bg-[#F5F5F5] text-[#111111]",
                              ].join(" ")}
                            >
                              <Gift className="w-4 h-4" aria-hidden="true" />
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-[#111111] truncate">
                                  {reward.title}
                                </p>
                                <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 bg-[#EAEAEA] text-[#333333]">
                                  Chuỗi {reward.milestone_day} ngày
                                </span>
                              </div>
                              <p className="text-xs text-[#707072] mt-0.5">
                                {reward.description || "Phần thưởng lưu trú chuỗi điểm danh"}
                              </p>
                            </div>
                          </div>

                          <div className="shrink-0 text-right">
                            <span className="text-xs text-[#707072]">
                              {formatVoucherExpiry(reward.expires_at)}
                            </span>
                          </div>
                        </div>

                        {/* Nếu là MEAL_CHOICE, hiển thị radio chọn món active */}
                        {isMeal && (
                          <div className="mt-4 pt-3 border-t border-[#E5E5E5] space-y-2">
                            <p className="text-xs font-medium text-[#111111]">
                              Chọn 1 món ăn từ thực đơn Kapi:
                            </p>
                            <div className="space-y-1.5">
                              {menuItems.length > 0 ? (
                                menuItems.map((item) => (
                                  <label
                                    key={item.id}
                                    className="flex items-center gap-2 text-xs text-[#111111] cursor-pointer hover:bg-white/60 p-1.5 rounded transition-colors"
                                  >
                                    <input
                                      type="radio"
                                      name={`meal-item-${reward.id}`}
                                      checked={
                                        (isSelected && selectedMenuItemId === item.id) ||
                                        (!isSelected && tempMenuItemId === item.id)
                                      }
                                      onChange={() => {
                                        setTempMenuItemId(item.id);
                                        if (isSelected && onApplyPhysicalReward) {
                                          onApplyPhysicalReward(reward.id, item.id);
                                        }
                                      }}
                                      className="accent-[#111111]"
                                    />
                                    <span>{item.name}</span>
                                  </label>
                                ))
                              ) : (
                                <p className="text-xs text-[#707072]">Đang tải thực đơn...</p>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="mt-3 pt-3 border-t border-[#E5E5E5] flex items-center justify-between">
                          {isSelected ? (
                            <div className="flex items-center gap-1.5">
                              <CheckCircle2
                                className="w-3.5 h-3.5 text-[#111111] shrink-0"
                                aria-hidden="true"
                              />
                              <span className="text-xs font-medium text-[#111111]">
                                Đã chọn phần thưởng này
                              </span>
                            </div>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isPhysicalRewardLoading}
                              onClick={() => {
                                if (onApplyPhysicalReward) {
                                  onApplyPhysicalReward(
                                    reward.id,
                                    isMeal ? tempMenuItemId || menuItems[0]?.id : undefined
                                  );
                                }
                              }}
                              className="text-xs"
                            >
                              Áp dụng phần thưởng
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {selectedPhysicalRewardId && onReleasePhysicalReward && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onReleasePhysicalReward}
                    isLoading={isPhysicalRewardLoading}
                    className="w-full text-[#707072] hover:text-[#111111] hover:bg-[#F5F5F5] mt-1"
                  >
                    Hủy áp dụng phần thưởng hiện vật
                  </Button>
                )}
              </div>
            )}
          </section>
        </Reveal>
      )}

      {/* ── Card 2C: Đồ ăn & thức uống (Menu Add-ons & Quà tặng) ─────────── */}
      <Reveal distance={12} delay={140}>
        <section
          className="bg-white border border-[#E5E5E5] overflow-hidden"
          aria-labelledby="menu-addons-heading"
        >
          <div className="flex items-center justify-between p-5 sm:p-6 border-b border-[#E5E5E5] bg-white">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 bg-[#F5F5F5] text-[#111111] flex items-center justify-center shrink-0">
                <Utensils className="w-4 h-4" aria-hidden="true" />
              </span>
              <div>
                <h2
                  id="menu-addons-heading"
                  className="text-sm font-medium text-[#111111]"
                >
                  Đồ ăn & thức uống
                </h2>
                <p className="text-xs text-[#707072] mt-0.5">
                  {selectedMenuItems.length > 0
                    ? `${selectedMenuItems.reduce((s, i) => s + i.quantity, 0)} sản phẩm đã chọn`
                    : "Chọn thêm nước uống, đồ ăn vặt & món chính phục vụ tại phòng"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {menuTotal > 0 && (
                <span className="text-sm font-medium text-[#111111]">
                  +{formatVND(menuTotal)}
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCatalogPicker((prev) => !prev)}
                className="text-xs h-8"
              >
                {showCatalogPicker ? "Đóng menu" : "+ Xem thực đơn"}
              </Button>
            </div>
          </div>

          <div className="p-5 sm:p-6 space-y-4">
            {menuError && (
              <div
                role="alert"
                className="flex items-start gap-2.5 bg-[#F5F5F5] border border-[#E5E5E5] p-3.5 text-xs text-[#111111]"
              >
                <X className="w-4 h-4 text-[#111111] shrink-0 mt-0.5" aria-hidden="true" />
                <p>{menuError}</p>
              </div>
            )}

            {/* Danh sách món đã chọn */}
            {selectedMenuItems.length === 0 ? (
              <p className="text-xs text-[#707072] py-2">
                Chưa có đồ ăn hoặc thức uống nào được chọn. Quý khách có thể bấm &quot;+ Xem thực đơn&quot; để chọn thêm món cho kỳ nghỉ.
              </p>
            ) : (
              <div className="space-y-3">
                {selectedMenuItems.map((item) => {
                  const isReward = item.source_type === "REWARD";
                  const catLabel =
                    item.category === "DRINK"
                      ? "Nước uống"
                      : item.category === "SNACK"
                      ? "Ăn vặt"
                      : "Món chính";

                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 border border-[#E5E5E5] bg-[#FAFAFA]"
                    >
                      <div className="min-w-0 flex-1 pr-3">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-[#111111] truncate">
                            {item.name}
                          </p>
                          <span className="text-[10px] uppercase font-medium px-1.5 py-0.5 bg-[#EAEAEA] text-[#333333] shrink-0">
                            {catLabel}
                          </span>
                          {isReward && (
                            <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 bg-[#111111] text-white shrink-0">
                              🎁 Quà tặng
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#707072] mt-0.5">
                          {isReward
                            ? `${item.reward_title || "Phần thưởng"} (Giá gốc: ${formatVND(item.normal_price_vnd)})`
                            : `${formatVND(item.unit_price_vnd)} / phần`}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {/* Stepper controls */}
                        <div className="flex items-center border border-[#E5E5E5] bg-white">
                          <button
                            type="button"
                            aria-label={`Giảm số lượng ${item.name}`}
                            disabled={isMenuLoading}
                            onClick={() => handleDecreaseMenuQty(item)}
                            className="w-7 h-7 flex items-center justify-center text-[#707072] hover:text-[#111111] hover:bg-[#F5F5F5] disabled:opacity-50"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-8 text-center text-xs font-medium text-[#111111]">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            aria-label={`Tăng số lượng ${item.name}`}
                            disabled={isMenuLoading}
                            onClick={() => handleIncreaseMenuQty(item)}
                            className="w-7 h-7 flex items-center justify-center text-[#707072] hover:text-[#111111] hover:bg-[#F5F5F5] disabled:opacity-50"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Total price for this row */}
                        <div className="w-20 text-right">
                          <span className="text-xs font-medium text-[#111111]">
                            {isReward ? "Miễn phí" : formatVND(item.total_price_vnd)}
                          </span>
                        </div>

                        {/* Remove item button */}
                        <button
                          type="button"
                          aria-label={`Xóa ${item.name}`}
                          disabled={isMenuLoading}
                          onClick={() => handleRemoveMenuItem(item)}
                          className="p-1.5 text-[#707072] hover:text-[#111111] transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                <div className="flex items-center justify-between pt-2 border-t border-[#E5E5E5] text-xs">
                  <span className="text-[#707072]">Tạm tính đồ ăn & thức uống:</span>
                  <span className="font-medium text-[#111111] text-sm">
                    {formatVND(menuTotal)}
                  </span>
                </div>
              </div>
            )}

            {/* Catalog Picker Collapsible */}
            {showCatalogPicker && (
              <div className="pt-4 border-t border-[#E5E5E5] space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#111111] uppercase tracking-wider">
                    Chọn món từ thực đơn Kapi
                  </span>
                  {/* Category tabs */}
                  <div className="flex items-center gap-1 bg-[#F5F5F5] p-1 border border-[#E5E5E5]">
                    {(
                      [
                        { id: "ALL", label: "Tất cả" },
                        { id: "DRINK", label: "Nước uống" },
                        { id: "SNACK", label: "Ăn vặt" },
                        { id: "MAIN_FOOD", label: "Món chính" },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setMenuActiveCategory(tab.id)}
                        className={[
                          "px-2.5 py-1 text-xs transition-colors",
                          menuActiveCategory === tab.id
                            ? "bg-[#111111] text-white font-medium"
                            : "text-[#707072] hover:text-[#111111]",
                        ].join(" ")}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Search input */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#707072]" />
                  <input
                    type="text"
                    value={menuSearch}
                    onChange={(e) => setMenuSearch(e.target.value)}
                    placeholder="Tìm theo tên món (ví dụ: Coca, Mì xào, Bánh mì...)"
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-[#E5E5E5] focus:outline-none focus:border-[#111111] bg-white placeholder-[#707072]"
                  />
                  {menuSearch && (
                    <button
                      type="button"
                      onClick={() => setMenuSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#707072] hover:text-[#111111]"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Product list */}
                <div className="max-h-64 overflow-y-auto divide-y divide-[#E5E5E5] border border-[#E5E5E5] bg-white">
                  {filteredCatalog.length === 0 ? (
                    <div className="p-4 text-center text-xs text-[#707072]">
                      Không tìm thấy món ăn phù hợp với từ khóa tìm kiếm.
                    </div>
                  ) : (
                    filteredCatalog.map((product) => {
                      const existingQty =
                        selectedMenuItems.find(
                          (i) => i.menu_product_id === product.id && i.source_type === "PURCHASE"
                        )?.quantity ?? 0;

                      return (
                        <div
                          key={product.id}
                          className="p-3 flex items-center justify-between hover:bg-[#FAFAFA] transition-colors"
                        >
                          <div className="min-w-0 flex-1 pr-3">
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-medium text-[#111111] truncate">
                                {product.name}
                              </p>
                              <span className="text-[10px] text-[#707072] font-mono">
                                {formatVND(product.price_vnd)}
                              </span>
                            </div>
                            {product.description && (
                              <p className="text-[11px] text-[#707072] truncate mt-0.5">
                                {product.description}
                              </p>
                            )}
                          </div>

                          <div className="shrink-0 flex items-center gap-2">
                            {existingQty > 0 && (
                              <span className="text-[11px] font-medium text-[#111111] bg-[#F5F5F5] px-2 py-0.5 border border-[#E5E5E5]">
                                Đã chọn: {existingQty}
                              </span>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isMenuLoading}
                              onClick={() => handleAddProductToCart(product)}
                              className="text-xs h-7 px-2.5"
                            >
                              + Thêm
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </Reveal>

      {/* ── Card 3: Bảng kê chi phí ──────────────────────────────────────── */}
      <Reveal distance={12} delay={160}>
        <section
          className="bg-white border border-[#E5E5E5] p-5 sm:p-6 space-y-4"
          aria-label="Bảng kê chi phí"
        >
          <span className="text-[11px] font-medium tracking-widest uppercase text-[#707072] block">
            Chi phí
          </span>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#707072]">
                {`${formatVND(hourlyPrice)} × ${hours} giờ`}
              </span>
              <span className="font-medium text-[#111111]">
                {formatVND(gross)}
              </span>
            </div>

            {discount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-[#111111]" aria-hidden="true" />
                  <span className="text-[#111111] font-medium">
                    Giảm giá voucher (chỉ áp dụng tiền phòng)
                  </span>
                </div>
                <span className="font-medium text-[#111111]">
                  -{formatVND(discount)}
                </span>
              </div>
            )}

            {menuTotal > 0 && (
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-1.5">
                  <Utensils className="w-3.5 h-3.5 text-[#111111]" aria-hidden="true" />
                  <span className="text-[#111111] font-medium">
                    Đồ ăn & thức uống
                  </span>
                </div>
                <span className="font-medium text-[#111111]">
                  +{formatVND(menuTotal)}
                </span>
              </div>
            )}

            {selectedMenuItems.some((i) => i.source_type === "REWARD") && (
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-1.5">
                  <Gift className="w-3.5 h-3.5 text-[#111111]" aria-hidden="true" />
                  <span className="text-[#111111] font-medium">
                    Phần thưởng ẩm thực chuỗi:{" "}
                    {selectedMenuItems
                      .filter((i) => i.source_type === "REWARD")
                      .map((i) => `${i.name} (×${i.quantity})`)
                      .join(", ")}
                  </span>
                </div>
                <span className="font-medium text-[#111111]">Miễn phí</span>
              </div>
            )}

            {selectedPhysicalRewardId && (
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-1.5">
                  <Gift className="w-3.5 h-3.5 text-[#111111]" aria-hidden="true" />
                  <span className="text-[#111111] font-medium">
                    Quà tặng kèm:{" "}
                    {availablePhysicalRewards.find((r) => r.id === selectedPhysicalRewardId)?.title || "Phần thưởng chuỗi"}
                    {selectedMenuItemId && menuItems.find((m) => m.id === selectedMenuItemId)
                      ? ` (${menuItems.find((m) => m.id === selectedMenuItemId)?.name})`
                      : ""}
                  </span>
                </div>
                <span className="font-medium text-[#111111]">Miễn phí</span>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-[#E5E5E5] pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[#111111]">
                Tổng thanh toán
              </span>
              <span className="text-2xl font-medium tracking-tight text-[#111111]">
                {formatVND(finalAmount)}
              </span>
            </div>
            <p className="text-xs text-[#707072] mt-1.5 text-right">
              Thanh toán 100% qua VietQR · Không hỗ trợ đặt cọc
            </p>
          </div>
        </section>
      </Reveal>

      {/* ── Card 4: Thông tin khách lưu trú ──────────────────────────────── */}
      <Reveal distance={12} delay={240}>
        <section
          className="bg-white border border-[#E5E5E5] p-5 sm:p-6 space-y-5"
          aria-labelledby="guest-info-heading"
        >
          <div>
            <span className="text-[11px] font-medium tracking-widest uppercase text-[#707072] block mb-1">
              Thông tin liên hệ
            </span>
            <h3
              id="guest-info-heading"
              className="text-base font-medium text-[#111111]"
            >
              Thông tin khách lưu trú
            </h3>
          </div>

          <div className="space-y-3.5">
            <Input
              id="guest-full-name"
              label="Họ và tên"
              placeholder="Nguyễn Văn A"
              autoComplete="name"
              value={guestInfo.fullName}
              onChange={(e) => onGuestInfoChange("fullName", e.target.value)}
              errorMessage={guestInfoErrors.fullName}
              startIcon={
                <User className="w-4 h-4 text-[#707072]" aria-hidden="true" />
              }
              required
            />

            <Input
              id="guest-phone"
              label="Số điện thoại"
              type="tel"
              placeholder="0901 234 567"
              autoComplete="tel"
              value={guestInfo.phone}
              onChange={(e) => onGuestInfoChange("phone", e.target.value)}
              errorMessage={guestInfoErrors.phone}
              startIcon={
                <Phone className="w-4 h-4 text-[#707072]" aria-hidden="true" />
              }
              required
            />

            <Input
              id="guest-email"
              label="Email liên hệ"
              type="email"
              placeholder="example@email.com"
              autoComplete="email"
              value={guestInfo.email}
              onChange={(e) => onGuestInfoChange("email", e.target.value)}
              errorMessage={guestInfoErrors.email}
              startIcon={
                <Mail className="w-4 h-4 text-[#707072]" aria-hidden="true" />
              }
              required
            />
          </div>

          <p className="text-xs text-[#707072] leading-relaxed">
            Thông tin trên chỉ dùng để liên hệ xác nhận đặt phòng và không được
            lưu trữ ngoài mục đích nghiệp vụ.
          </p>
        </section>
      </Reveal>

      {/* ── CTA: Tiến hành thanh toán ─────────────────────────────────────── */}
      <Reveal distance={12} delay={320}>
        <Button
          id="proceed-to-payment-btn"
          size="lg"
          variant="primary"
          className="w-full py-4 text-base tracking-wide"
          onClick={onProceedToPayment}
          isLoading={isSubmitting}
          disabled={isSubmitting}
          rightIcon={
            !isSubmitting ? (
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-5 h-5"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
                  clipRule="evenodd"
                />
              </svg>
            ) : undefined
          }
        >
          {isSubmitting ? "Đang xử lý..." : `Thanh toán ${formatVND(finalAmount)}`}
        </Button>
      </Reveal>
    </div>
  );
}
