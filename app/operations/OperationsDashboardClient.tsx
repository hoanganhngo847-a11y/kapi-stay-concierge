"use client";

import React, { useState, useTransition } from "react";
import { updateRoomStatus, updateTicketStatusAdmin } from "@/lib/data/admin";

interface OperationsDashboardClientProps {
  initialData: any;
  loadError?: boolean;
  staffEmail?: string;
}

export default function OperationsDashboardClient({
  initialData,
  loadError,
  staffEmail,
}: OperationsDashboardClientProps) {
  const [isPending, startTransition] = useTransition();
  const [dashboardData, setDashboardData] = useState<any>(initialData?.data || initialData || {});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"rooms" | "tickets" | "schedule">("rooms");
  const [scheduleFilter, setScheduleFilter] = useState<"all" | "checkin" | "checkout">("all");

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  if (loadError || !initialData || initialData.success === false) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <h2 className="text-xl font-semibold text-red-700 mb-2">Không thể tải dữ liệu vận hành</h2>
          <p className="text-sm text-red-600 mb-4">
            Đã có lỗi xảy ra khi kết nối tới máy chủ. Vui lòng thử lại sau.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700 transition"
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  const handleRoomStatusChange = (roomId: string, newStatus: any) => {
    startTransition(async () => {
      try {
        const res: any = await updateRoomStatus(roomId, newStatus);
        if (res && (res.success || res.id)) {
          const updatedData = res.data || res;
          setDashboardData((prev: any) => ({
            ...prev,
            rooms: prev.rooms?.map((r: any) =>
              r.id === roomId ? { ...r, ...updatedData } : r
            ),
          }));
          showToast("Cập nhật trạng thái phòng thành công.");
        } else {
          showToast("Không thể cập nhật trạng thái phòng. Vui lòng thử lại.");
        }
      } catch (err) {
        showToast("Đã xảy ra lỗi khi cập nhật phòng.");
      }
    });
  };

  const handleTicketStatusChange = (ticketId: string, newStatus: any) => {
    startTransition(async () => {
      try {
        const res: any = await updateTicketStatusAdmin(ticketId, newStatus);
        if (res && (res.success || res.id)) {
          const updatedData = res.data || res;
          setDashboardData((prev: any) => ({
            ...prev,
            tickets: prev.tickets?.map((t: any) =>
              t.id === ticketId ? { ...t, ...updatedData } : t
            ),
          }));
          showToast("Cập nhật trạng thái sự cố thành công.");
        } else {
          showToast("Không thể cập nhật sự cố. Vui lòng thử lại.");
        }
      } catch (err) {
        showToast("Đã xảy ra lỗi khi cập nhật sự cố.");
      }
    });
  };

  const handleKpiFilter = (filter: "checkin" | "checkout") => {
    setScheduleFilter(filter);
    setActiveTab("schedule");
  };

  const rooms = dashboardData?.rooms || [];
  const tickets = dashboardData?.tickets || [];
  const todayBookings = dashboardData?.today_bookings || dashboardData?.todayBookings || [];

  const filteredBookings = todayBookings.filter((b: any) => {
    if (scheduleFilter === "checkin") return b.type === "checkin";
    if (scheduleFilter === "checkout") return b.type === "checkout";
    return true;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {toastMessage && (
        <div className="fixed bottom-5 right-5 bg-gray-900 text-white px-4 py-2 rounded-md shadow-lg z-50 text-sm">
          {toastMessage}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bảng Điều Khiển Vận Hành</h1>
          {staffEmail && (
            <p className="text-sm text-gray-500">
              Nhân viên đang trực: <span className="font-medium text-gray-700">{staffEmail}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            Dữ liệu thật
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          onClick={() => handleKpiFilter("checkin")}
          className="p-4 bg-white border rounded-lg shadow-sm cursor-pointer hover:border-blue-500 transition"
        >
          <p className="text-sm font-medium text-gray-500">Check-in Hôm Nay</p>
          <p className="text-2xl font-bold text-blue-600">
            {todayBookings.filter((b: any) => b.type === "checkin").length}
          </p>
          <p className="text-xs text-gray-400 mt-1">Bấm để lọc danh sách Check-in</p>
        </div>

        <div
          onClick={() => handleKpiFilter("checkout")}
          className="p-4 bg-white border rounded-lg shadow-sm cursor-pointer hover:border-orange-500 transition"
        >
          <p className="text-sm font-medium text-gray-500">Check-out Hôm Nay</p>
          <p className="text-2xl font-bold text-orange-600">
            {todayBookings.filter((b: any) => b.type === "checkout").length}
          </p>
          <p className="text-xs text-gray-400 mt-1">Bấm để lọc danh sách Check-out</p>
        </div>

        <div
          onClick={() => {
            setScheduleFilter("all");
            setActiveTab("tickets");
          }}
          className="p-4 bg-white border rounded-lg shadow-sm cursor-pointer hover:border-red-500 transition"
        >
          <p className="text-sm font-medium text-gray-500">Sự Cố Cần Xử Lý</p>
          <p className="text-2xl font-bold text-red-600">
            {tickets.filter((t: any) => t.status !== "resolved").length}
          </p>
          <p className="text-xs text-gray-400 mt-1">Bấm để xem danh sách sự cố</p>
        </div>
      </div>

      <div className="flex border-b space-x-4">
        <button
          onClick={() => setActiveTab("rooms")}
          className={`py-2 px-4 text-sm font-medium border-b-2 transition ${activeTab === "rooms"
            ? "border-blue-600 text-blue-600"
            : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
        >
          Trạng Thái Phòng ({rooms.length})
        </button>
        <button
          onClick={() => setActiveTab("tickets")}
          className={`py-2 px-4 text-sm font-medium border-b-2 transition ${activeTab === "tickets"
            ? "border-blue-600 text-blue-600"
            : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
        >
          Sự Cố Phản Hồi ({tickets.length})
        </button>
        <button
          onClick={() => setActiveTab("schedule")}
          className={`py-2 px-4 text-sm font-medium border-b-2 transition ${activeTab === "schedule"
            ? "border-blue-600 text-blue-600"
            : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
        >
          Lịch Đón Trả Khách ({filteredBookings.length})
        </button>
      </div>

      {activeTab === "rooms" && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-3">Số Phòng</th>
                <th className="p-3">Loại Phòng</th>
                <th className="p-3">Trạng Thái</th>
                <th className="p-3 text-right">Hành Động</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rooms.map((room: any) => (
                <tr key={room.id} className="hover:bg-gray-50">
                  <td className="p-3 font-medium">{room.room_number || room.name}</td>
                  <td className="p-3 text-gray-600">{room.type || "Tiêu chuẩn"}</td>
                  <td className="p-3">
                    <span className="px-2 py-1 text-xs rounded-full bg-gray-100 font-medium">
                      {room.status}
                    </span>
                  </td>
                  <td className="p-3 text-right space-x-2">
                    <button
                      disabled={isPending}
                      onClick={() => handleRoomStatusChange(room.id, "clean")}
                      className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100 disabled:opacity-50"
                    >
                      Đã dọn
                    </button>
                    <button
                      disabled={isPending}
                      onClick={() => handleRoomStatusChange(room.id, "maintenance")}
                      className="px-2 py-1 text-xs bg-yellow-50 text-yellow-700 rounded hover:bg-yellow-100 disabled:opacity-50"
                    >
                      Bảo trì
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "tickets" && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-3">Tiêu Đề</th>
                <th className="p-3">Mức Độ</th>
                <th className="p-3">Trạng Thái</th>
                <th className="p-3 text-right">Hành Động</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tickets.map((ticket: any) => (
                <tr key={ticket.id} className="hover:bg-gray-50">
                  <td className="p-3 font-medium">{ticket.title}</td>
                  <td className="p-3">
                    <span className="px-2 py-1 text-xs rounded bg-red-100 text-red-700">
                      {ticket.priority || "Bình thường"}
                    </span>
                  </td>
                  <td className="p-3 text-gray-600">{ticket.status}</td>
                  <td className="p-3 text-right space-x-2">
                    <button
                      disabled={isPending}
                      onClick={() => handleTicketStatusChange(ticket.id, "in_progress")}
                      className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100 disabled:opacity-50"
                    >
                      Đang xử lý
                    </button>
                    <button
                      disabled={isPending}
                      onClick={() => handleTicketStatusChange(ticket.id, "resolved")}
                      className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100 disabled:opacity-50"
                    >
                      Xong
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "schedule" && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="p-3 bg-gray-50 border-b flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">
              Đang lọc: {scheduleFilter === "all" ? "Tất cả" : scheduleFilter.toUpperCase()}
            </span>
            {scheduleFilter !== "all" && (
              <button
                onClick={() => setScheduleFilter("all")}
                className="text-xs text-blue-600 hover:underline"
              >
                Xóa bộ lọc
              </button>
            )}
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-3">Mã Đặt Phòng</th>
                <th className="p-3">Khách Hàng</th>
                <th className="p-3">Loại</th>
                <th className="p-3">Thời Gian</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredBookings.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-gray-500">
                    Không có lịch đón/trả nào phù hợp.
                  </td>
                </tr>
              ) : (
                filteredBookings.map((b: any, idx: number) => (
                  <tr key={b.id || idx} className="hover:bg-gray-50">
                    <td className="p-3 font-medium">{b.booking_code || b.id}</td>
                    <td className="p-3 text-gray-700">{b.guest_name || "Khách ẩn danh"}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-1 text-xs rounded font-medium ${b.type === "checkin"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-orange-100 text-orange-700"
                          }`}
                      >
                        {b.type === "checkin" ? "Check-in" : "Check-out"}
                      </span>
                    </td>
                    <td className="p-3 text-gray-500">{b.time || "Hôm nay"}</td>
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