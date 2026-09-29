"use client";

import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

export type RevealVariant =
  | "fade-up"
  | "fade-in"
  | "fade-left"
  | "fade-right"
  | "scale-in";

export interface RevealProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: RevealVariant; // default: "fade-up"
  delay?: number; // Delay in milliseconds (default: 0)
  duration?: number; // Duration in milliseconds (default: 700)
  distance?: number; // Distance in pixels (default: 24 on desktop, 14 on mobile)
  threshold?: number; // Intersection threshold (default: 0.15)
  triggerOnce?: boolean; // Trigger only once (default: true)
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

function subscribeMobile(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("resize", callback);
  return () => window.removeEventListener("resize", callback);
}

function getMobileSnapshot() {
  if (typeof window === "undefined") return false;
  return window.innerWidth < 768;
}

function getMobileServerSnapshot() {
  return false;
}

/**
 * Editorial Scroll Reveal Component.
 * Supports fade-up, fade-in, fade-left, fade-right, scale-in variants.
 * Adapts distance and duration for mobile, strictly respects prefers-reduced-motion.
 */
export function Reveal({
  children,
  variant = "fade-up",
  delay = 0,
  duration = 700,
  distance,
  threshold = 0.15,
  triggerOnce = true,
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

  const isMobile = useSyncExternalStore(
    subscribeMobile,
    getMobileSnapshot,
    getMobileServerSnapshot
  );

  useEffect(() => {
    if (prefersReducedMotion) return;

    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (triggerOnce) {
            observer.disconnect();
          }
        } else if (!triggerOnce) {
          setIsVisible(false);
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
  }, [threshold, triggerOnce, prefersReducedMotion]);

  const shouldShow = isVisible || prefersReducedMotion;

  // Compute mobile-adjusted distance and duration
  const actualDistance =
    distance !== undefined
      ? distance
      : isMobile
      ? 14
      : variant === "fade-left" || variant === "fade-right"
      ? 20
      : 24;

  const actualDuration = prefersReducedMotion
    ? 0.01
    : isMobile
    ? Math.min(duration, 550)
    : duration;

  const actualDelay = prefersReducedMotion
    ? 0
    : isMobile
    ? Math.min(delay, 240)
    : delay;

  // Compute transform based on variant
  let hiddenTransform = "none";
  switch (variant) {
    case "fade-up":
      hiddenTransform = `translateY(${actualDistance}px)`;
      break;
    case "fade-left":
      hiddenTransform = `translateX(-${actualDistance}px)`;
      break;
    case "fade-right":
      hiddenTransform = `translateX(${actualDistance}px)`;
      break;
    case "scale-in":
      hiddenTransform = "scale(0.98)";
      break;
    case "fade-in":
    default:
      hiddenTransform = "none";
      break;
  }

  const Tag = Component as React.ElementType;

  return (
    <Tag
      ref={ref}
      data-reveal={shouldShow ? "visible" : "hidden"}
      className={cn(className)}
      style={{
        opacity: shouldShow ? 1 : 0,
        transform: prefersReducedMotion
          ? "none"
          : shouldShow
          ? "none"
          : hiddenTransform,
        transitionProperty: "opacity, transform",
        transitionDuration: `${actualDuration}ms`,
        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
        transitionDelay: `${actualDelay}ms`,
        willChange: shouldShow ? "auto" : "opacity, transform",
        ...style,
      }}
      {...props}
    >
      {children}
    </Tag>
  );
}

export default Reveal;
