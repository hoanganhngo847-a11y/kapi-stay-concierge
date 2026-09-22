"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  React.useEffect(() => {
    // Log error to console for debugging without exposing technical details to user
    console.error("RoomDetailPage error boundary caught an error:", error);
  }, [error]);

  return (
    <div className="w-full max-w-lg mx-auto py-16 sm:py-24 px-4 text-center">
      <div
        role="alert"
        aria-labelledby="error-title"
        className="bg-white rounded-2xl border border-dark/10 shadow-sm p-8 sm:p-10"
      >
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-7 h-7" aria-hidden="true" />
        </div>

        <h1 id="error-title" className="text-2xl font-bold text-dark mb-2">
          Đã xảy ra sự cố khi tải thông tin phòng
        </h1>

        <p className="text-sm text-dark/60 mb-6 leading-relaxed">
          Không thể tải thông tin phòng lúc này. Vui lòng thử lại hoặc quay về danh sách phòng.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button
            type="button"
            onClick={() => reset()}
            leftIcon={<RefreshCw className="w-4 h-4" aria-hidden="true" />}
          >
            Thử lại
          </Button>

          <Link href="/rooms" className="w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              leftIcon={<ArrowLeft className="w-4 h-4" aria-hidden="true" />}
            >
              Xem danh sách phòng khác
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
