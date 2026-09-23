"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Calendar,
  LifeBuoy,
  DoorOpen,
  LogIn,
  LogOut,
  Phone,
  RefreshCw,
  AlertCircle,
  X,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  MetricsSummary,
  type OperationsMetrics,
} from "@/components/operations/MetricsSummary";
import {
  RoomOperationsTable,
  type RoomOperationItem,
  type OperationalStatus,
} from "@/components/operations/RoomOperationsTable";
import {
  TicketOperationsList,
  type OperationTicket,
  type TicketStatus,
} from "@/components/operations/TicketOperationsList";
import {
  updateRoomStatus,
  updateTicketStatusAdmin,
  type StaffDashboardData,
  type RoomOperationalStatus,
} from "@/lib/data/admin";

export interface OperationsDashboardClientProps {
  initialData: StaffDashboardData;
  staffEmail?: string;
}

export function OperationsDashboardClient({
  initialData,
  staffEmail,
}: OperationsDashboardClientProps) {
  // ── 1. Local State initialized strictly from server payload ──────────────
  const [rooms, setRooms] = React.useState<RoomOperationItem[]>(() => {
    return (initialData.room_operations ?? []).map((ro) => ({
      room_id: ro.room_id,
      room_name: ro.room_name,
      operational_status: ro.operational_status as OperationalStatus,
      updated_at: ro.updated_at,
      updated_by: ro.updated_by,
    }));
  });

  const [tickets, setTickets] = React.useState<OperationTicket[]>(() => {
    return (initialData.tickets ?? []).map((t) => ({
      id: t.id,
      roomName: t.room_name ?? "Phòng không xác định",
      guestName: t.guest_name ?? "Khách không xác định",
      guestPhone: t.guest_phone,
      category: t.category,
      description: t.description,
      status: t.status as TicketStatus,
      createdAt: t.created_at
        ? new Intl.DateTimeFormat("vi-VN", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: "Asia/Ho_Chi_Minh",
          }).format(new Date(t.created_at))
        : "Không rõ",
      updatedAt: t.updated_at,
    }));
  });

  const todayBookings = React.useMemo(
    () => initialData.today_bookings ?? [],
    [initialData.today_bookings]
  );

  const [activeTab, setActiveTab] = React.useState<"rooms" | "tickets" | "schedule">("rooms");
  const [selectedRoomStatusFilter, setSelectedRoomStatusFilter] = React.useState<string>("all");
  const [pendingRoomId, setPendingRoomId] = React.useState<string | null>(null);
  const [pendingTicketId, setPendingTicketId] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = React.useState<string>("Vừa tải");
  const [isRefreshing, setIsRefreshing] = React.useState<boolean>(false);

  // ── 2. Dynamic Operational Metrics calculated from live state ────────────
  const metrics: OperationsMetrics = React.useMemo(() => {
    const totalRooms = rooms.length;
    const availableRooms = rooms.filter((r) => r.operational_status === "ready").length;
    const occupiedRooms = rooms.filter((r) => r.operational_status === "occupied").length;
    const cleaningRooms = rooms.filter((r) => r.operational_status === "cleaning").length;
    const maintenanceRooms = rooms.filter((r) => r.operational_status === "maintenance").length;
    const todayCheckIns = todayBookings.filter((b) => b.is_checkin_today).length;
    const todayCheckOuts = todayBookings.filter((b) => b.is_checkout_today).length;
    const activeTickets = tickets.filter((t) => t.status !== "resolved").length;

    return {
      totalRooms,
      availableRooms,
      occupiedRooms,
      cleaningRooms,
      maintenanceRooms,
      todayCheckIns,
      todayCheckOuts,
      activeTickets,
    };
  }, [rooms, tickets, todayBookings]);

  // ── 3. KPI Filter Handler ────────────────────────────────────────────────
  const handleMetricCardClick = (filterKey: string) => {
    if (filterKey === "tickets") {
      setActiveTab("tickets");
    } else if (filterKey === "checkins" || filterKey === "checkouts") {
      setActiveTab("schedule");
    } else {
      // Room operational statuses: "ready" | "occupied" | "cleaning" | "maintenance"
      setActiveTab("rooms");
      setSelectedRoomStatusFilter((prev) => (prev === filterKey ? "all" : filterKey));
    }
  };

  // ── 4. Persist Mutation: updateRoomStatus with row-level pending & rollback
  const handleRoomStatusChange = async (roomId: string, newStatus: OperationalStatus) => {
    setErrorMessage(null);
    setPendingRoomId(roomId);
    const previousRooms = rooms;

    // Optimistic UI update
    setRooms((prev) =>
      prev.map((r) =>
        r.room_id === roomId
          ? {
              ...r,
              operational_status: newStatus,
              updated_at: new Date().toISOString(),
            }
          : r
      )
    );

    try {
      await updateRoomStatus(roomId, newStatus as RoomOperationalStatus);
      const now = new Date();
      setLastRefreshed(
        new Intl.DateTimeFormat("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
          timeZone: "Asia/Ho_Chi_Minh",
        }).format(now)
      );
    } catch (err) {
      console.error("[OperationsDashboardClient] Lỗi cập nhật trạng thái phòng:", err);
      // Revert to snapshot
      setRooms(previousRooms);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Không thể cập nhật trạng thái buồng phòng. Vui lòng thử lại."
      );
    } finally {
      setPendingRoomId(null);
    }
  };

  // ── 5. Persist Mutation: updateTicketStatusAdmin with row-level pending & rollback
  const handleTicketStatusChange = async (ticketId: string, newStatus: TicketStatus) => {
    setErrorMessage(null);
    setPendingTicketId(ticketId);
    const previousTickets = tickets;

    // Optimistic UI update
    setTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t))
    );

    try {
      await updateTicketStatusAdmin(ticketId, newStatus);
      const now = new Date();
      setLastRefreshed(
        new Intl.DateTimeFormat("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
          timeZone: "Asia/Ho_Chi_Minh",
        }).format(now)
      );
    } catch (err) {
      console.error("[OperationsDashboardClient] Lỗi cập nhật trạng thái ticket:", err);
      // Revert to snapshot
      setTickets(previousTickets);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Không thể cập nhật trạng thái yêu cầu hỗ trợ. Vui lòng thử lại."
      );
    } finally {
      setPendingTicketId(null);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    window.location.reload();
  };

  // ── 6. Read-only Schedule Items constructed from today_bookings ───────────
  const scheduleItems = React.useMemo(() => {
    const items: Array<{
      id: string;
      roomName: string;
      guestName: string;
      guestPhone: string;
      guestCount: number;
      type: "checkin" | "checkout";
      time: string;
      bookingStatus: string;
      paymentStatus: string;
    }> = [];

    const timeFormatter = new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Ho_Chi_Minh",
    });

    for (const b of todayBookings) {
      if (b.is_checkin_today) {
        items.push({
          id: `checkin-${b.id}`,
          roomName: b.room_name ?? "Phòng không xác định",
          guestName: b.guest_name ?? "Khách không xác định",
          guestPhone: b.guest_phone ?? "Chưa có SĐT",
          guestCount: b.guest_count ?? 1,
          type: "checkin",
          time: timeFormatter.format(new Date(b.check_in)),
          bookingStatus: b.booking_status,
          paymentStatus: b.payment_status,
        });
      }

      if (b.is_checkout_today) {
        items.push({
          id: `checkout-${b.id}`,
          roomName: b.room_name ?? "Phòng không xác định",
          guestName: b.guest_name ?? "Khách không xác định",
          guestPhone: b.guest_phone ?? "Chưa có SĐT",
          guestCount: b.guest_count ?? 1,
          type: "checkout",
          time: timeFormatter.format(new Date(b.check_out)),
          bookingStatus: b.booking_status,
          paymentStatus: b.payment_status,
        });
      }
    }

    return items;
  }, [todayBookings]);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Top Breadcrumb & Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-dark/60 mb-2">
            <Link
              href="/"
              className="inline-flex items-center gap-1 hover:text-primary transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Trang chủ</span>
            </Link>
            <span>/</span>
            <span className="text-dark/80 font-semibold">Operations</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-dark tracking-tight">
                Bảng Điều Khiển Vận Hành Homestay
              </h1>
              <p className="text-xs sm:text-sm text-dark/60 mt-0.5">
                Kapi Stay Concierge — Quản trị trạng thái buồng phòng, tiếp nhận sự cố và lịch đón trả khách 24/7.
              </p>
            </div>
          </div>
        </div>

        {/* Right Header Badges & Actions */}
        <div className="flex items-center gap-2.5 self-start md:self-auto flex-wrap">
          {/* Canonical live data indicator */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Dữ liệu thật</span>
          </div>

          {staffEmail && (
            <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-dark/5 text-xs text-dark/60 font-medium truncate max-w-[200px]">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span className="truncate">{staffEmail}</span>
            </div>
          )}

          {/* Refresh Action */}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleRefresh}
            disabled={isRefreshing}
            leftIcon={
              <RefreshCw
                className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`}
              />
            }
            className="text-dark/60 hover:text-dark text-xs"
          >
            {isRefreshing ? "Đang tải lại..." : `Làm mới (${lastRefreshed})`}
          </Button>

          <Link href="/rooms" target="_blank">
            <Button size="sm" variant="outline">
              Xem trang khách
            </Button>
          </Link>
        </div>
      </div>

      {/* Clear Error Notification Banner */}
      {errorMessage && (
        <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <p className="text-xs sm:text-sm font-semibold text-rose-900">
                Thao tác không thành công
              </p>
              <p className="text-xs text-rose-700 mt-0.5">{errorMessage}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="p-1 rounded-lg text-rose-500 hover:text-rose-800 hover:bg-rose-100 transition-colors"
            aria-label="Đóng thông báo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Real-time KPI Metrics Summary */}
      <div className="mb-8">
        <MetricsSummary
          metrics={metrics}
          selectedFilter={selectedRoomStatusFilter}
          onFilterSelect={handleMetricCardClick}
        />
      </div>

      {/* Main Tab Switcher Navigation */}
      <div className="flex items-center justify-between border-b border-dark/10 mb-6 overflow-x-auto gap-2">
        <div className="flex items-center gap-2 sm:gap-4">
          <button
            type="button"
            onClick={() => setActiveTab("rooms")}
            className={`pb-3 px-1 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
              activeTab === "rooms"
                ? "border-primary text-primary"
                : "border-transparent text-dark/60 hover:text-dark"
            }`}
          >
            <DoorOpen className="w-4 h-4" />
            <span>Buồng phòng ({rooms.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("tickets")}
            className={`pb-3 px-1 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
              activeTab === "tickets"
                ? "border-primary text-primary"
                : "border-transparent text-dark/60 hover:text-dark"
            }`}
          >
            <LifeBuoy className="w-4 h-4" />
            <span>Sự cố & Yêu cầu ({tickets.filter((t) => t.status !== "resolved").length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("schedule")}
            className={`pb-3 px-1 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
              activeTab === "schedule"
                ? "border-primary text-primary"
                : "border-transparent text-dark/60 hover:text-dark"
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Đón / Trả khách hôm nay ({scheduleItems.length})</span>
          </button>
        </div>
      </div>

      {/* Tab Panels */}
      {activeTab === "rooms" && (
        <RoomOperationsTable
          rooms={rooms}
          statusFilter={selectedRoomStatusFilter}
          onStatusFilterChange={setSelectedRoomStatusFilter}
          onStatusChange={handleRoomStatusChange}
          pendingRoomId={pendingRoomId}
        />
      )}

      {activeTab === "tickets" && (
        <TicketOperationsList
          tickets={tickets}
          onStatusChange={handleTicketStatusChange}
          pendingTicketId={pendingTicketId}
        />
      )}

      {activeTab === "schedule" && (
        <div className="bg-white rounded-2xl border border-dark/10 shadow-2xs overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-dark/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-dark flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                <span>Lịch Đón khách & Trả phòng trong ngày (Chế độ xem)</span>
              </h2>
              <p className="text-xs text-dark/60 mt-0.5">
                Đồng bộ tự động từ danh sách đơn đặt phòng của hệ thống Kapi Stay Concierge.
              </p>
            </div>
            <div className="text-xs text-dark/50 self-start sm:self-auto font-medium">
              Tổng số lượt: {scheduleItems.length}
            </div>
          </div>

          <div className="divide-y divide-dark/10">
            {scheduleItems.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <div className="w-12 h-12 rounded-xl bg-dark/5 text-dark/40 flex items-center justify-center mx-auto mb-3">
                  <Calendar className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-dark">
                  Hôm nay không có lịch đón hoặc trả khách
                </p>
                <p className="text-xs text-dark/50 mt-1">
                  Mọi lịch trình mới sẽ tự động cập nhật khi có booking phát sinh.
                </p>
              </div>
            ) : (
              scheduleItems.map((item) => (
                <div
                  key={item.id}
                  className="p-4 sm:p-6 hover:bg-light/30 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start sm:items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        item.type === "checkin"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-purple-100 text-purple-700"
                      }`}
                    >
                      {item.type === "checkin" ? (
                        <LogIn className="w-5 h-5" />
                      ) : (
                        <LogOut className="w-5 h-5" />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-dark text-sm sm:text-base">
                          {item.roomName}
                        </span>
                        <Badge
                          variant={item.type === "checkin" ? "primary" : "secondary"}
                          size="sm"
                        >
                          {item.type === "checkin" ? "Nhận phòng" : "Trả phòng"}
                        </Badge>
                        <Badge
                          variant={item.paymentStatus === "completed" ? "success" : "neutral"}
                          size="sm"
                        >
                          {item.paymentStatus === "completed" ? "Đã thanh toán" : "Chờ thanh toán"}
                        </Badge>
                      </div>

                      <div className="text-xs text-dark/60 mt-1.5 flex flex-wrap items-center gap-3">
                        <span>
                          Khách: <strong className="text-dark/80">{item.guestName}</strong>
                        </span>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1">
                          <Phone className="w-3 h-3 text-dark/40" />
                          <span>{item.guestPhone}</span>
                        </span>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1">
                          <Users className="w-3 h-3 text-dark/40" />
                          <span>{item.guestCount} khách</span>
                        </span>
                        <span>•</span>
                        <span>Thời gian: <strong className="text-dark/80">{item.time}</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* Read-only indicator */}
                  <div className="self-end sm:self-center">
                    <span className="text-xs text-dark/50 italic">Chế độ xem</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default OperationsDashboardClient;
