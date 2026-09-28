import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "outline" | "ghost" | "secondary" | "inverse";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const buttonVariants: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-[#111111] text-[#FFFFFF] hover:bg-black active:bg-neutral-800 focus-visible:ring-[#111111]/30 disabled:bg-[#9E9EA0] disabled:text-white/80 disabled:cursor-not-allowed",
  inverse:
    "bg-[#FFFFFF] text-[#111111] hover:bg-[#F5F5F5] active:bg-[#E5E5E5] focus-visible:ring-[#FFFFFF]/40 disabled:bg-[#9E9EA0] disabled:text-white disabled:cursor-not-allowed",
  outline:
    "border border-[#E5E5E5] text-[#111111] bg-transparent hover:bg-[#F5F5F5] active:bg-[#E5E5E5] focus-visible:ring-[#111111]/20 disabled:border-[#E5E5E5] disabled:text-[#9E9EA0] disabled:cursor-not-allowed",
  ghost:
    "bg-transparent text-[#111111] hover:bg-[#F5F5F5] active:bg-[#E5E5E5] focus-visible:ring-[#111111]/20 disabled:text-[#9E9EA0] disabled:cursor-not-allowed",
  secondary:
    "bg-[#F5F5F5] text-[#111111] hover:bg-[#E5E5E5] active:bg-[#D4D4D4] focus-visible:ring-[#111111]/20 disabled:bg-[#F5F5F5] disabled:text-[#9E9EA0] disabled:cursor-not-allowed",
};

const buttonSizes: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-8 px-4 text-xs rounded-full gap-1.5",
  md: "h-11 px-5 text-sm rounded-full gap-2",
  lg: "h-13 px-7 text-base rounded-full gap-2.5",
};

const spinnerSizes: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "w-3.5 h-3.5",
  md: "w-4 h-4",
  lg: "w-5 h-5",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      isLoading = false,
      leftIcon,
      rightIcon,
      disabled,
      children,
      type = "button",
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-colors select-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          buttonVariants[variant],
          buttonSizes[size],
          className
        )}
        {...props}
      >
        {isLoading ? (
          <Loader2
            className={cn("animate-spin shrink-0", spinnerSizes[size])}
            aria-hidden="true"
          />
        ) : (
          leftIcon && <span className="shrink-0">{leftIcon}</span>
        )}
        <span>{children}</span>
        {rightIcon && <span className="shrink-0">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = "Button";
