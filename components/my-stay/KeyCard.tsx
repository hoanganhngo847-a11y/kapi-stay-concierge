import React from "react";

export type StayStatus = "ACTIVE" | "UPCOMING" | "COMPLETED" | "CANCELLED";

interface KeyCardProps {
    roomName?: string;
    passcode: string;
    address?: string;
    mapUrl?: string;
    stayStatus?: StayStatus;
    statusLabel?: string;
}

const STATUS_CONFIG: Record<StayStatus, { label: string; className: string }> = {
    ACTIVE: {
        label: "Đang lưu trú",
        className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    },
    UPCOMING: {
        label: "Sắp diễn ra",
        className: "bg-blue-50 text-blue-700 border-blue-200",
    },
    COMPLETED: {
        label: "Đã hoàn thành",
        className: "bg-gray-100 text-gray-600 border-gray-200",
    },
    CANCELLED: {
        label: "Đã hủy",
        className: "bg-rose-50 text-rose-700 border-rose-200",
    },
};

export const KeyCard: React.FC<KeyCardProps> = ({
    roomName,
    passcode,
    address,
    mapUrl,
    stayStatus = "ACTIVE",
    statusLabel,
}) => {
    const currentStatus = STATUS_CONFIG[stayStatus] || STATUS_CONFIG.ACTIVE;
    const displayLabel = statusLabel || currentStatus.label;

    return (
        <div className="rounded-xl border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-lg">{roomName || "Mã truy cập phòng"}</h3>
                <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${currentStatus.className}`}
                >
                    {displayLabel}
                </span>
            </div>

            <div className="mb-4">
                <p className="text-sm text-muted-foreground">Mã mở cửa (Passcode)</p>
                <p className="text-3xl font-mono font-bold tracking-wider text-primary mt-1">
                    {passcode}
                </p>
            </div>

            {address && (
                <div className="text-sm text-muted-foreground border-t pt-3 mt-3">
                    <p className="font-medium text-foreground">Địa chỉ:</p>
                    <p>{address}</p>
                    {mapUrl && (
                        <a
                            href={mapUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary underline hover:opacity-80 mt-1 inline-block"
                        >
                            Xem trên bản đồ
                        </a>
                    )}
                </div>
            )}
        </div>
    );
};

export default KeyCard;
