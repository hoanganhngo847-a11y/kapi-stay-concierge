"use client";

import React, { useState } from "react";

interface WifiWidgetProps {
    ssid: string;
    password: string;
}

export default function WifiWidget({ ssid, password }: WifiWidgetProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(password);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-4">
            <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">📶</span>
                <h3 className="font-semibold text-gray-800">Kết nối Wi-Fi</h3>
            </div>

            <div className="space-y-2 text-sm bg-slate-50 p-3.5 rounded-xl">
                <div className="flex justify-between">
                    <span className="text-gray-500">Tên mạng:</span>
                    <span className="font-medium text-gray-800">{ssid}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-gray-500">Mật khẩu:</span>
                    <span className="font-mono text-gray-800">{password}</span>
                </div>
            </div>

            <button
                onClick={handleCopy}
                className="w-full mt-3 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition"
            >
                {copied ? "✓ Đã sao chép mật khẩu" : "Sao chép mật khẩu Wi-Fi"}
            </button>
        </div>
    );
}