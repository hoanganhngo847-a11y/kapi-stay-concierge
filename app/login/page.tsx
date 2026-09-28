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
    <div className="w-full max-w-md mx-auto py-16 sm:py-24 px-4">
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#707072] hover:text-[#111111] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Về trang chủ</span>
        </Link>
      </div>

      <div className="bg-white border border-[#E5E5E5] p-8 sm:p-10">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-full bg-[#F5F5F5] text-[#111111] flex items-center justify-center mx-auto mb-4">
            <Home className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-medium tracking-widest uppercase text-[#707072] block mb-1">
            KAPI STAY
          </span>
          <h1 className="text-2xl font-normal text-[#111111] tracking-tight">
            Đăng nhập tài khoản
          </h1>
          <p className="text-xs sm:text-sm text-[#707072] mt-2 leading-relaxed">
            Sử dụng Google để tra cứu kỳ nghỉ, nhận phòng 24/7 và hưởng ưu đãi Kapi Rewards.
          </p>
        </div>

        {/* Google OAuth Login Action */}
        <div className="space-y-4">
          <GoogleSignInButton next={safeNext} />
        </div>

        <div className="mt-8 pt-6 border-t border-[#E5E5E5] flex flex-col gap-2.5 text-xs text-[#707072] text-center">
          <div className="flex items-center justify-center gap-1.5 text-[#111111]">
            <ShieldCheck className="w-4 h-4 text-[#707072] shrink-0" />
            <span className="text-xs">Xác thực bảo mật qua Google OAuth</span>
          </div>
          <p className="text-[11px] text-[#9E9EA0] leading-normal">
            Bằng việc tiếp tục, bạn đồng ý với Điều khoản dịch vụ và Chính sách lưu trú của Kapi Stay.
          </p>
        </div>
      </div>
    </div>
  );
}
