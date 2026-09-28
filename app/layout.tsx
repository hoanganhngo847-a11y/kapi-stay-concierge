import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Phone, ShieldCheck } from "lucide-react";
import { Header } from "@/components/ui/Header";
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
      <body className="min-h-full flex flex-col bg-white text-[#111111] font-sans selection:bg-[#111111] selection:text-white">
        {/* Header */}
        <Header authSlot={<AuthNav />} />

        {/* Main Content */}
        <main className="flex-1">{children}</main>

        {/* Footer */}
        <footer className="w-full bg-white border-t border-[#E5E5E5] py-12 mt-auto">
          <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
            <div className="flex flex-col gap-1.5">
              <span className="font-semibold text-sm tracking-tight text-[#111111]">
                KAPI STAY
              </span>
              <p className="text-xs text-[#707072]">
                Không gian riêng. Theo giờ của bạn. Tự nhận phòng 24/7.
              </p>
              <p className="text-[11px] text-[#9E9EA0] mt-1">
                © {new Date().getFullYear()} Kapi Stay Concierge. Tất cả quyền được bảo lưu.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4 text-xs text-[#707072]">
              <a
                href="tel:0988123456"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#E5E5E5] text-[#111111] hover:bg-[#F5F5F5] transition-colors"
              >
                <Phone className="w-3.5 h-3.5 text-[#111111]" />
                <span>Hỗ trợ 24/7: <strong>0988.123.456</strong></span>
              </a>
              <div className="flex items-center gap-1.5 text-[#707072]">
                <ShieldCheck className="w-4 h-4 text-[#111111]" />
                <span>Tự động • An toàn • Bảo mật</span>
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
