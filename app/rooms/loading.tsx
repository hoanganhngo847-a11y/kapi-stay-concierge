import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function RoomsLoading() {
  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-dark/60 hover:text-primary mb-2 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Quay lại trang chủ</span>
          </Link>
          <div className="h-8 w-64 bg-dark/10 rounded-lg animate-pulse mb-2" />
          <div className="h-4 w-96 max-w-full bg-dark/5 rounded animate-pulse" />
        </div>
      </div>

      {/* Grid Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-white rounded-2xl border border-dark/10 overflow-hidden shadow-sm flex flex-col"
          >
            <div className="h-52 bg-dark/5 animate-pulse" />
            <div className="p-6 flex flex-col flex-1 gap-4">
              <div className="h-4 w-28 bg-dark/10 rounded animate-pulse" />
              <div className="h-6 w-48 bg-dark/10 rounded animate-pulse" />
              <div className="space-y-2 flex-1">
                <div className="h-3 w-full bg-dark/5 rounded animate-pulse" />
                <div className="h-3 w-3/4 bg-dark/5 rounded animate-pulse" />
                <div className="h-3 w-1/2 bg-dark/5 rounded animate-pulse" />
              </div>
              <div className="pt-4 border-t border-dark/10 flex items-center justify-between">
                <div className="h-6 w-24 bg-dark/10 rounded animate-pulse" />
                <div className="h-8 w-24 bg-dark/10 rounded-lg animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
