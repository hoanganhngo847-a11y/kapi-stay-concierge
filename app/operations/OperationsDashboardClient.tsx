"use client";

import React, { useState, useTransition } from "react";
import { updateRoomStatus, updateTicketStatusAdmin } from "@/lib/data/admin";

interface OperationsDashboardClientProps {
  initialData: any;
  loadError?: boolean;
}

export default function OperationsDashboardClient({
  initialData,
  loadError,
}: OperationsDashboardClientProps) {
  const [isPending, startTransition] = useTransition();

  // B2: Render Error Banner nếu fetch fail (Không hiện empty dashboard + badge Dữ liệu thật)
  if (loadError || !initialData || !initialData.success) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-6 text-center shadow-sm">
          <h2 className="text-xl font-semibold mb-2">Không thể tải dữ liệu vận hành</h2>
          <p className="text-sm text-red-600 mb-4">
            Đã có lỗi xảy ra khi kết nối tới máy chủ. Vui lòng kiểm tra lại kết nối hoặc thử lại.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm font-medium"
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  // State dữ liệu thật từ Server
  const [rooms, setRooms] = useState(initialData.room_operations || []);
  const [tickets, setTickets] = useState(initialData.tickets || []);
  const [bookings] = useState(initialData.today_bookings || []);

  const [activeTab, setActiveTab] = useState<"rooms" | "tickets" | "schedule">("rooms");
  const [selectedRoomStatusFilter, setSelectedRoomStatusFilter] = useState<string>("all");

  // B5: State Schedule Filter riêng
  const [scheduleFilter, setScheduleFilter] = useState<"all" | "checkin" | "checkout">("all");

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // B5: Xử lý click KPI
  const handleKpiClick = (type: string) => {
    setErrorMessage(null);
    if (["ready", "occupied", "cleaning", "maintenance"].includes(type)) {
      setActiveTab("rooms");
      setSelectedRoomStatusFilter(type);
    } else if (type === "tickets") {
      setActiveTab("tickets");
    } else if (type === "checkins") {
      setActiveTab("schedule");
      setScheduleFilter("checkin");
    } else if (type === "checkouts") {
      setActiveTab("schedule");
      setScheduleFilter("checkout");
    }
  };

  // B3 & B4: Mutation Phòng có Reconcile + Error Sanitize
  const handleRoomStatusChange = async (roomId: string, newStatus: string) => {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const updatedRoom = await updateRoomStatus(roomId, newStatus);
        if (updatedRoom) {
          setRooms((prev: any[]) =>
            prev.map((r) =>
              r.room_id === roomId
                ? {
                  ...r,
                  operational_status: updatedRoom.operational_status,
                  updated_at: updatedRoom.updated_at,
                  updated_by: updatedRoom.updated_by,
                }
                : r
            )
          );
        }
      } catch (err) {
        // B3: Alert thông báo lỗi domain-safe, không lộ raw DB error
        setErrorMessage("Không thể cập nhật trạng thái phòng. Vui lòng thử lại.");
      }
    });
  };

  // B3 & B4: Mutation Ticket có Reconcile + Error Sanitize
  const handleTicketStatusChange = async (ticketId: string, newStatus: string) => {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const updatedTicket = await updateTicketStatusAdmin(ticketId, newStatus);
        if (updatedTicket) {
          setTickets((prev: any[]) =>
            prev.map((t) =>
              t.id === ticketId
                ? {
                  ...t,
                  status: updatedTicket.status,
                  updated_at: updatedTicket.updated_at,
                }
                : t
            )
          );
        }
      } catch (err) {
        // B3: Alert thông báo lỗi domain-safe
        setErrorMessage("Không thể cập nhật trạng thái yêu cầu. Vui lòng thử lại.");
      }
    });
  };

  // Filter danh sách phòng
  const filteredRooms = rooms.filter((r: any) =>
    selectedRoomStatusFilter === "all"
      ? true
      : r.operational_status === selectedRoomStatusFilter
  );

  // Filter danh sách Schedule theo B5
  const filteredSchedule = bookings.filter((b: any) => {
    if (scheduleFilter === "checkin") return b.type === "checkin" || b.event_type === "checkin";
    if (scheduleFilter === "checkout") return b.type === "checkout" || b.event_type === "checkout";
    return true;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header + Badge Dữ liệu thật */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Operations Dashboard</h1>
          <p className="text-sm text-gray-500">Quản lý vận hành phòng & dịch vụ thực tế</p>
        </div>
        <span className="px-3 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded-full border border-green-300">
          ● Dữ liệu thật
        </span>
      </div>

      {/* Alert Error Sanitize */}
      {errorMessage && (
        <div className="p-3 bg-red-100 border border-red-300 text-red-700 text-sm rounded-md flex justify-between items-center">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="font-bold ml-4">✕</button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <button
          onClick={() => handleKpiClick("ready")}
          className={`p-4 rounded-lg border text-left transition-all ${activeTab === "rooms" && selectedRoomStatusFilter === "ready"
              ? "ring-2 ring-blue-500 border-blue-500 bg-blue-50"
              : "bg-white hover:bg-gray-50"
            }`}
        >
          <p className="text-xs text-gray-500 font-medium">Sẵn sàng</p>
          <p className="text-xl font-bold text-gray-800">
            {rooms.filter((r: any) => r.operational_status === "ready").length}
          </p>
        </button>

        <button
          onClick={() => handleKpiClick("occupied")}
          className={`p-4 rounded-lg border text-left transition-all ${activeTab === "rooms" && selectedRoomStatusFilter === "occupied"
              ? "ring-2 ring-blue-500 border-blue-500 bg-blue-50"
              : "bg-white hover:bg-gray-50"
            }`}
        >
          <p className="text-xs text-gray-500 font-medium">Đang ở</p>
          <p className="text-xl font-bold text-gray-800">
            {rooms.filter((r: any) => r.operational_status === "occupied").length}
          </p>
        </button>

        <button
          onClick={() => handleKpiClick("cleaning")}
          className={`p-4 rounded-lg border text-left transition-all ${activeTab === "rooms" && selectedRoomStatusFilter === "cleaning"
              ? "ring-2 ring-blue-500 border-blue-500 bg-blue-50"
              : "bg-white hover:bg-gray-50"
            }`}
        >
          <p className="text-xs text-gray-500 font-medium">Cần dọn</p>
          <p className="text-xl font-bold text-gray-800">
            {rooms.filter((r: any) => r.operational_status === "cleaning").length}
          </p>
        </button>

        <button
          onClick={() => handleKpiClick("maintenance")}
          className={`p-4 rounded-lg border text-left transition-all ${activeTab === "rooms" && selectedRoomStatusFilter === "maintenance"
              ? "ring-2 ring-blue-500 border-blue-500 bg-blue-50"
              : "bg-white hover:bg-gray-50"
            }`}
        >
          <p className="text-xs text-gray-500 font-medium">Bảo trì</p>
          <p className="text-xl font-bold text-gray-800">
            {rooms.filter((r: any) => r.operational_status === "maintenance").length}
          </p>
        </button>

        <button
          onClick={() => handleKpiClick("checkins")}
          className={`p-4 rounded-lg border text-left transition-all ${activeTab === "schedule" && scheduleFilter === "checkin"
              ? "ring-2 ring-blue-500 border-blue-500 bg-blue-50"
              : "bg-white hover:bg-gray-50"
            }`}
        >
          <p className="text-xs text-gray-500 font-medium">Check-in hôm nay</p>
          <p className="text-xl font-bold text-gray-800">
            {bookings.filter((b: any) => b.type === "checkin" || b.event_type === "checkin").length}
          </p>
        </button>

        <button
          onClick={() => handleKpiClick("checkouts")}
          className={`p-4 rounded-lg border text-left transition-all ${activeTab === "schedule" && scheduleFilter === "checkout"
              ? "ring-2 ring-blue-500 border-blue-500 bg-blue-50"
              : "bg-white hover:bg-gray-50"
            }`}
        >
          <p className="text-xs text-gray-500 font-medium">Check-out hôm nay</p>
          <p className="text-xl font-bold text-gray-800">
            {bookings.filter((b: any) => b.type === "checkout" || b.event_type === "checkout").length}
          </p>
        </button>
      </div>

      {/* Tabs Switcher */}
      <div className="border-b flex gap-6 text-sm font-medium">
        <button
          onClick={() => { setActiveTab("rooms"); setSelectedRoomStatusFilter("all"); }}
          className={`pb-3 ${activeTab === "rooms" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"}`}
        >
          Trạng thái phòng ({rooms.length})
        </button>
        <button
          onClick={() => setActiveTab("tickets")}
          className={`pb-3 ${activeTab === "tickets" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"}`}
        >
          Yêu cầu hỗ trợ ({tickets.length})
        </button>
        <button
          onClick={() => { setActiveTab("schedule"); setScheduleFilter("all"); }}
          className={`pb-3 ${activeTab === "schedule" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"}`}
        >
          Lịch Check-in/out ({bookings.length})
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === "rooms" && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
            <span className="text-sm font-semibold text-gray-700">Danh sách phòng</span>
            <select
              value={selectedRoomStatusFilter}
              onChange={(e) => setSelectedRoomStatusFilter(e.target.value)}
              className="text-sm border rounded-md px-2 py-1 bg-white"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="ready">Sẵn sàng</option>
              <option value="occupied">Đang ở</option>
              <option value="cleaning">Cần dọn</option>
              <option value="maintenance">Bảo trì</option>
            </select>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-100 border-b text-gray-600">
              <tr>
                <th className="p-3">Số phòng</th>
                <th className="p-3">Trạng thái</th>
                <th className="p-3">Cập nhật lúc</th>
                <th className="p-3">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredRooms.map((room: any) => (
                <tr key={room.room_id}>
                  <td className="p-3 font-semibold">{room.room_name || room.room_id}</td>
                  <td className="p-3">
                    <span className="capitalize px-2 py-1 text-xs rounded bg-gray-100 text-gray-800 border">
                      {room.operational_status}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-gray-500">
                    {room.updated_at ? new Date(room.updated_at).toLocaleString("vi-VN") : "---"}
                  </td>
                  <td className="p-3">
                    <select
                      disabled={isPending}
                      value={room.operational_status}
                      onChange={(e) => handleRoomStatusChange(room.room_id, e.target.value)}
                      className="text-xs border rounded p-1 bg-white"
                    >
                      <option value="ready">Sẵn sàng</option>
                      <option value="occupied">Đang ở</option>
                      <option value="cleaning">Cần dọn</option>
                      <option value="maintenance">Bảo trì</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "tickets" && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-100 border-b text-gray-600">
              <tr>
                <th className="p-3">Tiêu đề</th>
                <th className="p-3">Danh mục</th>
                <th className="p-3">Trạng thái</th>
                <th className="p-3">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tickets.map((t: any) => (
                <tr key={t.id}>
                  <td className="p-3 font-medium">{t.title || "Yêu cầu hỗ trợ"}</td>
                  <td className="p-3 text-xs text-gray-500">{t.category || "Dịch vụ"}</td>
                  <td className="p-3">
                    <span className="capitalize px-2 py-1 text-xs rounded bg-blue-50 text-blue-700">
                      {t.status}
                    </span>
                  </td>
                  <td className="p-3">
                    <select
                      disabled={isPending}
                      value={t.status}
                      onChange={(e) => handleTicketStatusChange(t.id, e.target.value)}
                      className="text-xs border rounded p-1 bg-white"
                    >
                      <option value="pending">Pending</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "schedule" && (
        <div className="bg-white rounded-lg border overflow-hidden p-4 space-y-3">
          <div className="flex justify-between items-center border-b pb-2">
            <span className="text-sm font-semibold text-gray-700">
              Lịch Check-in/out ({scheduleFilter === "all" ? "Tất cả" : scheduleFilter})
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setScheduleFilter("all")}
                className={`px-3 py-1 text-xs rounded ${scheduleFilter === "all" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"
                  }`}
              >
                Tất cả
              </button>
              <button
                onClick={() => setScheduleFilter("checkin")}
                className={`px-3 py-1 text-xs rounded ${scheduleFilter === "checkin" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"
                  }`}
              >
                Check-in
              </button>
              <button
                onClick={() => setScheduleFilter("checkout")}
                className={`px-3 py-1 text-xs rounded ${scheduleFilter === "checkout" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"
                  }`}
              >
                Check-out
              </button>
            </div>
          </div>
          <div className="divide-y text-sm">
            {filteredSchedule.map((item: any, idx: number) => (
              <div key={idx} className="py-2 flex justify-between items-center">
                <div>
                  <p className="font-medium text-gray-800">{item.guest_name || "Khách hàng"}</p>
                  <p className="text-xs text-gray-500">Phòng: {item.room_name || item.room_id}</p>
                </div>
                <span className="px-2 py-1 text-xs rounded bg-gray-100 font-semibold uppercase">
                  {item.type || item.event_type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}