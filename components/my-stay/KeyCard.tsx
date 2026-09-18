"use client";

import React, { useState } from "react";

interface KeyCardProps {
    roomName: string;
    passcode: string;
    address: string;
    mapUrl?: string;
}

export default function KeyCard({ roomName, passcode, address, mapUrl }: KeyCardProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(passcode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-4">
            <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold text-lg text-gray-800">Thông tin phòng {roomName}</h3>
                <span className="bg-green-100 text-green-700 text-xs px-2.5 py-1 rounded-full font-medium">Đã nhận phòng</span>
            </div>
            <p className="text-sm text-gray-500 mb-4">{address}</p>

            <div className="bg-slate-50 p-4 rounded-xl border border-dashed border-slate-200 text-center mb-4">
                <span className="text-xs text-gray-500 block mb-1">MÃ KHÓA CỬA SỐ</span>
                <div className="text-3xl font-extrabold tracking-widest text-indigo-600 mb-2">{passcode}</div>
                <button
                    onClick={handleCopy}
                    className="text-xs bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg font-medium hover:bg-indigo-100 transition"
                >
                    {copied ? "✓ Đã sao chép mã" : "📋 Sao chép mã cửa"}
                </button>
            </div>

            {mapUrl && (
                <a
                    href={mapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-center w-full py-2.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition"
                >
                    📍 Mở vị trí trên Google Maps
                </a>
            )}
        </div>
    );
}