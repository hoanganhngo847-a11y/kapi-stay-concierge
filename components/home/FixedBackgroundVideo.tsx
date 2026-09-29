"use client";

import React, { useRef, useEffect } from "react";

const VIDEO_SRC =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260815_034306_165449ef-7d2e-4e81-850f-1939c5cb442d.mp4";

export function FixedBackgroundVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Ensure DOM property `muted` is true for browser autoplay policy compliance
    video.muted = true;
    video.defaultMuted = true;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!mediaQuery.matches) {
      video.play().catch((err) => {
        console.warn("Background video autoplay prevented:", err);
      });
    }

    const handleMotionChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        video.pause();
      } else {
        video.play().catch(() => {});
      }
    };

    mediaQuery.addEventListener("change", handleMotionChange);
    return () => mediaQuery.removeEventListener("change", handleMotionChange);
  }, []);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-0 w-screen h-screen overflow-hidden pointer-events-none select-none bg-[#111111]"
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
        tabIndex={-1}
        className="w-full h-full object-cover object-center pointer-events-none"
        src={VIDEO_SRC}
      />
    </div>
  );
}

export default FixedBackgroundVideo;
