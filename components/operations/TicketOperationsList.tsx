"use client";

import * as React from "react";
import {
  AlertCircle,
  Clock,
  CheckCircle2,
  LifeBuoy,
  MessageSquare,
  Sparkles,
  Wrench,
  PackageCheck,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

export type TicketStatus = "pending" | "in_progress" | "resolved";

export interface OperationTicket {
  id: string;
  roomName: string;
  guestName: string;
  category: "cleaning" | "amenity" | "maintenance" | "other";
  description: string;
  status: TicketStatus;
  createdAt: string;
  updatedAt?: string;
  priority?: "normal" | "urgent";
}

export interface TicketOperationsListProps {
  tickets: OperationTicket[];
  onStatusChange?: (ticketId: string, newStatus: TicketStatus) => void;
  className?: string;
}

export function TicketOperationsList({
  tickets,
  onStatusChange,
  className,
}: TicketOperationsListProps) {
  const [activeTab, setActiveTab] = React.useState<string>("all");

  const filteredTickets = React.useMemo(() => {
    if (activeTab === "all") return tickets;
    return tickets.filter((t) => t.status === activeTab);
  }, [tickets, activeTab]);

  const getCategoryIcon = (cat: OperationTicket["category"]) => {
    switch (cat) {
      case "cleaning":
        return <Sparkles className="w-3.5 h-3.5 text-amber-600" />;
      case "maintenance":
        return <Wrench className="w-3.5 h-3.5 text-rose-600" />;
      case "amenity":
        return <PackageCheck className="w-3.5 h-3.5 text-blue-600" />;
      default:
        return <MessageSquare className="w-3.5 h-3.5 text-dark/60" />;
    }
  };

  const getCategoryLabel = (cat: OperationTicket["category"]) => {
    switch (cat) {
      case "cleaning":
        return "Yêu cầu dọn dẹp";
      case "maintenance":
        return "Sự cố kỹ thuật";
      case "amenity":
        return "Bổ sung đồ dùng";
      default:
        return "Yêu cầu khác";
    }
  };

  const getStatusBadge = (status: TicketStatus) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="warning" size="sm" icon={<AlertCircle className="w-3 h-3" />}>
            Chờ tiếp nhận
          </Badge>
        );
      case "in_progress":
        return (
          <Badge variant="primary" size="sm" icon={<Clock className="w-3 h-3" />}>
            Đang xử lý
          </Badge>
        );
      case "resolved":
        return (
          <Badge variant="success" size="sm" icon={<CheckCircle2 className="w-3 h-3" />}>
            Đã giải quyết
          </Badge>
        );
      default:
        return <Badge variant="neutral" size="sm">{status}</Badge>;
    }
  };

  return (
    <div className={cn("bg-white rounded-2xl border border-dark/10 shadow-2xs overflow-hidden", className)}>
      {/* Header & Tabs */}
      <div className="p-4 sm:p-6 border-b border-dark/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-dark flex items-center gap-2">
            <LifeBuoy className="w-5 h-5 text-primary" />
            <span>Yêu cầu hỗ trợ & Báo cáo sự cố từ khách</span>
          </h2>
          <p className="text-xs text-dark/60 mt-0.5">
            Tiếp nhận và xử lý nhanh chóng các sự cố phát sinh trong kỳ nghỉ của khách lưu trú.
          </p>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: "all", label: `Tất cả (${tickets.length})` },
            {
              id: "pending",
              label: `Chờ xử lý (${tickets.filter((t) => t.status === "pending").length})`,
            },
            {
              id: "in_progress",
              label: `Đang xử lý (${tickets.filter((t) => t.status === "in_progress").length})`,
            },
            {
              id: "resolved",
              label: `Đã xong (${tickets.filter((t) => t.status === "resolved").length})`,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors",
                activeTab === tab.id
                  ? "bg-dark text-white shadow-2xs"
                  : "text-dark/70 hover:text-dark hover:bg-dark/5"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Ticket Items */}
      <div className="divide-y divide-dark/10">
        {filteredTickets.length === 0 ? (
          <div className="py-12 px-4 text-center">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-dark">
              Không có yêu cầu nào trong mục này
            </p>
            <p className="text-xs text-dark/50 mt-1">
              Tất cả các phòng đang vận hành êm đẹp, không có sự cố tồn đọng.
            </p>
          </div>
        ) : (
          filteredTickets.map((ticket) => (
            <div
              key={ticket.id}
              className="p-4 sm:p-6 hover:bg-light/30 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              {/* Ticket details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center flex-wrap gap-2 mb-2">
                  <span className="font-bold text-dark text-base">
                    {ticket.roomName}
                  </span>
                  <span className="text-xs text-dark/40">•</span>
                  <span className="text-xs text-dark/70 font-medium">
                    Khách: {ticket.guestName}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-dark/5 text-dark/70 font-medium">
                    {getCategoryIcon(ticket.category)}
                    <span>{getCategoryLabel(ticket.category)}</span>
                  </span>
                  {ticket.priority === "urgent" && (
                    <Badge variant="danger" size="sm">
                      Khẩn cấp
                    </Badge>
                  )}
                  {getStatusBadge(ticket.status)}
                </div>

                <p className="text-xs sm:text-sm text-dark/80 leading-relaxed font-normal bg-light/50 p-3 rounded-xl border border-dark/5">
                  &ldquo;{ticket.description}&rdquo;
                </p>

                <div className="flex items-center gap-2 text-xs text-dark/50 mt-2">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Gửi lúc: {ticket.createdAt}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 sm:self-center shrink-0">
                {ticket.status === "pending" && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => onStatusChange?.(ticket.id, "in_progress")}
                  >
                    Tiếp nhận xử lý
                  </Button>
                )}

                {ticket.status === "in_progress" && (
                  <Button
                    size="sm"
                    variant="primary"
                    leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                    onClick={() => onStatusChange?.(ticket.id, "resolved")}
                  >
                    Đánh dấu đã xử lý xong
                  </Button>
                )}

                {ticket.status === "resolved" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-dark/50 hover:text-dark"
                    onClick={() => onStatusChange?.(ticket.id, "in_progress")}
                  >
                    Mở lại ticket
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default TicketOperationsList;
