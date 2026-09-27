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
      }, 2000);
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
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-dark/10">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl" aria-hidden="true">📶</span>
        <h3 className="font-semibold text-dark">Kết nối Wi-Fi</h3>
      </div>

      <div className="space-y-2 text-sm bg-dark/2 p-3.5 rounded-xl border border-dark/5">
        <div className="flex justify-between items-center">
          <span className="text-dark/60">Tên mạng (SSID):</span>
          <span className="font-medium text-dark select-all">{ssid}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-dark/60">Mật khẩu:</span>
          <span className="font-mono text-dark select-all">{password}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleCopy}
        className="w-full mt-3 py-2.5 bg-primary hover:bg-primary-600 text-white rounded-xl text-sm font-medium transition-colors"
      >
        {copied ? "✓ Đã sao chép mật khẩu" : "Sao chép mật khẩu Wi-Fi"}
      </button>

      {copyError && (
        <p className="text-xs text-rose-600 mt-2 text-center" role="alert">
          {copyError}
        </p>
      )}
    </div>
  );
}