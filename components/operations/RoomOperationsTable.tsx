"use client";

import * as React from "react";
import {
  Sparkles,
  DoorClosed,
  DoorOpen,
  Wrench,
  Search,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

export type OperationalStatus = "ready" | "occupied" | "cleaning" | "maintenance";

export interface RoomOperationItem {
  id: string;
  name: string;
  propertyName: string;
  capacity: number;
  operationalStatus: OperationalStatus;
  lastCleanedAt?: string;
  currentGuestName?: string;
  nextCheckInTime?: string;
  notes?: string;
}

export interface RoomOperationsTableProps {
  rooms: RoomOperationItem[];
  onStatusChange?: (roomId: string, newStatus: OperationalStatus) => void;
  className?: string;
}

export function RoomOperationsTable({
  rooms,
  onStatusChange,
  className,
}: RoomOperationsTableProps) {
  const [searchTerm, setSearchTerm] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");

  const filteredRooms = React.useMemo(() => {
    return rooms.filter((room) => {
      const matchSearch =
        room.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        room.propertyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (room.currentGuestName &&
          room.currentGuestName.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchStatus =
        statusFilter === "all" || room.operationalStatus === statusFilter;

      return matchSearch && matchStatus;
    });
  }, [rooms, searchTerm, statusFilter]);

  const getStatusBadge = (status: OperationalStatus) => {
    switch (status) {
      case "ready":
        return (
          <Badge variant="success" size="sm" icon={<CheckCircle2 className="w-3 h-3" />}>
            Sẵn sàng đón khách
          </Badge>
        );
      case "occupied":
        return (
          <Badge variant="primary" size="sm" icon={<DoorClosed className="w-3 h-3" />}>
            Đang có khách
          </Badge>
        );
      case "cleaning":
        return (
          <Badge variant="warning" size="sm" icon={<Sparkles className="w-3 h-3" />}>
            Cần dọn dẹp
          </Badge>
        );
      case "maintenance":
        return (
          <Badge variant="danger" size="sm" icon={<Wrench className="w-3 h-3" />}>
            Bảo trì / Sửa chữa
          </Badge>
        );
      default:
        return <Badge variant="neutral" size="sm">{status}</Badge>;
    }
  };

  return (
    <div className={cn("bg-white rounded-2xl border border-dark/10 shadow-2xs overflow-hidden", className)}>
      {/* Table Toolbar */}
      <div className="p-4 sm:p-6 border-b border-dark/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-dark">
            Danh sách phòng & Trạng thái buồng phòng
          </h2>
          <p className="text-xs text-dark/60 mt-0.5">
            Cập nhật trạng thái trực tiếp để đồng bộ với điều phối khách và lễ tân tự động.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Input
              placeholder="Tìm theo tên phòng, khách..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9 text-xs"
              startIcon={<Search className="w-4 h-4" />}
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: "all", label: "Tất cả" },
              { id: "ready", label: "Sẵn sàng" },
              { id: "occupied", label: "Có khách" },
              { id: "cleaning", label: "Cần dọn" },
              { id: "maintenance", label: "Bảo trì" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded-lg whitespace-nowrap transition-colors",
                  statusFilter === tab.id
                    ? "bg-dark text-white shadow-2xs"
                    : "text-dark/70 hover:text-dark hover:bg-dark/5"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="bg-light/40 border-b border-dark/10 text-dark/60 text-xs font-semibold uppercase tracking-wider">
              <th className="py-3.5 px-4 sm:px-6">Phòng & Cơ sở</th>
              <th className="py-3.5 px-4 sm:px-6">Trạng thái hiện tại</th>
              <th className="py-3.5 px-4 sm:px-6 hidden md:table-cell">Khách lưu trú</th>
              <th className="py-3.5 px-4 sm:px-6 hidden lg:table-cell">Lần dọn gần nhất</th>
              <th className="py-3.5 px-4 sm:px-6 text-right">Thao tác nhanh</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dark/10">
            {filteredRooms.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 px-4 text-center">
                  <div className="w-12 h-12 rounded-xl bg-dark/5 text-dark/40 flex items-center justify-center mx-auto mb-3">
                    <DoorOpen className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-semibold text-dark">
                    Không tìm thấy phòng phù hợp
                  </p>
                  <p className="text-xs text-dark/50 mt-1">
                    Thử đổi từ khóa tìm kiếm hoặc chọn bộ lọc trạng thái khác.
                  </p>
                </td>
              </tr>
            ) : (
              filteredRooms.map((room) => (
                <tr
                  key={room.id}
                  className="hover:bg-light/30 transition-colors group"
                >
                  {/* Room Info */}
                  <td className="py-4 px-4 sm:px-6">
                    <div className="font-bold text-dark text-sm sm:text-base group-hover:text-primary transition-colors">
                      {room.name}
                    </div>
                    <div className="text-xs text-dark/60 mt-0.5 flex items-center gap-2">
                      <span>{room.propertyName}</span>
                      <span>•</span>
                      <span>Sức chứa: {room.capacity} người</span>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="py-4 px-4 sm:px-6">
                    {getStatusBadge(room.operationalStatus)}
                    {room.notes && (
                      <p className="text-[11px] text-dark/50 mt-1 italic">
                        {room.notes}
                      </p>
                    )}
                  </td>

                  {/* Guest Info */}
                  <td className="py-4 px-4 sm:px-6 hidden md:table-cell">
                    {room.currentGuestName ? (
                      <div>
                        <span className="font-medium text-dark block">
                          {room.currentGuestName}
                        </span>
                        {room.nextCheckInTime && (
                          <span className="text-xs text-dark/50 block">
                            Dự kiến trả: {room.nextCheckInTime}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-dark/40">Không có khách</span>
                    )}
                  </td>

                  {/* Cleaning Info */}
                  <td className="py-4 px-4 sm:px-6 hidden lg:table-cell text-xs text-dark/60">
                    {room.lastCleanedAt ? room.lastCleanedAt : "Chưa ghi nhận"}
                  </td>

                  {/* Action Buttons */}
                  <td className="py-4 px-4 sm:px-6 text-right">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      {room.operationalStatus === "cleaning" && (
                        <Button
                          size="sm"
                          variant="primary"
                          leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                          onClick={() => onStatusChange?.(room.id, "ready")}
                        >
                          Đã dọn xong
                        </Button>
                      )}

                      {room.operationalStatus === "ready" && (
                        <Button
                          size="sm"
                          variant="outline"
                          leftIcon={<Sparkles className="w-3.5 h-3.5" />}
                          onClick={() => onStatusChange?.(room.id, "cleaning")}
                        >
                          Báo dọn dẹp
                        </Button>
                      )}

                      {room.operationalStatus === "occupied" && (
                        <Button
                          size="sm"
                          variant="outline"
                          leftIcon={<Sparkles className="w-3.5 h-3.5" />}
                          onClick={() => onStatusChange?.(room.id, "cleaning")}
                        >
                          Khách trả phòng
                        </Button>
                      )}

                      {room.operationalStatus === "maintenance" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                          onClick={() => onStatusChange?.(room.id, "ready")}
                        >
                          Đã sửa xong
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                          onClick={() => onStatusChange?.(room.id, "maintenance")}
                        >
                          Bảo trì
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default RoomOperationsTable;
