import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { Home, Phone, ShieldCheck } from "lucide-react";
import { AuthNav } from "@/components/auth/AuthNav";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kapi Stay Concierge | Homestay Tự Phục Vụ 24/7",
  description:
    "Trải nghiệm homestay tự check-in 24/7 thông minh không lễ tân tại Kapi House. Ấm cúng, an toàn và riêng tư tuyệt đối.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-white text-dark font-sans selection:bg-primary/20 selection:text-primary-900">
        {/* Header */}
        <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-dark/10 shadow-2xs">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            {/* Logo Kapi House */}
            <Link
              href="/"
              className="flex items-center gap-2.5 group transition-transform active:scale-95"
            >
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white shadow-sm group-hover:bg-primary-600 transition-colors">
                <Home className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-lg leading-tight text-dark tracking-tight">
                  Kapi House
                </span>
                <span className="text-[11px] font-medium text-dark/50 tracking-wider uppercase">
                  Stay Concierge
                </span>
              </div>
            </Link>

            {/* Navigation Links */}
            <nav className="flex items-center gap-2 sm:gap-3">
              <Link
                href="/rooms"
                className="px-3 py-1.5 text-sm font-medium text-dark/80 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"
              >
                Xem phòng
              </Link>
              <Link
                href="/my-stay"
                className="px-3 py-1.5 text-sm font-medium text-dark/80 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"
              >
                Kỳ nghỉ của tôi
              </Link>
              <Link
                href="/admin/dashboard"
                className="hidden md:inline-block px-3 py-1.5 text-sm font-medium text-dark/60 hover:text-dark hover:bg-dark/5 rounded-lg transition-colors"
              >
                Dành cho Quản lý
              </Link>
              <AuthNav />
            </nav>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1">{children}</main>

        {/* Footer */}
        <footer className="w-full bg-light/50 border-t border-dark/10 py-8 sm:py-10 mt-auto">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-center md:justify-start gap-2 text-dark font-semibold text-base">
                <Home className="w-4 h-4 text-primary" />
                <span>Kapi House – Homestay Tự Phục Vụ 24/7</span>
              </div>
              <p className="text-xs text-dark/60">
                © {new Date().getFullYear()} Kapi House (Kapi Stay Concierge). Tất cả quyền được bảo lưu.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-5 text-xs font-medium text-dark/80">
              <a
                href="tel:0988123456"
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-dark/10 hover:border-primary hover:text-primary transition-colors shadow-2xs"
              >
                <Phone className="w-3.5 h-3.5 text-primary" />
                <span>Hotline 24/7: <strong>0988.123.456</strong></span>
              </a>
              <div className="flex items-center gap-1.5 text-dark/50">
                <ShieldCheck className="w-4 h-4 text-secondary" />
                <span>Tự động • An toàn • Bảo mật</span>
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
