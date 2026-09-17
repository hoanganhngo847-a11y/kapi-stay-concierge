"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";

interface GoogleSignInButtonProps {
  next?: string;
  className?: string;
}

export function GoogleSignInButton({ next, className }: GoogleSignInButtonProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const handleSignIn = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);

      const supabase = createClient();

      // Resolve callback origin from site URL or browser origin
      const siteUrl =
        process.env.NEXT_PUBLIC_SITE_URL ||
        (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");

      const callbackUrl = new URL("/auth/callback", siteUrl);
      if (next) {
        callbackUrl.searchParams.set("next", next);
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl.toString(),
        },
      });

      if (error) {
        setErrorMessage("Không thể kết nối đến Google. Vui lòng thử lại sau.");
        setIsLoading(false);
      }
    } catch {
      setErrorMessage("Đã xảy ra lỗi khi khởi tạo đăng nhập. Vui lòng thử lại.");
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full flex flex-col gap-2">
      <Button
        variant="outline"
        size="lg"
        onClick={handleSignIn}
        isLoading={isLoading}
        className={`w-full justify-center gap-3 border-dark/15 hover:border-dark/30 hover:bg-dark/[0.02] active:bg-dark/[0.05] transition-all font-medium text-dark ${
          className || ""
        }`}
        leftIcon={
          <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.24v3.15C3.26 21.36 7.33 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.24C.45 8.15 0 9.99 0 12s.45 3.85 1.24 5.42l4.04-3.15z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.24 6.58l4.04 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
            />
          </svg>
        }
      >
        Tiếp tục với Google
      </Button>

      {errorMessage && (
        <p className="text-xs text-red-600 text-center mt-1" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
