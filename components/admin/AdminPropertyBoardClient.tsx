"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  UtensilsCrossed,
  X,
  SlidersHorizontal,
  ExternalLink,
  Phone,
  Mail,
  Users,
  Gift,
} from "lucide-react";
import type {
  AdminPropertyScheduleData,
  AdminBookingDetail,
  AdminBookingMenuItem,
  StaffMutableRoomOperationalStatus,
  TicketStatus,
  RoomOperationalStatus,
} from "@/lib/data/admin";
import {
  fetchAdminBookingDetailAction,
  fetchAdminPropertyScheduleAction,
  updateAdminRoomStatusAction,
  updateAdminTicketStatusAction,
} from "@/app/admin/actions";

interface AdminPropertyBoardClientProps {
  initialData: AdminPropertyScheduleData;
  propertyId: string;
}

type ViewMode = "1day" | "3days" | "7days";
type TabMode = "schedule" | "tickets";
type StatusFilter = "ALL" | RoomOperationalStatus;

// Helper to format date in Vietnam timezone
function formatVietnamDate(d: Date): string {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function formatVietnamTime(iso: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function formatVietnamDateTime(iso: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function toVietnamDateString(d: Date): string {
  // Returns YYYY-MM-DD in Asia/Ho_Chi_Minh
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return parts;
}

export default function AdminPropertyBoardClient({
  initialData,
  propertyId,
}: AdminPropertyBoardClientProps) {
  const [data, setData] = React.useState<AdminPropertyScheduleData>(initialData);
  const [activeTab, setActiveTab] = React.useState<TabMode>("schedule");
  const [viewMode, setViewMode] = React.useState<ViewMode>("1day");
  const [selectedDate, setSelectedDate] = React.useState<string>(() =>
    toVietnamDateString(new Date())
  );
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("ALL");
  const [isLoadingRange, setIsLoadingRange] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Booking detail drawer state
  const [selectedBookingId, setSelectedBookingId] = React.useState<string | null>(null);
  const [bookingDetail, setBookingDetail] = React.useState<AdminBookingDetail | null>(null);
  const [bookingMenuItems, setBookingMenuItems] = React.useState<AdminBookingMenuItem[]>([]);
  const [isLoadingBooking, setIsLoadingBooking] = React.useState(false);
  const [bookingError, setBookingError] = React.useState<string | null>(null);

  // Ticket status updating state
  const [updatingTicketId, setUpdatingTicketId] = React.useState<string | null>(null);
  const [ticketStatusFilter, setTicketStatusFilter] = React.useState<string>("ALL");

  // Calculate range timestamps
  const { rangeStart, rangeEnd, daysCount } = React.useMemo(() => {
    const days = viewMode === "1day" ? 1 : viewMode === "3days" ? 3 : 7;
    // selectedDate is YYYY-MM-DD
    const start = new Date(`${selectedDate}T00:00:00+07:00`);
    const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
    return {
      rangeStart: start,
      rangeEnd: end,
      daysCount: days,
    };
  }, [selectedDate, viewMode]);

  // Refetch schedule when date or viewMode changes
  const loadSchedule = React.useCallback(
    async (start: Date, end: Date) => {
      setIsLoadingRange(true);
      setErrorMessage(null);
      try {
        const res = await fetchAdminPropertyScheduleAction(
          propertyId,
          start.toISOString(),
          end.toISOString()
        );
        if (res.success && res.data) {
          setData(res.data);
        } else {
          setErrorMessage(res.error || "Không thể tải dữ liệu lịch phòng.");
        }
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : "Lỗi kết nối.");
      } finally {
        setIsLoadingRange(false);
      }
    },
    [propertyId]
  );

  // Trigger fetch when date/mode changes
  const isInitialMount = React.useRef(true);
  React.useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    loadSchedule(rangeStart, rangeEnd);
  }, [rangeStart, rangeEnd, loadSchedule]);

  // Navigate date
  const handlePrevDate = () => {
    const d = new Date(`${selectedDate}T12:00:00+07:00`);
    d.setDate(d.getDate() - (viewMode === "1day" ? 1 : viewMode === "3days" ? 3 : 7));
    setSelectedDate(toVietnamDateString(d));
  };

  const handleNextDate = () => {
    const d = new Date(`${selectedDate}T12:00:00+07:00`);
    d.setDate(d.getDate() + (viewMode === "1day" ? 1 : viewMode === "3days" ? 3 : 7));
    setSelectedDate(toVietnamDateString(d));
  };

  const handleToday = () => {
    setSelectedDate(toVietnamDateString(new Date()));
  };

  // Open booking detail drawer
  const handleOpenBookingDetail = async (bookingId: string) => {
    setSelectedBookingId(bookingId);
    setIsLoadingBooking(true);
    setBookingError(null);
    try {
      const res = await fetchAdminBookingDetailAction(bookingId);
      if (res.success && res.booking) {
        setBookingDetail(res.booking);
        setBookingMenuItems(res.menu_items || []);
      } else {
        setBookingError(res.error || "Không tìm thấy thông tin đặt phòng.");
      }
    } catch (err: unknown) {
      setBookingError(err instanceof Error ? err.message : "Lỗi tải chi tiết đơn.");
    } finally {
      setIsLoadingBooking(false);
    }
  };

  const handleCloseBookingDetail = () => {
    setSelectedBookingId(null);
    setBookingDetail(null);
    setBookingMenuItems([]);
  };

  // Update room operational status
  const handleRoomStatusChange = async (
    roomId: string,
    newStatus: StaffMutableRoomOperationalStatus
  ) => {
    try {
      const res = await updateAdminRoomStatusAction(roomId, newStatus);
      if (res.success) {
        // Optimistically update status in memory
        setData((prev) => ({
          ...prev,
          rooms: prev.rooms.map((r) =>
            r.room_id === roomId ? { ...r, operational_status: newStatus } : r
          ),
        }));
      } else {
        alert(res.error || "Không thể cập nhật trạng thái phòng.");
      }
    } catch {
      alert("Đã xảy ra lỗi khi cập nhật.");
    }
  };

  // Update ticket status
  const handleTicketStatusChange = async (ticketId: string, newStatus: TicketStatus) => {
    setUpdatingTicketId(ticketId);
    try {
      const res = await updateAdminTicketStatusAction(ticketId, newStatus);
      if (res.success) {
        setData((prev) => ({
          ...prev,
          tickets: prev.tickets.map((t) =>
            t.id === ticketId ? { ...t, status: newStatus } : t
          ),
        }));
      } else {
        alert(res.error || "Không thể cập nhật trạng thái sự cố.");
      }
    } catch {
      alert("Lỗi khi cập nhật sự cố.");
    } finally {
      setUpdatingTicketId(null);
    }
  };

  // Filtered rooms
  const filteredRooms = React.useMemo(() => {
    if (statusFilter === "ALL") return data.rooms;
    return data.rooms.filter((r) => r.operational_status === statusFilter);
  }, [data.rooms, statusFilter]);

  // Status counts
  const readyCount = data.rooms.filter((r) => r.operational_status === "ready").length;
  const occupiedCount = data.rooms.filter((r) => r.operational_status === "occupied").length;
  const cleaningCount = data.rooms.filter((r) => r.operational_status === "cleaning").length;
  const maintenanceCount = data.rooms.filter((r) => r.operational_status === "maintenance").length;

  // Filtered tickets
  const filteredTickets = React.useMemo(() => {
    if (ticketStatusFilter === "ALL") return data.tickets;
    return data.tickets.filter((t) => t.status === ticketStatusFilter);
  }, [data.tickets, ticketStatusFilter]);

  // Current time position percentage for today indicator
  const nowMs = new Date().getTime();
  const rangeStartMs = rangeStart.getTime();
  const rangeEndMs = rangeEnd.getTime();
  const isNowInRange = nowMs >= rangeStartMs && nowMs <= rangeEndMs;
  const nowPercent = isNowInRange
    ? ((nowMs - rangeStartMs) / (rangeEndMs - rangeStartMs)) * 100
    : null;

  return (
    <div className="space-y-5">
      {/* Top Breadcrumb & Header */}
      <div className="border-b border-[#E5E5E5] pb-4">
        <div className="flex items-center gap-2 mb-2">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-xs text-[#707072] hover:text-[#111111] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Tất cả chi nhánh</span>
          </Link>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-[#111111] tracking-tight">
              {data.property.name}
            </h1>
            <div className="flex items-center gap-1 text-xs text-[#707072] mt-1">
              <MapPin className="w-3.5 h-3.5 text-[#9E9EA0] flex-shrink-0" />
              <span>{data.property.address}</span>
            </div>
          </div>

          {/* Quick status summary badges */}
          <div className="flex items-center flex-wrap gap-2 text-xs">
            <span className="px-2.5 py-1 bg-white border border-[#E5E5E5] font-mono font-medium text-[#111111]">
              Tổng: {data.rooms.length} phòng
            </span>
            <span className="px-2.5 py-1 bg-[#F9FBF9] border border-[#E0EBE0] text-[#2F6B2F] font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
              {readyCount} Sẵn sàng
            </span>
            <span className="px-2.5 py-1 bg-[#F5F5F5] border border-[#E5E5E5] text-[#111111] font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#111111]"></span>
              {occupiedCount} Có khách
            </span>
            <span className="px-2.5 py-1 bg-[#FCFAF5] border border-[#EFE8D8] text-[#7A6B48] font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              {cleaningCount} Đang dọn
            </span>
            <span className="px-2.5 py-1 bg-[#FAF5F5] border border-[#EFE0E0] text-[#7A4848] font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
              {maintenanceCount} Bảo trì
            </span>
          </div>
        </div>

        {/* Tab switcher: Lịch phòng vs Sự cố */}
        <div className="flex items-center gap-1 mt-4 border-t border-[#F0F0F0] pt-3">
          <button
            type="button"
            onClick={() => setActiveTab("schedule")}
            className={`px-3 py-1.5 text-xs font-medium border transition-colors ${
              activeTab === "schedule"
                ? "bg-[#111111] text-white border-[#111111]"
                : "bg-white text-[#707072] border-[#E5E5E5] hover:text-[#111111]"
            }`}
          >
            Lịch phòng & Đặt chỗ
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("tickets")}
            className={`px-3 py-1.5 text-xs font-medium border transition-colors flex items-center gap-1.5 ${
              activeTab === "tickets"
                ? "bg-[#111111] text-white border-[#111111]"
                : "bg-white text-[#707072] border-[#E5E5E5] hover:text-[#111111]"
            }`}
          >
            <span>Sự cố & Yêu cầu</span>
            {data.tickets.length > 0 && (
              <span
                className={`px-1.5 py-0.2 text-[10px] font-mono ${
                  activeTab === "tickets"
                    ? "bg-white text-[#111111]"
                    : "bg-[#EFEFEF] text-[#111111]"
                }`}
              >
                {data.tickets.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="bg-[#FAF5F5] border border-rose-200 text-rose-800 text-xs p-3">
          {errorMessage}
        </div>
      )}

      {/* TAB 1: ROOM × TIME TIMELINE BOARD */}
      {activeTab === "schedule" && (
        <div className="space-y-4">
          {/* Controls Bar: Date navigation & Filters */}
          <div className="bg-white border border-[#E5E5E5] p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Date navigation */}
            <div className="flex items-center flex-wrap gap-2">
              <div className="flex items-center border border-[#E5E5E5]">
                <button
                  type="button"
                  onClick={handlePrevDate}
                  title="Khoảng thời gian trước"
                  className="p-1.5 text-[#707072] hover:text-[#111111] hover:bg-[#F5F5F5] transition-colors border-r border-[#E5E5E5]"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleToday}
                  className="px-3 py-1 text-xs font-medium text-[#111111] hover:bg-[#F5F5F5] transition-colors"
                >
                  Hôm nay
                </button>
                <button
                  type="button"
                  onClick={handleNextDate}
                  title="Khoảng thời gian sau"
                  className="p-1.5 text-[#707072] hover:text-[#111111] hover:bg-[#F5F5F5] transition-colors border-l border-[#E5E5E5]"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Date picker input */}
              <div className="flex items-center gap-1.5 bg-[#FAFAFA] border border-[#E5E5E5] px-2.5 py-1">
                <Calendar className="w-3.5 h-3.5 text-[#707072]" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    if (e.target.value) setSelectedDate(e.target.value);
                  }}
                  className="bg-transparent text-xs text-[#111111] font-mono focus:outline-none cursor-pointer"
                />
              </div>

              {/* Date label */}
              <span className="text-xs text-[#707072] hidden sm:inline-block">
                {formatVietnamDate(new Date(`${selectedDate}T12:00:00+07:00`))}
              </span>

              {isLoadingRange && (
                <span className="text-[11px] text-[#707072] italic flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full border border-[#111111] border-t-transparent animate-spin"></span>
                  Đang tải...
                </span>
              )}
            </div>

            {/* View Mode & Filter */}
            <div className="flex items-center flex-wrap gap-2">
              {/* View modes */}
              <div className="flex items-center border border-[#E5E5E5]">
                <button
                  type="button"
                  onClick={() => setViewMode("1day")}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                    viewMode === "1day"
                      ? "bg-[#111111] text-white"
                      : "bg-white text-[#707072] hover:text-[#111111]"
                  }`}
                >
                  1 ngày
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("3days")}
                  className={`px-2.5 py-1 text-xs font-medium border-l border-[#E5E5E5] transition-colors ${
                    viewMode === "3days"
                      ? "bg-[#111111] text-white"
                      : "bg-white text-[#707072] hover:text-[#111111]"
                  }`}
                >
                  3 ngày
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("7days")}
                  className={`px-2.5 py-1 text-xs font-medium border-l border-[#E5E5E5] transition-colors ${
                    viewMode === "7days"
                      ? "bg-[#111111] text-white"
                      : "bg-white text-[#707072] hover:text-[#111111]"
                  }`}
                >
                  7 ngày
                </button>
              </div>

              {/* Room Status Filter */}
              <div className="flex items-center gap-1">
                <SlidersHorizontal className="w-3.5 h-3.5 text-[#9E9EA0]" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="text-xs bg-[#FAFAFA] border border-[#E5E5E5] px-2 py-1 text-[#111111] focus:outline-none"
                >
                  <option value="ALL">Tất cả trạng thái</option>
                  <option value="ready">Sẵn sàng (Ready)</option>
                  <option value="occupied">Có khách (Occupied)</option>
                  <option value="cleaning">Đang dọn (Cleaning)</option>
                  <option value="maintenance">Bảo trì (Maintenance)</option>
                </select>
              </div>
            </div>
          </div>

          {/* TIMELINE TABLE / BOARD */}
          <div className="bg-white border border-[#E5E5E5] overflow-x-auto shadow-sm">
            <div className="min-w-[960px] relative">
              {/* Header Row: Left Room Column + Time Scale */}
              <div className="flex border-b border-[#E5E5E5] bg-[#F9F9F9] text-xs font-medium text-[#707072] sticky top-0 z-20">
                {/* Left column headers */}
                <div className="w-[280px] p-3 border-r border-[#E5E5E5] flex-shrink-0 flex items-center justify-between">
                  <span>Phòng ({filteredRooms.length})</span>
                  <span>Trạng thái hiện tại</span>
                </div>

                {/* Right time scale */}
                <div className="flex-1 relative flex">
                  {viewMode === "1day" ? (
                    // 24 hour grid for 1 day
                    Array.from({ length: 12 }).map((_, i) => {
                      const hour = i * 2;
                      return (
                        <div
                          key={hour}
                          className="flex-1 p-2.5 text-center border-r border-[#EAEAEA] font-mono text-[11px] text-[#707072]"
                        >
                          {String(hour).padStart(2, "0")}:00
                        </div>
                      );
                    })
                  ) : (
                    // Multi-day headers
                    Array.from({ length: daysCount }).map((_, dIndex) => {
                      const dayDate = new Date(rangeStartMs + dIndex * 24 * 60 * 60 * 1000);
                      return (
                        <div
                          key={dIndex}
                          className="flex-1 p-2 text-center border-r border-[#EAEAEA] font-mono text-[11px]"
                        >
                          <div className="font-semibold text-[#111111]">
                            {new Intl.DateTimeFormat("vi-VN", {
                              timeZone: "Asia/Ho_Chi_Minh",
                              weekday: "short",
                              day: "2-digit",
                              month: "2-digit",
                            }).format(dayDate)}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Room Rows */}
              <div className="divide-y divide-[#EAEAEA]">
                {filteredRooms.map((room) => {
                  return (
                    <div
                      key={room.room_id}
                      className="flex items-stretch hover:bg-[#FAFAFA] transition-colors group relative"
                    >
                      {/* Left sticky column: Room Info & Operational Status Control */}
                      <div className="w-[280px] p-3 border-r border-[#E5E5E5] bg-white group-hover:bg-[#FAFAFA] flex-shrink-0 flex items-center justify-between gap-2 z-10">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-[#111111] text-xs">
                              {room.room_number ? `P.${room.room_number}` : room.room_name}
                            </span>
                            {room.floor_number && (
                              <span className="text-[10px] text-[#707072] font-mono px-1 bg-[#F5F5F5] border border-[#E5E5E5]">
                                T.{room.floor_number}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[#9E9EA0] truncate max-w-[140px] mt-0.5">
                            {room.room_name}
                          </div>
                          <Link
                            href={`/admin/rooms/${room.room_id}`}
                            className="inline-flex items-center gap-1 text-[10px] text-[#707072] hover:text-[#111111] hover:underline mt-1"
                          >
                            <span>Cấu hình phòng</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </Link>
                        </div>

                        {/* Operational Status Control */}
                        <div>
                          {room.operational_status === "occupied" ? (
                            <span className="px-2 py-1 text-[11px] font-medium bg-[#F5F5F5] border border-[#CCCCCC] text-[#111111] cursor-not-allowed select-none">
                              Có khách
                            </span>
                          ) : (
                            <select
                              value={room.operational_status}
                              onChange={(e) =>
                                handleRoomStatusChange(
                                  room.room_id,
                                  e.target.value as StaffMutableRoomOperationalStatus
                                )
                              }
                              className={`text-[11px] font-medium px-1.5 py-1 border focus:outline-none cursor-pointer ${
                                room.operational_status === "ready"
                                  ? "bg-[#F9FBF9] text-[#2F6B2F] border-emerald-300"
                                  : room.operational_status === "cleaning"
                                  ? "bg-[#FCFAF5] text-[#7A6B48] border-amber-300"
                                  : "bg-[#FAF5F5] text-[#7A4848] border-rose-300"
                              }`}
                            >
                              <option value="ready">Sẵn sàng</option>
                              <option value="cleaning">Đang dọn</option>
                              <option value="maintenance">Bảo trì</option>
                            </select>
                          )}
                        </div>
                      </div>

                      {/* Right timeline track */}
                      <div className="flex-1 relative min-h-[58px] bg-white flex items-center">
                        {/* Hour background grid lines */}
                        <div className="absolute inset-0 flex pointer-events-none">
                          {Array.from({ length: viewMode === "1day" ? 12 : daysCount }).map(
                            (_, i) => (
                              <div
                                key={i}
                                className="flex-1 border-r border-[#F0F0F0] h-full"
                              />
                            )
                          )}
                        </div>

                        {/* Current time indicator line */}
                        {nowPercent !== null && (
                          <div
                            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 pointer-events-none"
                            style={{ left: `${nowPercent}%` }}
                            title="Hiện tại"
                          />
                        )}

                        {/* Bookings bars */}
                        {room.bookings.map((booking) => {
                          const bStart = new Date(booking.check_in_at).getTime();
                          const bEnd = new Date(booking.check_out_at).getTime();

                          // Intersect with visible range
                          const clampedStart = Math.max(bStart, rangeStartMs);
                          const clampedEnd = Math.min(bEnd, rangeEndMs);

                          if (clampedStart >= clampedEnd) return null;

                          const leftPct =
                            ((clampedStart - rangeStartMs) / (rangeEndMs - rangeStartMs)) * 100;
                          const widthPct = Math.max(
                            0.5,
                            ((clampedEnd - clampedStart) / (rangeEndMs - rangeStartMs)) * 100
                          );

                          return (
                            <button
                              key={booking.booking_id}
                              type="button"
                              onClick={() => handleOpenBookingDetail(booking.booking_id)}
                              style={{
                                left: `${leftPct}%`,
                                width: `${widthPct}%`,
                              }}
                              className="absolute h-9 bg-[#111111] hover:bg-[#2A2A2A] text-white border border-[#222222] shadow-sm px-2 text-left transition-all z-10 overflow-hidden flex items-center justify-between gap-1 group/btn cursor-pointer"
                              title={`Click để xem chi tiết: ${booking.guest_name} (${formatVietnamTime(
                                booking.check_in_at
                              )} - ${formatVietnamTime(booking.check_out_at)})`}
                            >
                              <div className="truncate text-[11px] leading-tight flex-1">
                                <div className="font-medium truncate">
                                  {booking.guest_name}
                                </div>
                                <div className="text-[9px] text-[#A0A0A0] font-mono truncate">
                                  {formatVietnamTime(booking.check_in_at)} -{" "}
                                  {formatVietnamTime(booking.check_out_at)}
                                </div>
                              </div>

                              {booking.menu_item_count > 0 && (
                                <span
                                  className="text-[9px] px-1 py-0.2 bg-[#2E2E2E] text-amber-300 font-mono flex items-center gap-0.5 flex-shrink-0"
                                  title={`Đã đặt trước ${booking.menu_item_count} món F&B`}
                                >
                                  <UtensilsCrossed className="w-2.5 h-2.5" />
                                  <span>{booking.menu_item_count}</span>
                                </span>
                              )}
                            </button>
                          );
                        })}

                        {/* Empty track indicator */}
                        {room.bookings.length === 0 && (
                          <div className="absolute inset-0 flex items-center justify-center text-[11px] text-[#CCCCCC] select-none pointer-events-none">
                            Trống lịch
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TICKETS / SỰ CỐ BOARD */}
      {activeTab === "tickets" && (
        <div className="space-y-4">
          <div className="bg-white border border-[#E5E5E5] p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#707072]">Bộ lọc trạng thái:</span>
              <div className="flex items-center border border-[#E5E5E5]">
                {["ALL", "pending", "in_progress", "resolved"].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setTicketStatusFilter(st)}
                    className={`px-3 py-1 text-xs font-medium transition-colors ${
                      ticketStatusFilter === st
                        ? "bg-[#111111] text-white"
                        : "bg-white text-[#707072] hover:text-[#111111]"
                    }`}
                  >
                    {st === "ALL"
                      ? "Tất cả"
                      : st === "pending"
                      ? "Chờ xử lý"
                      : st === "in_progress"
                      ? "Đang xử lý"
                      : "Đã giải quyết"}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-xs text-[#707072]">
              Tổng: <span className="font-semibold text-[#111111]">{filteredTickets.length}</span> sự cố
            </div>
          </div>

          <div className="bg-white border border-[#E5E5E5] divide-y divide-[#EAEAEA]">
            {filteredTickets.map((ticket) => (
              <div key={ticket.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 text-xs font-semibold bg-[#F5F5F5] border border-[#E5E5E5] text-[#111111]">
                      P.{ticket.room_number || ticket.room_name}
                    </span>
                    <span className="text-xs font-medium text-[#111111]">
                      {ticket.category}
                    </span>
                    <span className="text-[11px] text-[#9E9EA0]">
                      {formatVietnamDateTime(ticket.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-[#707072] max-w-xl">
                    {ticket.description}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={ticket.status}
                    disabled={updatingTicketId === ticket.id}
                    onChange={(e) =>
                      handleTicketStatusChange(ticket.id, e.target.value as TicketStatus)
                    }
                    className={`text-xs px-2.5 py-1 border font-medium focus:outline-none cursor-pointer ${
                      ticket.status === "pending"
                        ? "bg-rose-50 text-rose-800 border-rose-200"
                        : ticket.status === "in_progress"
                        ? "bg-amber-50 text-amber-800 border-amber-200"
                        : "bg-emerald-50 text-emerald-800 border-emerald-200"
                    }`}
                  >
                    <option value="pending">Chờ xử lý (Pending)</option>
                    <option value="in_progress">Đang xử lý (In Progress)</option>
                    <option value="resolved">Đã giải quyết (Resolved)</option>
                  </select>
                </div>
              </div>
            ))}

            {filteredTickets.length === 0 && (
              <div className="p-12 text-center text-xs text-[#707072]">
                Không có sự cố nào cần xử lý cho chi nhánh này.
              </div>
            )}
          </div>
        </div>
      )}

      {/* BOOKING DETAIL DRAWER (SIDE MODAL) */}
      {selectedBookingId && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-[1px] transition-opacity"
            onClick={handleCloseBookingDetail}
          />

          {/* Drawer content */}
          <div className="relative w-full max-w-lg bg-white h-full shadow-2xl z-10 flex flex-col justify-between border-l border-[#E5E5E5] animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-4 border-b border-[#E5E5E5] flex items-center justify-between bg-[#FAFAFA]">
              <div>
                <div className="text-[11px] font-mono text-[#707072] uppercase tracking-wider">
                  Chi tiết đơn lưu trú
                </div>
                <h3 className="text-sm font-semibold text-[#111111] font-mono mt-0.5">
                  #{selectedBookingId.slice(0, 8)}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseBookingDetail}
                className="p-1.5 text-[#707072] hover:text-[#111111] hover:bg-[#EAEAEA] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body (Scrollable) */}
            <div className="p-5 overflow-y-auto space-y-6 flex-1">
              {isLoadingBooking && (
                <div className="py-12 text-center text-xs text-[#707072] flex flex-col items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-[#111111] border-t-transparent rounded-full animate-spin"></div>
                  <span>Đang tải thông tin đặt phòng & F&B...</span>
                </div>
              )}

              {bookingError && (
                <div className="p-3 bg-[#FAF5F5] border border-rose-200 text-rose-800 text-xs">
                  {bookingError}
                </div>
              )}

              {bookingDetail && (
                <>
                  {/* Status Badges */}
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 text-xs font-medium bg-[#111111] text-white">
                      {bookingDetail.booking_status.toUpperCase()}
                    </span>
                    <span className="px-2 py-0.5 text-xs font-medium bg-[#F5F5F5] border border-[#E5E5E5] text-[#111111]">
                      {bookingDetail.payment_status}
                    </span>
                  </div>

                  {/* Customer Info Card */}
                  <div className="bg-[#FAFAFA] border border-[#E5E5E5] p-3.5 space-y-2">
                    <div className="text-[11px] font-semibold text-[#707072] uppercase tracking-wider">
                      Thông tin khách hàng
                    </div>
                    <div className="text-sm font-semibold text-[#111111]">
                      {bookingDetail.guest_name}
                    </div>
                    <div className="space-y-1 text-xs text-[#707072]">
                      {bookingDetail.guest_phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-[#9E9EA0]" />
                          <span>{bookingDetail.guest_phone}</span>
                        </div>
                      )}
                      {bookingDetail.guest_email && (
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-[#9E9EA0]" />
                          <span>{bookingDetail.guest_email}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Users className="w-3.5 h-3.5 text-[#9E9EA0]" />
                        <span>{bookingDetail.guest_count} khách</span>
                      </div>
                    </div>
                  </div>

                  {/* Room & Stay Window */}
                  <div className="bg-white border border-[#E5E5E5] p-3.5 space-y-3">
                    <div className="text-[11px] font-semibold text-[#707072] uppercase tracking-wider">
                      Lịch trình lưu trú
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <div className="text-[10px] text-[#9E9EA0]">Phòng</div>
                        <div className="font-semibold text-[#111111] mt-0.5">
                          {bookingDetail.room_number ? `P.${bookingDetail.room_number}` : bookingDetail.room_name}
                        </div>
                        <div className="text-[11px] text-[#707072]">
                          Tầng {bookingDetail.floor_number || 1}
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] text-[#9E9EA0]">Chi nhánh</div>
                        <div className="font-semibold text-[#111111] mt-0.5 truncate">
                          {bookingDetail.property_name}
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-[#F0F0F0] pt-2.5 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[#707072] flex items-center gap-1">
                          <Clock className="w-3 h-3 text-[#9E9EA0]" />
                          Nhận phòng:
                        </span>
                        <span className="font-medium text-[#111111]">
                          {formatVietnamDateTime(bookingDetail.check_in_at)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#707072] flex items-center gap-1">
                          <Clock className="w-3 h-3 text-[#9E9EA0]" />
                          Trả phòng:
                        </span>
                        <span className="font-medium text-[#111111]">
                          {formatVietnamDateTime(bookingDetail.check_out_at)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* F&B PREPARATION SECTION (QUAN TRỌNG) */}
                  <div className="bg-white border border-[#111111] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <UtensilsCrossed className="w-4 h-4 text-[#111111]" />
                        <span className="text-xs font-semibold text-[#111111] uppercase tracking-wider">
                          Đồ ăn & Nước uống cần chuẩn bị
                        </span>
                      </div>
                      {bookingMenuItems.length > 0 && (
                        <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 bg-[#111111] text-white">
                          Tổng: {bookingMenuItems.reduce((a, b) => a + b.quantity, 0)} món
                        </span>
                      )}
                    </div>

                    {bookingMenuItems.length === 0 ? (
                      <div className="p-3 bg-[#FAFAFA] border border-[#E5E5E5] text-xs text-[#707072] text-center">
                        Booking này không có đồ ăn / nước uống đặt trước.
                      </div>
                    ) : (
                      <div className="divide-y divide-[#EAEAEA]">
                        {bookingMenuItems.map((item) => (
                          <div key={item.id} className="py-2.5 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                              {/* Thumbnail */}
                              <div className="w-10 h-10 rounded-none bg-[#F5F5F5] border border-[#E5E5E5] overflow-hidden flex-shrink-0 flex items-center justify-center">
                                {item.current_image_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={item.current_image_url}
                                    alt={item.product_name_snapshot}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <UtensilsCrossed className="w-4 h-4 text-[#CCCCCC]" />
                                )}
                              </div>

                              <div>
                                <div className="text-xs font-semibold text-[#111111]">
                                  {item.product_name_snapshot}
                                </div>
                                <div className="text-[11px] text-[#707072] flex items-center gap-1.5 mt-0.5">
                                  <span className="font-mono font-bold text-[#111111]">
                                    x{item.quantity}
                                  </span>
                                  <span>·</span>
                                  <span>
                                    {item.unit_price_vnd.toLocaleString("vi-VN")}đ/món
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="text-right">
                              {item.source_type === "REWARD" ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                                  <Gift className="w-3 h-3 text-amber-600" />
                                  <span>Quà Rewards (0đ)</span>
                                </span>
                              ) : (
                                <span className="text-xs font-semibold text-[#111111]">
                                  {item.total_price_vnd.toLocaleString("vi-VN")}đ
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Financial Summary */}
                  <div className="bg-[#FAFAFA] border border-[#E5E5E5] p-3.5 space-y-1.5 text-xs">
                    <div className="text-[11px] font-semibold text-[#707072] uppercase tracking-wider mb-2">
                      Chi phí & Thanh toán
                    </div>
                    <div className="flex justify-between text-[#707072]">
                      <span>Tiền phòng:</span>
                      <span className="font-mono">{bookingDetail.gross_amount_vnd.toLocaleString("vi-VN")}đ</span>
                    </div>
                    {bookingDetail.discount_amount_vnd > 0 && (
                      <div className="flex justify-between text-emerald-700">
                        <span>Giảm giá (Voucher):</span>
                        <span className="font-mono">-{bookingDetail.discount_amount_vnd.toLocaleString("vi-VN")}đ</span>
                      </div>
                    )}
                    {bookingDetail.menu_amount_vnd > 0 && (
                      <div className="flex justify-between text-[#707072]">
                        <span>Tiền F&B đặt trước:</span>
                        <span className="font-mono">+{bookingDetail.menu_amount_vnd.toLocaleString("vi-VN")}đ</span>
                      </div>
                    )}
                    <div className="border-t border-[#E5E5E5] pt-2 flex justify-between font-semibold text-[#111111] text-sm">
                      <span>Tổng thanh toán thực tế:</span>
                      <span className="font-mono">{bookingDetail.final_paid_amount_vnd.toLocaleString("vi-VN")}đ</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-3 bg-[#FAFAFA] border-t border-[#E5E5E5] text-right">
              <button
                type="button"
                onClick={handleCloseBookingDetail}
                className="px-4 py-1.5 text-xs font-medium text-[#111111] bg-white border border-[#CCCCCC] hover:bg-[#F5F5F5] transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
