"use client";

import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

export interface RevealProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  delay?: number; // Delay in milliseconds
  duration?: number; // Duration in milliseconds (default: 700)
  distance?: number; // Distance in pixels (default: 20)
  threshold?: number; // Intersection threshold (default: 0.15)
  className?: string;
  as?: React.ElementType;
}

function subscribeReducedMotion(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  mediaQuery.addEventListener("change", callback);
  return () => mediaQuery.removeEventListener("change", callback);
}

function getReducedMotionSnapshot() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getReducedMotionServerSnapshot() {
  return false;
}

/**
 * Lightweight Scroll Reveal component using IntersectionObserver.
 * Triggers once when scrolled into view and respects prefers-reduced-motion.
 */
export function Reveal({
  children,
  delay = 0,
  duration = 700,
  distance = 20,
  threshold = 0.15,
  className,
  style,
  as: Component = "div",
  ...props
}: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const prefersReducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot
  );

  useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }

    const element = ref.current;
    if (!element) return;

    // Use IntersectionObserver with single trigger
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      {
        threshold,
        rootMargin: "0px 0px -40px 0px",
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [threshold, prefersReducedMotion]);

  const Tag = Component as React.ElementType;

  return (
    <Tag
      ref={ref}
      className={cn(className)}
      style={{
        opacity: isVisible || prefersReducedMotion ? 1 : 0,
        transform: prefersReducedMotion
          ? "none"
          : isVisible
          ? "translateY(0)"
          : `translateY(${distance}px)`,
        transitionProperty: "opacity, transform",
        transitionDuration: prefersReducedMotion ? "0.01ms" : `${duration}ms`,
        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
        transitionDelay: prefersReducedMotion ? "0ms" : `${delay}ms`,
        willChange: isVisible ? "auto" : "opacity, transform",
        ...style,
      }}
      {...props}
    >
      {children}
    </Tag>
  );
}

export default Reveal;
