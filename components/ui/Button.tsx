import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "outline" | "ghost" | "secondary";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const buttonVariants: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-primary text-white shadow-sm hover:bg-primary-600 active:bg-primary-700 focus-visible:ring-primary/40 disabled:bg-primary-300 disabled:cursor-not-allowed",
  outline:
    "border border-dark/20 text-dark bg-transparent hover:bg-dark/5 active:bg-dark/10 focus-visible:ring-dark/20 disabled:border-dark/10 disabled:text-dark/40 disabled:cursor-not-allowed",
  ghost:
    "bg-transparent text-dark hover:bg-dark/5 active:bg-dark/10 focus-visible:ring-dark/20 disabled:text-dark/40 disabled:cursor-not-allowed",
  secondary:
    "bg-secondary text-white shadow-sm hover:bg-secondary-600 active:bg-secondary-700 focus-visible:ring-secondary/40 disabled:bg-secondary-300 disabled:cursor-not-allowed",
};

const buttonSizes: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-8 px-3 text-xs rounded-md gap-1.5",
  md: "h-10 px-4 text-sm rounded-lg gap-2",
  lg: "h-12 px-6 text-base rounded-xl gap-2.5",
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
