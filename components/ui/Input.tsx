import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  errorMessage?: string;
  helperText?: string;
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
  containerClassName?: string;
  labelClassName?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type = "text",
      label,
      errorMessage,
      helperText,
      startIcon,
      endIcon,
      id,
      disabled,
      containerClassName,
      labelClassName,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId();
    const inputId = id || generatedId;
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;

    const hasError = Boolean(errorMessage);

    return (
      <div className={cn("w-full flex flex-col gap-1.5", containerClassName)}>
        {label && (
          <label
            htmlFor={inputId}
            className={cn(
              "text-sm font-medium text-dark/90",
              disabled && "opacity-60 cursor-not-allowed",
              labelClassName
            )}
          >
            {label}
          </label>
        )}

        <div className="relative flex items-center">
          {startIcon && (
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center justify-center text-dark/40 pointer-events-none shrink-0">
              {startIcon}
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            type={type}
            disabled={disabled}
            aria-invalid={hasError}
            aria-describedby={
              hasError ? errorId : helperText ? helperId : undefined
            }
            className={cn(
              "w-full h-11 px-3.5 text-sm bg-white text-dark rounded-lg border transition-colors",
              "placeholder:text-dark/40",
              "focus:outline-none focus:ring-2",
              hasError
                ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500/20 text-rose-950"
                : "border-dark/20 focus:border-primary focus:ring-primary/20",
              disabled && "bg-dark/5 text-dark/40 cursor-not-allowed border-dark/10",
              startIcon && "pl-10",
              endIcon && "pr-10",
              className
            )}
            {...props}
          />

          {endIcon && (
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center justify-center text-dark/40 pointer-events-none shrink-0">
              {endIcon}
            </div>
          )}
        </div>

        {errorMessage ? (
          <p id={errorId} className="text-xs font-medium text-rose-600 animate-in fade-in">
            {errorMessage}
          </p>
        ) : helperText ? (
          <p id={helperId} className="text-xs text-dark/60">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = "Input";
