"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

interface VerifyEmailCardProps {
  email: string;
}

export function VerifyEmailCard({ email }: VerifyEmailCardProps) {
  const t = useTranslations("auth");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function handleResend() {
    setLoading(true);
    setMessage(null);
    setIsError(false);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });

      if (error) {
        setIsError(true);
        setMessage(t("error_generic"));
        return;
      }

      setMessage(t("verify_email_resent"));
    } catch {
      setIsError(true);
      setMessage(t("error_generic"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md rounded-2xl bg-surface-container p-8 shadow-[0_8px_32px_rgba(0,93,144,0.10)] space-y-6">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-4xl">mark_email_unread</span>
          </div>
        </div>

        {/* Heading */}
        <div className="text-center space-y-2">
          <h1 className="font-headline text-2xl font-bold text-on-surface">
            {t("verify_email_heading")}
          </h1>
          <p className="text-on-surface-variant text-sm leading-relaxed">
            {t("verify_email_body", { email })}
          </p>
        </div>

        {/* Feedback */}
        {message && (
          <p
            className={`text-center text-sm rounded-lg px-4 py-3 ${
              isError
                ? "bg-error/10 text-error"
                : "bg-primary/10 text-primary"
            }`}
          >
            {message}
          </p>
        )}

        {/* Resend button */}
        <button
          onClick={handleResend}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-primary text-on-primary font-semibold text-sm tracking-wide hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? "..." : t("verify_email_resend")}
        </button>

        {/* Back link */}
        <div className="text-center">
          <Link
            href="/login"
            className="text-sm text-outline hover:text-primary transition-colors"
          >
            {t("verify_email_back")}
          </Link>
        </div>
      </div>
    </div>
  );
}
