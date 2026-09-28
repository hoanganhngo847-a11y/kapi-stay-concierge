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

export const KeyCard: React.FC<KeyCardProps> = ({
  roomName,
  passcode,
  address,
  mapUrl,
  stayStatus = "ACTIVE",
  statusLabel,
}) => {
  const displayLabel =
    statusLabel || (stayStatus === "ACTIVE" ? "Đang lưu trú" : "Mã truy cập");

  return (
    <div className="border border-[#E5E5E5] bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="text-[11px] font-medium uppercase tracking-wider text-[#707072] block mb-1">
            Khóa phòng thông minh
          </span>
          <h3 className="font-medium text-lg text-[#111111]">
            {roomName || "Mã truy cập phòng"}
          </h3>
        </div>
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[#111111] text-white">
          {displayLabel}
        </span>
      </div>

      <div className="my-5 p-4 bg-[#F5F5F5] border border-[#E5E5E5] text-center">
        <p className="text-xs font-medium text-[#707072] uppercase tracking-wider mb-1.5">
          Mã số mở cửa (Passcode)
        </p>
        <p className="text-4xl font-mono font-semibold tracking-[0.2em] text-[#111111]">
          {passcode}
        </p>
      </div>

      {address && (
        <div className="text-xs text-[#707072] border-t border-[#E5E5E5] pt-4 mt-4">
          <p className="font-medium text-[#111111] mb-0.5">Địa chỉ:</p>
          <p>{address}</p>
          {mapUrl && (
            <a
              href={mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#111111] underline hover:opacity-80 mt-1.5 inline-block font-medium"
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
