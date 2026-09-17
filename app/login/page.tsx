import * as React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Home, ShieldCheck, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSafeRedirectUrl } from "@/lib/auth/redirect";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

interface LoginPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export const metadata = {
  title: "Đăng nhập | Kapi Stay Concierge",
  description: "Đăng nhập tài khoản Google để trải nghiệm kỳ nghỉ tự phục vụ 24/7 tại Kapi House.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedParams = await searchParams;
  const rawNext = typeof resolvedParams.next === "string" ? resolvedParams.next : undefined;
  const safeNext = getSafeRedirectUrl(rawNext, "/");

  // If already authenticated, redirect immediately to safe target
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (!error && Boolean(data?.claims?.sub)) {
    redirect(safeNext);
  }

  return (
    <div className="w-full max-w-md mx-auto py-12 sm:py-20 px-4">
      <div className="mb-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-dark/60 hover:text-primary transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Về trang chủ</span>
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-dark/10 shadow-sm p-6 sm:p-8">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary text-white flex items-center justify-center mx-auto mb-4 shadow-sm">
            <Home className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-dark tracking-tight">
            Đăng nhập Kapi House
          </h1>
          <p className="text-sm text-dark/60 mt-1.5 leading-relaxed">
            Sử dụng tài khoản Google để tra cứu kỳ nghỉ, truy cập phòng và nhận ưu đãi thành viên.
          </p>
        </div>

        {/* Google OAuth Login Action */}
        <div className="space-y-4">
          <GoogleSignInButton next={safeNext} />
        </div>

        <div className="mt-8 pt-6 border-t border-dark/10 flex flex-col gap-2.5 text-xs text-dark/50 text-center">
          <div className="flex items-center justify-center gap-1.5 text-dark/60">
            <ShieldCheck className="w-4 h-4 text-secondary shrink-0" />
            <span>Đăng nhập an toàn qua Google OAuth</span>
          </div>
          <p className="text-[11px] text-dark/40 leading-normal">
            Bằng việc tiếp tục, bạn đồng ý với Điều khoản dịch vụ và Chính sách bảo mật của Kapi House.
          </p>
        </div>
      </div>
    </div>
  );
}
