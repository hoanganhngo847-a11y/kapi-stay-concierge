"use client";

import React, { useState, useRef, useEffect } from "react";

interface WifiWidgetProps {
  ssid: string;
  password: string;
}

export default function WifiWidget({ ssid, password }: WifiWidgetProps) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    try {
      if (!navigator?.clipboard?.writeText) {
        throw new Error("Clipboard API not available");
      }
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setCopyError(null);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch {
      setCopied(false);
      setCopyError("Không thể sao chép tự động. Vui lòng sao chép thủ công.");
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setCopyError(null);
      }, 3000);
    }
  };

  return (
    <div className="bg-white p-6 border border-[#E5E5E5]">
      <div className="mb-4">
        <span className="text-[11px] font-medium uppercase tracking-wider text-[#707072] block mb-1">
          Tiện ích kết nối
        </span>
        <h3 className="font-medium text-lg text-[#111111]">Kết nối Wi-Fi phòng</h3>
      </div>

      <div className="space-y-3 text-xs sm:text-sm bg-[#F5F5F5] p-4 border border-[#E5E5E5]">
        <div className="flex justify-between items-center">
          <span className="text-[#707072]">Tên mạng (SSID):</span>
          <span className="font-medium text-[#111111] select-all">{ssid}</span>
        </div>
        <div className="flex justify-between items-center border-t border-[#E5E5E5] pt-2">
          <span className="text-[#707072]">Mật khẩu:</span>
          <span className="font-mono font-medium text-[#111111] select-all">{password}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleCopy}
        className="w-full mt-4 py-3 bg-[#111111] hover:bg-[#2A2A2A] text-white rounded-full text-xs sm:text-sm font-medium transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
      >
        <span className="inline-block transition-transform duration-200">
          {copied ? "✓ Đã sao chép mật khẩu" : "Sao chép mật khẩu Wi-Fi"}
        </span>
      </button>

      {copyError && (
        <p className="text-xs text-rose-600 mt-2 text-center" role="alert">
          {copyError}
        </p>
      )}
    </div>
  );
}