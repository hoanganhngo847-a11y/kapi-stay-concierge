"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Mail, AlertCircle, Loader2 } from "lucide-react";
import { adminLoginAction } from "@/app/admin/actions";

export default function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryError = searchParams.get("error");

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(() => {
    if (queryError === "forbidden") {
      return "Tài khoản của bạn không có quyền quản trị viên.";
    }
    if (queryError === "session_expired") {
      return "Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.";
    }
    return null;
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setErrorMessage("Vui lòng nhập đầy đủ email và mật khẩu.");
      return;
    }

    setIsLoading(true);

    try {
      const res = await adminLoginAction({
        email: trimmedEmail,
        password,
      });

      if (!res.success) {
        setErrorMessage(res.error || "Email, mật khẩu hoặc quyền truy cập không hợp lệ.");
        setIsLoading(false);
        return;
      }

      // Success: redirect to Admin Portal dashboard
      router.push("/admin");
      router.refresh();
    } catch {
      setErrorMessage("Đã xảy ra lỗi kết nối. Vui lòng thử lại sau.");
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm mx-auto bg-white border border-[#E5E5E5] p-8 sm:p-10 shadow-none">
      <div className="text-center mb-8">
        <div className="w-10 h-10 bg-[#111111] text-white flex items-center justify-center mx-auto mb-3">
          <Lock className="w-4 h-4 text-white" />
        </div>
        <span className="text-[10px] font-semibold tracking-widest uppercase text-[#707072] block mb-1">
          KAPI CONCIERGE
        </span>
        <h1 className="text-xl font-medium text-[#111111] tracking-tight">
          KAPI ADMIN
        </h1>
        <p className="text-xs text-[#707072] mt-1.5 leading-relaxed">
          Cổng thông tin quản trị hệ thống phòng và lưu trú
        </p>
      </div>

      {errorMessage && (
        <div className="mb-6 p-3 bg-[#FAFAFA] border border-[#E5E5E5] flex items-start gap-2.5 text-xs text-[#111111]">
          <AlertCircle className="w-4 h-4 text-[#111111] shrink-0 mt-0.5" />
          <span className="leading-snug">{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label
            htmlFor="admin-email"
            className="block text-xs font-medium text-[#111111] mb-1.5"
          >
            Email quản trị
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#707072]">
              <Mail className="w-3.5 h-3.5" />
            </div>
            <input
              id="admin-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              disabled={isLoading}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@kapistay.internal"
              className="w-full pl-9 pr-3 py-2 text-xs text-[#111111] bg-white border border-[#CCCCCC] rounded-none focus:outline-none focus:border-[#111111] disabled:bg-[#F5F5F5] disabled:cursor-not-allowed transition-colors"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="admin-password"
            className="block text-xs font-medium text-[#111111] mb-1.5"
          >
            Mật khẩu
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#707072]">
              <Lock className="w-3.5 h-3.5" />
            </div>
            <input
              id="admin-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={isLoading}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full pl-9 pr-3 py-2 text-xs text-[#111111] bg-white border border-[#CCCCCC] rounded-none focus:outline-none focus:border-[#111111] disabled:bg-[#F5F5F5] disabled:cursor-not-allowed transition-colors"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-2.5 px-4 bg-[#111111] hover:bg-[#262626] text-white text-xs font-medium tracking-wide uppercase transition-colors disabled:bg-[#9E9EA0] disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Đang xác thực...</span>
            </>
          ) : (
            <span>Đăng nhập quản trị</span>
          )}
        </button>
      </form>

      <div className="mt-8 pt-6 border-t border-[#E5E5E5] text-center">
        <p className="text-[11px] text-[#9E9EA0] leading-relaxed">
          Khu vực bảo mật nội bộ. Mọi hoạt động đăng nhập đều được ghi nhận vào hệ thống.
        </p>
      </div>
    </div>
  );
}
