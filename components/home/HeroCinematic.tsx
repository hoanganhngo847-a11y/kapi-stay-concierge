"use client";

import React, { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const VIDEO_SRC =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260815_034306_165449ef-7d2e-4e81-850f-1939c5cb442d.mp4";

export function HeroCinematic() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Respect prefers-reduced-motion
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    if (mediaQuery.matches && videoRef.current) {
      videoRef.current.pause();
    }

    const handleMotionChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        videoRef.current?.pause();
      } else {
        videoRef.current?.play().catch(() => {});
      }
    };

    mediaQuery.addEventListener("change", handleMotionChange);
    return () => mediaQuery.removeEventListener("change", handleMotionChange);
  }, []);

  const handleVideoReady = () => {
    setIsLoaded(true);
  };

  return (
    <section className="relative w-full -mt-17 pt-17 min-h-[75svh] sm:min-h-[85svh] lg:min-h-[90vh] flex items-end overflow-hidden bg-[#F5F6FA]">
      {/* Cinematic Background Video Layer */}
      <div className="absolute inset-0 z-0 overflow-hidden bg-[#F5F6FA]" aria-hidden="true">
        <video
          ref={videoRef}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
          tabIndex={-1}
          onCanPlay={handleVideoReady}
          onLoadedData={handleVideoReady}
          onError={() => setIsLoaded(false)}
          className={cn(
            "absolute inset-0 w-full h-full object-cover object-center pointer-events-none select-none",
            "transition-opacity duration-650 ease-[cubic-bezier(0.16,1,0.3,1)]",
            isLoaded ? "opacity-100" : "opacity-0"
          )}
          src={VIDEO_SRC}
        />
        {/* Neutral readability layer: extremely subtle solid tint, no gradient */}
        <div className="absolute inset-0 bg-white/[0.12] pointer-events-none" />
      </div>

      {/* Hero Content */}
      <div className="relative z-10 w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pb-16 sm:pb-24 text-[#111111]">
        <p
          className="text-xs sm:text-sm font-medium tracking-[0.25em] uppercase text-[#707072] mb-3 animate-hero-headline"
          style={{ animationDelay: "0ms" }}
        >
          KAPI STAY
        </p>
        <h1
          className="text-[clamp(36px,5.5vw,76px)] font-normal tracking-tight leading-[1.02] text-[#111111] max-w-3xl mb-4 animate-hero-headline"
          style={{ animationDelay: "60ms" }}
        >
          Không gian riêng.
          <br />
          Theo giờ của bạn.
        </h1>
        <p
          className="text-sm sm:text-base lg:text-lg text-[#555555] max-w-xl font-normal leading-relaxed mb-8 animate-hero-headline"
          style={{ animationDelay: "120ms" }}
        >
          Đặt phòng linh hoạt • Tự check-in 24/7
        </p>

        <div
          className="animate-hero-headline"
          style={{ animationDelay: "220ms" }}
        >
          <Link
            href="#search"
            className="group inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-[#111111] text-white hover:bg-[#2A2A2A] font-medium text-sm sm:text-base transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
          >
            <span>Tìm phòng</span>
            <ArrowRight className="w-4 h-4 transition-transform duration-200 ease-out group-hover:translate-x-[3px]" />
          </Link>
        </div>
      </div>
    </section>
  );
}

export default HeroCinematic;
