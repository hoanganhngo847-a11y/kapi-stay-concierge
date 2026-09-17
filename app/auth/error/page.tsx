import * as React from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface AuthErrorPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export const metadata = {
  title: "Lỗi đăng nhập | Kapi Stay Concierge",
  description: "Không thể hoàn tất đăng nhập vào Kapi House.",
};

const ERROR_MESSAGES: Record<string, string> = {
  missing_code: "Không tìm thấy mã xác thực từ Google.",
  code_exchange: "Không thể xác thực phiên đăng nhập với hệ thống.",
  user_fetch: "Không thể lấy thông tin người dùng từ Google.",
  profile_sync: "Không thể đồng bộ hồ sơ người dùng.",
};

export default async function AuthErrorPage({ searchParams }: AuthErrorPageProps) {
  const resolvedParams = await searchParams;
  const reason = typeof resolvedParams.reason === "string" ? resolvedParams.reason : "";
  const detail = ERROR_MESSAGES[reason] || "Đã xảy ra sự cố trong quá trình xác thực tài khoản.";

  return (
    <div className="w-full max-w-md mx-auto py-12 sm:py-20 px-4">
      <div className="bg-white rounded-2xl border border-dark/10 shadow-sm p-6 sm:p-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 border border-red-200 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-6 h-6" />
        </div>

        <h1 className="text-xl font-bold text-dark mb-2">
          Không thể hoàn tất đăng nhập
        </h1>

        <p className="text-sm text-dark/60 mb-6 leading-relaxed">
          {detail} Vui lòng thử lại hoặc liên hệ hỗ trợ nếu sự cố vẫn tiếp diễn.
        </p>

        <div className="flex flex-col gap-2.5">
          <Link href="/login">
            <Button className="w-full justify-center" leftIcon={<RefreshCw className="w-4 h-4" />}>
              Thử đăng nhập lại
            </Button>
          </Link>

          <Link href="/">
            <Button
              variant="outline"
              className="w-full justify-center text-dark/70"
              leftIcon={<ArrowLeft className="w-4 h-4" />}
            >
              Về trang chủ
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
