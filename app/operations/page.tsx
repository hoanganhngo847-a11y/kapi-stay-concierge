// Route tạm thời /operations, chờ Hoàng Anh chốt canonical route
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
  CheckCircle2,
  Phone,
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

// DEMO UI — dữ liệu mẫu tĩnh, chưa kết nối database
const INITIAL_ROOMS: RoomOperationItem[] = [
  {
    id: "a1111111-1111-1111-1111-111111111111",
    name: "Phòng Hoa Hồng (Studio Balcony)",
    propertyName: "Kapi House Hoa Hồng",
    capacity: 2,
    operationalStatus: "occupied",
    currentGuestName: "Nguyễn Văn An",
    nextCheckInTime: "12:00 - 19/09",
    lastCleanedAt: "17/09 - 14:30",
    notes: "Khách lưu trú 2 đêm, check-out trưa mai",
  },
  {
    id: "b2222222-2222-2222-2222-222222222222",
    name: "Phòng Hoa Lan (Cozy Double)",
    propertyName: "Kapi House Hoa Hồng",
    capacity: 2,
    operationalStatus: "ready",
    lastCleanedAt: "18/09 - 09:15",
    notes: "Đã kiểm tra khóa điện tử và cấp mã PIN mới",
  },
  {
    id: "c3333333-3333-3333-3333-333333333333",
    name: "Phòng Hướng Dương (Family Suite)",
    propertyName: "Kapi House Hoa Hồng",
    capacity: 4,
    operationalStatus: "cleaning",
    lastCleanedAt: "16/09 - 15:00",
    notes: "Khách vừa trả phòng lúc 10:00, đang thay ga gối",
  },
  {
    id: "d4444444-4444-4444-4444-444444444444",
    name: "Phòng Cẩm Tú Cầu (Garden View)",
    propertyName: "Kapi House Hoa Hồng",
    capacity: 2,
    operationalStatus: "ready",
    lastCleanedAt: "18/09 - 08:30",
    notes: "Sẵn sàng đón khách nhận phòng 14:00 hôm nay",
  },
];

// DEMO UI — dữ liệu mẫu tĩnh, chưa kết nối database
const INITIAL_TICKETS: OperationTicket[] = [
  {
    id: "ticket-101",
    roomName: "Phòng Hoa Hồng (Studio Balcony)",
    guestName: "Nguyễn Văn An",
    category: "amenity",
    description: "Nhờ homestay hỗ trợ thêm 01 bộ khăn tắm và nước khoáng đóng chai.",
    status: "pending",
    createdAt: "Hôm nay 09:45",
    priority: "normal",
  },
  {
    id: "ticket-102",
    roomName: "Phòng Hướng Dương (Family Suite)",
    guestName: "Trần Thị Mai",
    category: "maintenance",
    description: "Khóa cửa thông minh phản hồi hơi chậm sau khi nhập mã PIN.",
    status: "in_progress",
    createdAt: "Hôm nay 08:20",
    priority: "urgent",
  },
  {
    id: "ticket-103",
    roomName: "Phòng Cẩm Tú Cầu (Garden View)",
    guestName: "Lê Hoàng Khang",
    category: "cleaning",
    description: "Cần hút bụi nhẹ góc ban công trước giờ check-in.",
    status: "resolved",
    createdAt: "Hôm qua 16:10",
    priority: "normal",
  },
];

interface ScheduleItem {
  id: string;
  roomName: string;
  guestName: string;
  guestPhone: string;
  type: "checkin" | "checkout";
  time: string;
  status: "pending" | "completed";
}

// DEMO UI — dữ liệu mẫu tĩnh, chưa kết nối database
const INITIAL_SCHEDULE: ScheduleItem[] = [
  {
    id: "sch-1",
    roomName: "Phòng Cẩm Tú Cầu",
    guestName: "Phạm Minh Đức",
    guestPhone: "0912.345.678",
    type: "checkin",
    time: "14:00 - Hôm nay",
    status: "pending",
  },
  {
    id: "sch-2",
    roomName: "Phòng Hướng Dương",
    guestName: "Trần Thị Mai",
    guestPhone: "0987.654.321",
    type: "checkout",
    time: "10:00 - Hôm nay",
    status: "completed",
  },
  {
    id: "sch-3",
    roomName: "Phòng Hoa Lan",
    guestName: "Đỗ Quốc Bảo",
    guestPhone: "0903.112.233",
    type: "checkin",
    time: "15:30 - Hôm nay",
    status: "pending",
  },
];

