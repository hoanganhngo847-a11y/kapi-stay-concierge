"use client";

import * as React from "react";
import Link from "next/link";
import {
  CalendarDays,
  LogIn,
  LogOut,
  BedDouble,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Clock,
  Sparkles,
  Wrench,
  ChevronRight,
} from "lucide-react";
import type { AdminDashboardData } from "@/lib/data/admin";
import { formatVND } from "@/lib/utils/format";

interface AdminDashboardClientProps {
  initialData: AdminDashboardData;
}

export default function AdminDashboardClient({
  initialData,
}: AdminDashboardClientProps) {
  const { kpis, recent_bookings, pending_tickets, room_summaries } = initialData;

  return (
    <div className="space-y-8">
      {/* Top Banner / Operational Quick-Link */}
      <div className="bg-white border border-[#E5E5E5] p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[#707072]">
              Kapi Concierge Core
            </span>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#111111]" />
            <span className="text-[10px] uppercase tracking-wider text-[#707072]">
              Hệ thống vận hành trực tiếp
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-normal text-[#111111] tracking-tight">
            Tổng quan quản trị hệ thống
          </h1>
          <p className="text-xs text-[#707072] mt-1 leading-relaxed">
            Theo dõi tình trạng buồng phòng, lượt khách và giao dịch đặt phòng thời gian thực.
          </p>
        </div>

        <Link
          href="/operations"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#111111] text-white text-xs font-medium uppercase tracking-wider hover:bg-[#262626] transition-colors shrink-0"
        >
          <span>Mở Operations</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* KPI Cards Grid */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[#707072] mb-3">
          Chỉ số hoạt động hôm nay
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {/* Card 1: Today Bookings */}
          <div className="bg-white border border-[#E5E5E5] p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[#707072] mb-2">
              <span className="text-[11px] font-medium">Đặt phòng mới</span>
              <CalendarDays className="w-4 h-4 text-[#111111]" />
            </div>
            <div>
              <span className="text-2xl font-semibold text-[#111111] tracking-tight">
                {kpis.today_bookings_count}
              </span>
              <p className="text-[10px] text-[#9E9EA0] mt-0.5">Tạo trong ngày</p>
            </div>
          </div>

          {/* Card 2: Today Check-ins */}
          <div className="bg-white border border-[#E5E5E5] p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[#707072] mb-2">
              <span className="text-[11px] font-medium">Check-in hôm nay</span>
              <LogIn className="w-4 h-4 text-[#111111]" />
            </div>
            <div>
              <span className="text-2xl font-semibold text-[#111111] tracking-tight">
                {kpis.today_checkins_count}
              </span>
              <p className="text-[10px] text-[#9E9EA0] mt-0.5">Lịch đón khách</p>
            </div>
          </div>

          {/* Card 3: Today Check-outs */}
          <div className="bg-white border border-[#E5E5E5] p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[#707072] mb-2">
              <span className="text-[11px] font-medium">Check-out hôm nay</span>
              <LogOut className="w-4 h-4 text-[#111111]" />
            </div>
            <div>
              <span className="text-2xl font-semibold text-[#111111] tracking-tight">
                {kpis.today_checkouts_count}
              </span>
              <p className="text-[10px] text-[#9E9EA0] mt-0.5">Lịch trả phòng</p>
            </div>
          </div>

          {/* Card 4: Occupied */}
          <div className="bg-white border border-[#E5E5E5] p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[#707072] mb-2">
              <span className="text-[11px] font-medium">Phòng Occupied</span>
              <BedDouble className="w-4 h-4 text-[#111111]" />
            </div>
            <div>
              <span className="text-2xl font-semibold text-[#111111] tracking-tight">
                {kpis.occupied_rooms_count}
              </span>
              <p className="text-[10px] text-[#9E9EA0] mt-0.5">
                Trên tổng {kpis.total_rooms_count} phòng
              </p>
            </div>
          </div>

          {/* Card 5: Ready */}
          <div className="bg-white border border-[#E5E5E5] p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[#707072] mb-2">
              <span className="text-[11px] font-medium">Phòng Ready</span>
              <CheckCircle2 className="w-4 h-4 text-[#111111]" />
            </div>
            <div>
              <span className="text-2xl font-semibold text-[#111111] tracking-tight">
                {kpis.ready_rooms_count}
              </span>
              <p className="text-[10px] text-[#9E9EA0] mt-0.5">Sẵn sàng nhận khách</p>
            </div>
          </div>

          {/* Card 6: Pending Tickets */}
          <div className="bg-white border border-[#E5E5E5] p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[#707072] mb-2">
              <span className="text-[11px] font-medium">Ticket chờ xử lý</span>
              <AlertCircle className="w-4 h-4 text-[#111111]" />
            </div>
            <div>
              <span className="text-2xl font-semibold text-[#111111] tracking-tight">
                {kpis.pending_tickets_count}
              </span>
              <p className="text-[10px] text-[#9E9EA0] mt-0.5">Sự cố & yêu cầu</p>
            </div>
          </div>
        </div>
      </div>

      {/* Room Status Summary Section */}
      <div className="bg-white border border-[#E5E5E5] p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-4 border-b border-[#E5E5E5]">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#111111]">
              Trạng thái buồng phòng ({room_summaries.length} phòng niêm yết)
            </h2>
            <p className="text-xs text-[#707072] mt-0.5">
              Phân loại buồng phòng theo trạng thái vận hành thực tế
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#F5F5F5] border border-[#E5E5E5] text-[#111111]">
              <span className="w-2 h-2 rounded-full bg-[#111111]" />
              Ready: <strong>{kpis.ready_rooms_count}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#111111] text-white">
              <span className="w-2 h-2 rounded-full bg-white" />
              Occupied: <strong>{kpis.occupied_rooms_count}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#F5F5F5] border border-[#CCCCCC] text-[#707072]">
              <Sparkles className="w-3 h-3 text-[#111111]" />
              Cleaning: <strong>{kpis.cleaning_rooms_count}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-[#E5E5E5] text-[#707072]">
              <Wrench className="w-3 h-3 text-[#707072]" />
              Maintenance: <strong>{kpis.maintenance_rooms_count}</strong>
            </span>
          </div>
        </div>

        {/* Room Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {room_summaries.map((room) => {
            const statusConfig = {
              ready: {
                label: "Sẵn sàng",
                badgeClass: "bg-white text-[#111111] border border-[#111111]",
              },
              occupied: {
                label: "Có khách",
                badgeClass: "bg-[#111111] text-white border border-[#111111]",
              },
              cleaning: {
                label: "Đang dọn dẹp",
                badgeClass: "bg-[#F5F5F5] text-[#111111] border border-[#CCCCCC]",
              },
              maintenance: {
                label: "Bảo trì",
                badgeClass: "bg-white text-[#707072] border border-[#E5E5E5]",
              },
            }[room.operational_status] || {
              label: room.operational_status,
              badgeClass: "bg-[#F5F5F5] text-[#707072] border border-[#E5E5E5]",
            };

            return (
              <div
                key={room.room_id}
                className="p-3.5 border border-[#E5E5E5] bg-[#FAFAFA] flex items-center justify-between"
              >
                <div>
                  <span className="text-xs font-semibold text-[#111111] block">
                    {room.room_name}
                  </span>
                  <span className="text-[10px] text-[#9E9EA0] mt-0.5 block">
                    {room.updated_at
                      ? `Cập nhật: ${new Date(room.updated_at).toLocaleTimeString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}`
                      : "Trực tiếp"}
                  </span>
                </div>
                <span
                  className={`px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${statusConfig.badgeClass}`}
                >
                  {statusConfig.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Two Column Layout: Recent Bookings & Pending Tickets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Recent Bookings */}
        <div className="bg-white border border-[#E5E5E5] p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#E5E5E5]">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[#111111]">
                Đặt phòng gần đây
              </h2>
              <p className="text-xs text-[#707072] mt-0.5">
                15 giao dịch đặt phòng mới nhất
              </p>
            </div>
            <Link
              href="/operations"
              className="text-xs text-[#707072] hover:text-[#111111] flex items-center gap-1 transition-colors"
            >
              <span>Xem thêm</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {recent_bookings.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#9E9EA0]">
              Chưa có dữ liệu đặt phòng gần đây.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#E5E5E5] text-[10px] uppercase tracking-wider text-[#707072]">
                    <th className="py-2 pr-3">Mã</th>
                    <th className="py-2 px-3">Phòng</th>
                    <th className="py-2 px-3">Khách</th>
                    <th className="py-2 px-3">Nhận/Trả</th>
                    <th className="py-2 px-3">Trạng thái</th>
                    <th className="py-2 pl-3 text-right">Tổng thanh toán</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F5F5F5]">
                  {recent_bookings.map((booking) => (
                    <tr key={booking.id} className="hover:bg-[#FAFAFA] transition-colors">
                      <td className="py-2.5 pr-3 font-mono text-[11px] text-[#707072]">
                        {booking.short_id}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-[#111111]">
                        {booking.room_name}
                      </td>
                      <td className="py-2.5 px-3 text-[#707072]">
                        {booking.guest_name}
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-[#707072] whitespace-nowrap">
                        {booking.check_in || "N/A"} → {booking.check_out || "N/A"}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-block px-1.5 py-0.5 text-[9px] uppercase font-medium tracking-wider ${
                            booking.booking_status === "CONFIRMED"
                              ? "bg-[#111111] text-white"
                              : "bg-[#F5F5F5] text-[#707072] border border-[#E5E5E5]"
                          }`}
                        >
                          {booking.booking_status}
                        </span>
                      </td>
                      <td className="py-2.5 pl-3 text-right font-medium text-[#111111]">
                        {formatVND(booking.final_paid_amount_vnd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right: Pending Tickets */}
        <div className="bg-white border border-[#E5E5E5] p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#E5E5E5]">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[#111111]">
                Yêu cầu & sự cố chờ xử lý
              </h2>
              <p className="text-xs text-[#707072] mt-0.5">
                Các sự cố khách hàng cần bộ phận vận hành tiếp nhận
              </p>
            </div>
            <Link
              href="/operations"
              className="text-xs text-[#707072] hover:text-[#111111] flex items-center gap-1 transition-colors"
            >
              <span>Xem Operations</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {pending_tickets.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#9E9EA0]">
              Hiện không có ticket hoặc sự cố nào đang chờ xử lý.
            </div>
          ) : (
            <div className="space-y-3">
              {pending_tickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="p-3.5 border border-[#E5E5E5] bg-[#FAFAFA] flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-[#111111]">
                        Phòng {ticket.room_name}
                      </span>
                      <span className="px-1.5 py-0.2 text-[9px] uppercase font-mono tracking-wider bg-white border border-[#E5E5E5] text-[#707072]">
                        {ticket.category}
                      </span>
                    </div>
                    <span
                      className={`px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider ${
                        ticket.status === "pending"
                          ? "bg-white text-[#111111] border border-[#111111]"
                          : "bg-[#F5F5F5] text-[#707072] border border-[#CCCCCC]"
                      }`}
                    >
                      {ticket.status === "pending" ? "Chờ xử lý" : "Đang xử lý"}
                    </span>
                  </div>

                  <p className="text-xs text-[#111111] line-clamp-2 leading-relaxed">
                    {ticket.description}
                  </p>

                  <div className="flex items-center justify-between text-[11px] text-[#707072] pt-2 border-t border-[#EAEAEA]">
                    <span>
                      Khách: <strong>{ticket.guest_name}</strong>{" "}
                      {ticket.guest_phone && `(${ticket.guest_phone})`}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] text-[#9E9EA0]">
                      <Clock className="w-3 h-3" />
                      {new Date(ticket.created_at).toLocaleTimeString("vi-VN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
