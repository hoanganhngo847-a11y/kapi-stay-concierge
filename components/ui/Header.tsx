"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface HeaderProps {
  authSlot?: React.ReactNode;
}

export function Header({ authSlot }: HeaderProps) {
  const pathname = usePathname();
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { href: "/rooms", label: "Phòng", isActive: pathname.startsWith("/rooms") },
    { href: "/#locations", label: "Chi nhánh", isActive: false },
    { href: "/rewards", label: "Kapi Rewards", isActive: pathname.startsWith("/rewards") },
    { href: "/my-stay", label: "My Stay", isActive: pathname.startsWith("/my-stay") },
  ];

  return (
    <header
      className={`sticky top-0 z-40 w-full bg-white/95 backdrop-blur-[2px] transition-colors duration-300 animate-header-entrance ${
        isScrolled ? "border-b border-[#E5E5E5]" : "border-b border-transparent"
      }`}
    >
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 h-17 flex items-center justify-between">
        {/* Logo KAPI STAY */}
        <Link
          href="/"
          className="flex items-center gap-2 transition-opacity hover:opacity-80 select-none"
        >
          <span className="font-semibold text-lg sm:text-xl tracking-tight text-[#111111]">
            KAPI STAY
          </span>
        </Link>

        {/* Navigation Links */}
        <nav className="flex items-center gap-1 sm:gap-2">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`relative px-2.5 sm:px-3.5 py-1.5 text-xs sm:text-sm font-medium transition-opacity duration-200 after:content-[''] after:absolute after:bottom-0.5 after:left-2.5 after:right-2.5 after:h-[1.5px] after:bg-[#111111] after:transition-transform after:duration-[220ms] after:ease-[cubic-bezier(0.16,1,0.3,1)] after:origin-left ${
                link.isActive
                  ? "text-[#111111] opacity-100 after:scale-x-100"
                  : "text-[#111111] opacity-65 hover:opacity-100 after:scale-x-0 hover:after:scale-x-100"
              }`}
            >
              {link.label}
            </Link>
          ))}

          <Link
            href="/operations"
            className="hidden lg:inline-block px-3 py-1.5 text-xs font-medium text-[#9E9EA0] hover:text-[#111111] transition-colors"
          >
            Vận hành
          </Link>

          {authSlot && <div className="ml-1 sm:ml-2">{authSlot}</div>}
        </nav>
      </div>
    </header>
  );
}

export default Header;
