"use client";

import React, { useState } from "react";
import {
  updateRoomStatus,
  updateTicketStatusAdmin,
  type RoomOperationalStatus,
  type TicketStatus,
  type StaffDashboardData,
} from "@/lib/data/admin";

export type StaffDashboardDataPayload = StaffDashboardData;

export type RoomOperationItem = NonNullable<StaffDashboardData["room_operations"]>[number];
export type TicketItem = NonNullable<StaffDashboardData["tickets"]>[number];
export type TodayBookingItem = NonNullable<StaffDashboardData["today_bookings"]>[number];

export type ScheduleItem = TodayBookingItem & {
  eventType: "checkin" | "checkout";
};

interface OperationsDashboardClientProps {
  initialData: StaffDashboardDataPayload | null;
  loadError: boolean;
  staffEmail?: string | null;
}

export default function OperationsDashboardClient({
  initialData,
  loadError: initialLoadError,
  staffEmail,
}: OperationsDashboardClientProps) {
  const [dashboardData, setDashboardData] = useState<StaffDashboardDataPayload | null>(initialData);
  const [loadError] = useState<boolean>(initialLoadError);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const [activeTab, setActiveTab] = useState<"rooms" | "tickets" | "schedule">("rooms");
  const [roomFilter, setRoomFilter] = useState<string>("all");
  const [scheduleFilter, setScheduleFilter] = useState<"all" | "checkin" | "checkout">("all");

  const showToast = (text: string, type: "success" | "error") => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3000);
  };

  const roomOperations: RoomOperationItem[] = dashboardData?.room_operations || [];
  const tickets: TicketItem[] = dashboardData?.tickets || [];
  const todayBookings: TodayBookingItem[] = dashboardData?.today_bookings || [];

  // KPI Calculations
  const roomKPIs = {
    ready: roomOperations.filter((r) => r.operational_status === "ready").length,
    occupied: roomOperations.filter((r) => r.operational_status === "occupied").length,
    cleaning: roomOperations.filter((r) => r.operational_status === "cleaning").length,
    maintenance: roomOperations.filter((r) => r.operational_status === "maintenance").length,
  };

  const checkinCount = todayBookings.filter((b) => b.is_checkin_today).length;
  const checkoutCount = todayBookings.filter((b) => b.is_checkout_today).length;

  // 1. Room Mutation Reconcile (Authoritative Server Response)
  const handleRoomStatusChange = async (roomId: string, newStatus: RoomOperationalStatus) => {
    setIsUpdating(true);
    try {
      const updatedRecord = await updateRoomStatus(roomId, newStatus);
      if (updatedRecord) {
        setDashboardData((prev) => {
          if (!prev) return prev;
          const currentRooms = prev.room_operations || [];
          return {
            ...prev,
            room_operations: currentRooms.map((r) =>
              r.room_id === (updatedRecord.room_id || roomId)
                ? {
                  ...r,
                  operational_status: updatedRecord.operational_status || newStatus,
                  updated_at: updatedRecord.updated_at || r.updated_at,
                  updated_by: updatedRecord.updated_by || r.updated_by,
                }
                : r
            ),
          };
        });
        showToast("Cập nhật trạng thái phòng thành công!", "success");
      } else {
        showToast("Không thể cập nhật trạng thái phòng. Vui lòng thử lại.", "error");
      }
    } catch {
      showToast("Đã xảy ra lỗi khi cập nhật phòng.", "error");
    } finally {
      setIsUpdating(false);
    }
  };

  // 2. Ticket Mutation Reconcile (Authoritative Server Response)
  const handleTicketStatusChange = async (ticketId: string, newStatus: TicketStatus) => {
    setIsUpdating(true);
    try {
      const res = await updateTicketStatusAdmin(ticketId, newStatus);
      if (res) {
        setDashboardData((prev) => {
          if (!prev) return prev;
          const currentTickets = prev.tickets || [];
          return {
            ...prev,
            tickets: currentTickets.map((t) =>
              t.id === (res.id || ticketId)
                ? {
                  ...t,
                  status: res.status,
                  updated_at: res.updated_at,
                }
                : t
            ),
          };
        });
        showToast("Cập nhật trạng thái sự cố thành công!", "success");
      } else {
        showToast("Không thể cập nhật sự cố. Vui lòng thử lại.", "error");
      }
    } catch {
      showToast("Đã xảy ra lỗi khi cập nhật sự cố.", "error");
    } finally {
      setIsUpdating(false);
    }
  };

  if (loadError || !dashboardData) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <h2 className="text-xl font-bold text-red-700 mb-2">Không thể tải dữ liệu vận hành</h2>
          <p className="text-red-600 mb-4">Đã xảy ra lỗi kết nối với máy chủ backend.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 font-medium"
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  const filteredRooms = roomOperations.filter((r) =>
    roomFilter === "all" ? true : r.operational_status === roomFilter
  );

  const scheduleItems: ScheduleItem[] = [];
  todayBookings.forEach((b) => {
    if (b.is_checkin_today) scheduleItems.push({ ...b, eventType: "checkin" });
    if (b.is_checkout_today) scheduleItems.push({ ...b, eventType: "checkout" });
  });

  const filteredSchedule = scheduleItems.filter((item) =>
    scheduleFilter === "all" ? true : item.eventType === scheduleFilter
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {toastMessage && (
        <div
          className={`fixed bottom-4 right-4 px-4 py-2 rounded-md text-white font-medium shadow-lg z-50 ${toastMessage.type === "success" ? "bg-green-600" : "bg-red-600"
            }`}
        >
          {toastMessage.text}
        </div>
      )}

      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bảng Điều Khiển Vận Hành</h1>
          <p className="text-sm text-gray-500">
            Xin chào {staffEmail ? <span className="font-semibold text-gray-700">{staffEmail}</span> : "Nhân viên"}
          </p>
        </div>
      </div>

      {/* Thẻ KPI */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <button
          onClick={() => { setActiveTab("rooms"); setRoomFilter("ready"); }}
          className={`p-4 rounded-lg border text-left transition ${roomFilter === "ready" && activeTab === "rooms" ? "ring-2 ring-green-500 bg-green-50" : "bg-white"
            }`}
        >
          <p className="text-xs text-gray-500 font-medium">Sẵn sàng (Ready)</p>
          <p className="text-2xl font-bold text-green-600">{roomKPIs.ready}</p>
        </button>

        <button
          onClick={() => { setActiveTab("rooms"); setRoomFilter("occupied"); }}
          className={`p-4 rounded-lg border text-left transition ${roomFilter === "occupied" && activeTab === "rooms" ? "ring-2 ring-blue-500 bg-blue-50" : "bg-white"
            }`}
        >
          <p className="text-xs text-gray-500 font-medium">Đang ở (Occupied)</p>
          <p className="text-2xl font-bold text-blue-600">{roomKPIs.occupied}</p>
        </button>

        <button
          onClick={() => { setActiveTab("rooms"); setRoomFilter("cleaning"); }}
          className={`p-4 rounded-lg border text-left transition ${roomFilter === "cleaning" && activeTab === "rooms" ? "ring-2 ring-yellow-500 bg-yellow-50" : "bg-white"
            }`}
        >
          <p className="text-xs text-gray-500 font-medium">Đang dọn (Cleaning)</p>
          <p className="text-2xl font-bold text-yellow-600">{roomKPIs.cleaning}</p>
        </button>

        <button
          onClick={() => { setActiveTab("rooms"); setRoomFilter("maintenance"); }}
          className={`p-4 rounded-lg border text-left transition ${roomFilter === "maintenance" && activeTab === "rooms" ? "ring-2 ring-red-500 bg-red-50" : "bg-white"
            }`}
        >
          <p className="text-xs text-gray-500 font-medium">Bảo trì (Maintenance)</p>
          <p className="text-2xl font-bold text-red-600">{roomKPIs.maintenance}</p>
        </button>

        <button
          onClick={() => { setActiveTab("schedule"); setScheduleFilter("checkin"); }}
          className={`p-4 rounded-lg border text-left transition ${scheduleFilter === "checkin" && activeTab === "schedule" ? "ring-2 ring-indigo-500 bg-indigo-50" : "bg-white"
            }`}
        >
          <p className="text-xs text-gray-500 font-medium">Check-in Hôm nay</p>
          <p className="text-2xl font-bold text-indigo-600">{checkinCount}</p>
        </button>

        <button
          onClick={() => { setActiveTab("schedule"); setScheduleFilter("checkout"); }}
          className={`p-4 rounded-lg border text-left transition ${scheduleFilter === "checkout" && activeTab === "schedule" ? "ring-2 ring-purple-500 bg-purple-50" : "bg-white"
            }`}
        >
          <p className="text-xs text-gray-500 font-medium">Check-out Hôm nay</p>
          <p className="text-2xl font-bold text-purple-600">{checkoutCount}</p>
        </button>
      </div>

      {/* Tabs Navigation */}
      <div className="flex space-x-4 border-b">
        <button
          onClick={() => setActiveTab("rooms")}
          className={`pb-2 text-sm font-semibold border-b-2 ${activeTab === "rooms" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500"
            }`}
        >
          Trạng Thái Phòng ({roomOperations.length})
        </button>
        <button
          onClick={() => setActiveTab("tickets")}
          className={`pb-2 text-sm font-semibold border-b-2 ${activeTab === "tickets" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500"
            }`}
        >
          Sự Cố Tiếp Nhận ({tickets.length})
        </button>
        <button
          onClick={() => setActiveTab("schedule")}
          className={`pb-2 text-sm font-semibold border-b-2 ${activeTab === "schedule" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500"
            }`}
        >
          Lịch Đón Trả Khách ({scheduleItems.length})
        </button>
      </div>

      {/* Tab 1: Bảng Phòng */}
      {activeTab === "rooms" && (
        <div className="bg-white rounded-lg border p-4 space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-600">Lọc trạng thái:</span>
            <div className="space-x-2">
              {["all", "ready", "occupied", "cleaning", "maintenance"].map((st) => (
                <button
                  key={st}
                  onClick={() => setRoomFilter(st)}
                  className={`px-3 py-1 rounded-md text-xs font-medium capitalize ${roomFilter === st ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600"
                    }`}
                >
                  {st === "all" ? "Tất cả" : st}
                </button>
              ))}
            </div>
          </div>

          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs border-b">
              <tr>
                <th className="p-3">Tên Phòng</th>
                <th className="p-3">Trạng Thái Hiện Tại</th>
                <th className="p-3">Cập Nhật Cuối</th>
                <th className="p-3 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredRooms.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-gray-500">
                    Không có phòng nào phù hợp.
                  </td>
                </tr>
              ) : (
                filteredRooms.map((room) => (
                  <tr key={room.room_id}>
                    <td className="p-3 font-medium text-gray-900">{room.room_name || room.room_id}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${room.operational_status === "ready"
                          ? "bg-green-100 text-green-800"
                          : room.operational_status === "occupied"
                            ? "bg-blue-100 text-blue-800"
                            : room.operational_status === "cleaning"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-red-100 text-red-800"
                          }`}
                      >
                        {room.operational_status}
                      </span>
                    </td>
                    <td className="p-3 text-gray-500 text-xs">
                      {room.updated_at ? new Date(room.updated_at).toLocaleString("vi-VN") : "---"}
                    </td>
                    <td className="p-3 text-right space-x-1">
                      <button
                        disabled={isUpdating}
                        onClick={() => handleRoomStatusChange(room.room_id, "ready")}
                        className="px-2 py-1 text-xs bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 rounded"
                      >
                        Sẵn sàng
                      </button>
                      <button
                        disabled={isUpdating}
                        onClick={() => handleRoomStatusChange(room.room_id, "occupied")}
                        className="px-2 py-1 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded"
                      >
                        Có khách
                      </button>
                      <button
                        disabled={isUpdating}
                        onClick={() => handleRoomStatusChange(room.room_id, "cleaning")}
                        className="px-2 py-1 text-xs bg-yellow-50 text-yellow-700 hover:bg-yellow-100 border border-yellow-200 rounded"
                      >
                        Đang dọn
                      </button>
                      <button
                        disabled={isUpdating}
                        onClick={() => handleRoomStatusChange(room.room_id, "maintenance")}
                        className="px-2 py-1 text-xs bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 rounded"
                      >
                        Bảo trì
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: Danh Sách Sự Cố */}
      {activeTab === "tickets" && (
        <div className="bg-white rounded-lg border p-4 space-y-4">
          <div className="divide-y">
            {tickets.length === 0 ? (
              <p className="p-4 text-center text-gray-500">Chưa có sự cố nào ghi nhận.</p>
            ) : (
              tickets.map((t) => (
                <div key={t.id} className="py-3 flex justify-between items-center">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-gray-900">{t.category || "Sự cố"}</span>
                      <span className="text-xs text-gray-500">({t.room_name || "Chưa rõ phòng"})</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{t.description}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Khách: {t.guest_name || "N/A"} - SĐT: {t.guest_phone || "N/A"}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs px-2 py-1 rounded bg-gray-100 font-medium uppercase">{t.status}</span>

                    {t.status === "pending" && (
                      <button
                        disabled={isUpdating}
                        onClick={() => handleTicketStatusChange(t.id, "in_progress")}
                        className="px-3 py-1 text-xs bg-yellow-600 text-white rounded hover:bg-yellow-700 font-medium"
                      >
                        Tiếp nhận xử lý
                      </button>
                    )}

                    {t.status === "in_progress" && (
                      <button
                        disabled={isUpdating}
                        onClick={() => handleTicketStatusChange(t.id, "resolved")}
                        className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 font-medium"
                      >
                        Đánh dấu đã xử lý
                      </button>
                    )}

                    {t.status === "resolved" && (
                      <button
                        disabled={isUpdating}
                        onClick={() => handleTicketStatusChange(t.id, "in_progress")}
                        className="px-3 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700 font-medium"
                      >
                        Mở lại
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Lịch Đón Trả Khách */}
      {activeTab === "schedule" && (
        <div className="bg-white rounded-lg border p-4 space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-600">Lọc sự kiện:</span>
            <div className="space-x-2">
              <button
                onClick={() => setScheduleFilter("all")}
                className={`px-3 py-1 rounded-md text-xs font-medium ${scheduleFilter === "all" ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600"
                  }`}
              >
                Tất cả
              </button>
              <button
                onClick={() => setScheduleFilter("checkin")}
                className={`px-3 py-1 rounded-md text-xs font-medium ${scheduleFilter === "checkin" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"
                  }`}
              >
                Check-in
              </button>
              <button
                onClick={() => setScheduleFilter("checkout")}
                className={`px-3 py-1 rounded-md text-xs font-medium ${scheduleFilter === "checkout" ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-600"
                  }`}
              >
                Check-out
              </button>
            </div>
          </div>

          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs border-b">
              <tr>
                <th className="p-3">Loại Sự Kiện</th>
                <th className="p-3">Mã Booking</th>
                <th className="p-3">Giờ Check-in / Out</th>
                <th className="p-3">Trạng Thái Booking</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredSchedule.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-gray-500">
                    Không có lịch đón trả nào hôm hôm nay.
                  </td>
                </tr>
              ) : (
                filteredSchedule.map((item, idx) => (
                  <tr key={`${item.id || idx}-${item.eventType}`}>
                    <td className="p-3">
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold uppercase ${item.eventType === "checkin" ? "bg-indigo-100 text-indigo-800" : "bg-purple-100 text-purple-800"
                          }`}
                      >
                        {item.eventType}
                      </span>
                    </td>
                    <td className="p-3 font-medium text-gray-900">{item.id || "N/A"}</td>
                    <td className="p-3 text-gray-600 text-xs">
                      {item.eventType === "checkin" ? item.check_in : item.check_out}
                    </td>
                    <td className="p-3 text-gray-500 text-xs">{item.booking_status || "N/A"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}