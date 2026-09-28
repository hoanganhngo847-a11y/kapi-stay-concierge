"use client";

import React from "react";
import { Reveal, RevealVariant } from "./Reveal";

export interface StaggerRevealProps
  extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  staggerMs?: number; // default: 70
  maxDelay?: number; // default: 350
  variant?: RevealVariant;
  duration?: number;
  distance?: number;
  className?: string;
  as?: React.ElementType;
}

export function StaggerReveal({
  children,
  staggerMs = 70,
  maxDelay = 350,
  variant = "fade-up",
  duration = 700,
  distance,
  className,
  as: Component = "div",
  ...props
}: StaggerRevealProps) {
  const items = React.Children.toArray(children);
  const Tag = Component as React.ElementType;

  return (
    <Tag className={className} {...props}>
      {items.map((child, idx) => {
        const delay = Math.min(idx * staggerMs, maxDelay);
        const childKey = (child as React.ReactElement)?.key || idx;

        return (
          <Reveal
            key={childKey}
            variant={variant}
            delay={delay}
            duration={duration}
            distance={distance}
          >
            {child}
          </Reveal>
        );
      })}
    </Tag>
  );
}

export default StaggerReveal;
