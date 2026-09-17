import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function RoomDetailLoading() {
  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      {/* Back button */}
      <Link
        href="/rooms"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-dark/60 hover:text-primary mb-6 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Xem tất cả phòng</span>
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
        {/* Main Content Skeleton */}
        <div className="lg:col-span-2 space-y-6">
          <div className="h-9 w-3/4 bg-dark/10 rounded-lg animate-pulse" />
          <div className="h-5 w-1/2 bg-dark/5 rounded animate-pulse" />
          <div className="h-80 sm:h-96 w-full bg-dark/5 rounded-2xl animate-pulse" />
          <div className="space-y-3 pt-4">
            <div className="h-6 w-32 bg-dark/10 rounded animate-pulse" />
            <div className="h-4 w-full bg-dark/5 rounded animate-pulse" />
            <div className="h-4 w-5/6 bg-dark/5 rounded animate-pulse" />
          </div>
          <div className="space-y-3 pt-4">
            <div className="h-6 w-32 bg-dark/10 rounded animate-pulse" />
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 bg-dark/5 rounded-xl animate-pulse" />
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar Skeleton */}
        <div className="lg:col-span-1">
          <div className="h-96 w-full bg-white border border-dark/10 rounded-2xl p-6 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