export default function OperationsDashboardPage() {
  const [rooms, setRooms] = React.useState<RoomOperationItem[]>(INITIAL_ROOMS);
  const [tickets, setTickets] = React.useState<OperationTicket[]>(INITIAL_TICKETS);
  const [schedule, setSchedule] = React.useState<ScheduleItem[]>(INITIAL_SCHEDULE);
  const [activeTab, setActiveTab] = React.useState<"rooms" | "tickets" | "schedule">("rooms");
  const [selectedMetricFilter, setSelectedMetricFilter] = React.useState<string | undefined>();
  const [lastRefreshed, setLastRefreshed] = React.useState<string>("Vừa xong");
  const [isRefreshing, setIsRefreshing] = React.useState<boolean>(false);

  // Calculate dynamic operational metrics
  const metrics: OperationsMetrics = React.useMemo(() => {
    const totalRooms = rooms.length;
    const availableRooms = rooms.filter((r) => r.operationalStatus === "ready").length;
    const occupiedRooms = rooms.filter((r) => r.operationalStatus === "occupied").length;
    const cleaningRooms = rooms.filter((r) => r.operationalStatus === "cleaning").length;
    const maintenanceRooms = rooms.filter((r) => r.operationalStatus === "maintenance").length;
    const todayCheckIns = schedule.filter((s) => s.type === "checkin").length;
    const todayCheckOuts = schedule.filter((s) => s.type === "checkout").length;
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
  }, [rooms, tickets, schedule]);

  const handleStatusChange = (roomId: string, newStatus: OperationalStatus) => {
    setRooms((prev) =>
      prev.map((room) => {
        if (room.id === roomId) {
          const now = new Date();
          const timeString = `Hôm nay - ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
          return {
            ...room,
            operationalStatus: newStatus,
            lastCleanedAt: newStatus === "ready" ? timeString : room.lastCleanedAt,
          };
        }
        return room;
      })
    );
  };

  const handleTicketStatusChange = (ticketId: string, newStatus: TicketStatus) => {
    setTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t))
    );
  };

  const handleMetricCardClick = (filterKey: string) => {
    setSelectedMetricFilter(filterKey);
    if (filterKey === "tickets") {
      setActiveTab("tickets");
    } else if (filterKey === "checkins" || filterKey === "checkouts") {
      setActiveTab("schedule");
    } else {
      setActiveTab("rooms");
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      const now = new Date();
      setLastRefreshed(
        `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`
      );
    }, 400);
  };

  const handleScheduleToggle = (schId: string) => {
    setSchedule((prev) =>
      prev.map((s) =>
        s.id === schId
          ? {
              ...s,
              status: s.status === "completed" ? "pending" : "completed",
            }
          : s
      )
    );
  };

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
        <div className="flex items-center gap-2.5 self-start md:self-auto">
          {/* DEMO UI — không kết nối live data */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-xs text-amber-800 font-medium">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>DEMO UI</span>
          </div>

          {isRefreshing && (
            <div className="inline-flex items-center gap-1.5 text-xs text-dark/50">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-dark/20 border-t-dark/60 animate-spin" />
              <span>Đang tải...</span>
            </div>
          )}

          <Link href="/rooms" target="_blank">
            <Button size="sm" variant="ghost">
              Xem trang khách
            </Button>
          </Link>
        </div>
      </div>

      {/* Real-time KPI Metrics Summary */}
      <div className="mb-8">
        <MetricsSummary
          metrics={metrics}
          selectedFilter={selectedMetricFilter}
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
            <span>Đón / Trả khách hôm nay ({schedule.length})</span>
          </button>
        </div>
      </div>

      {/* Tab Panels */}
      {activeTab === "rooms" && (
        <RoomOperationsTable
          rooms={rooms}
          onStatusChange={handleStatusChange}
        />
      )}

      {activeTab === "tickets" && (
        <TicketOperationsList
          tickets={tickets}
          onStatusChange={handleTicketStatusChange}
        />
      )}

      {activeTab === "schedule" && (
        <div className="bg-white rounded-2xl border border-dark/10 shadow-2xs overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-dark/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-dark flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                <span>Lịch Đón khách & Trả phòng trong ngày</span>
              </h2>
              <p className="text-xs text-dark/60 mt-0.5">
                Theo dõi giờ check-in tự động và check-out để sắp xếp công tác buồng phòng chuẩn xác.
              </p>
            </div>
          </div>

          <div className="divide-y divide-dark/10">
            {schedule.map((item) => (
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
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-dark text-sm sm:text-base">
                        {item.roomName}
                      </span>
                      <Badge
                        variant={item.type === "checkin" ? "primary" : "secondary"}
                        size="sm"
                      >
                        {item.type === "checkin" ? "Check-in" : "Check-out"}
                      </Badge>
                      <Badge
                        variant={item.status === "completed" ? "success" : "neutral"}
                        size="sm"
                      >
                        {item.status === "completed" ? "Đã xong" : "Chờ xử lý"}
                      </Badge>
                    </div>

                    <div className="text-xs text-dark/60 mt-1 flex flex-wrap items-center gap-3">
                      <span>Khách: <strong>{item.guestName}</strong></span>
                      <span>•</span>
                      <span className="inline-flex items-center gap-1">
                        <Phone className="w-3 h-3 text-dark/40" />
                        <span>{item.guestPhone}</span>
                      </span>
                      <span>•</span>
                      <span>Thời gian: {item.time}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <Button
                    size="sm"
                    variant={item.status === "completed" ? "outline" : "primary"}
                    leftIcon={item.status === "completed" ? undefined : <CheckCircle2 className="w-3.5 h-3.5" />}
                    onClick={() => handleScheduleToggle(item.id)}
                  >
                    {item.status === "completed" ? "Đánh dấu chưa xong" : "Xác nhận hoàn tất"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
