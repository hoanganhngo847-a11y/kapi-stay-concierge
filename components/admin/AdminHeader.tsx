import * as React from "react";
import Link from "next/link";
import { User, ExternalLink, LogOut, Shield } from "lucide-react";
import { adminSignOutAction } from "@/app/admin/actions";

interface AdminHeaderProps {
  adminEmail?: string;
}

export function AdminHeader({ adminEmail }: AdminHeaderProps) {
  return (
    <header className="bg-white border-b border-[#E5E5E5] sticky top-0 z-40">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left: Branding */}
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="flex items-center gap-2 group focus:outline-none"
            >
              <div className="w-8 h-8 bg-[#111111] text-white flex items-center justify-center font-bold text-xs tracking-wider">
                K
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-sm tracking-tight text-[#111111]">
                  KAPI ADMIN
                </span>
                <span className="text-[10px] uppercase tracking-widest text-[#707072]">
                  Cổng Quản Trị Hệ Thống
                </span>
              </div>
            </Link>
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-wider font-medium bg-[#F5F5F5] text-[#111111] border border-[#E5E5E5]">
              <Shield className="w-3 h-3 text-[#111111]" />
              Role: Admin
            </span>
          </div>

          {/* Right: User Greeting & Actions */}
          <div className="flex items-center gap-3 sm:gap-4">
            {adminEmail && (
              <div className="hidden md:flex items-center gap-1.5 text-xs text-[#707072]">
                <User className="w-3.5 h-3.5 text-[#111111]" />
                <span>
                  Xin chào{" "}
                  <strong className="font-medium text-[#111111]">
                    {adminEmail}
                  </strong>
                </span>
              </div>
            )}

            <Link
              href="/operations"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#111111] bg-white border border-[#CCCCCC] hover:border-[#111111] hover:bg-[#F9F9F9] transition-colors"
            >
              <span>Mở Operations</span>
              <ExternalLink className="w-3 h-3 text-[#707072]" />
            </Link>

            <form action={adminSignOutAction}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#111111] hover:bg-[#262626] transition-colors uppercase tracking-wider"
              >
                <LogOut className="w-3 h-3" />
                <span>Đăng xuất</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </header>
  );
}
