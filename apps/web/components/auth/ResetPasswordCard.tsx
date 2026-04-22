"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

export function ResetPasswordCard() {
  const t = useTranslations("auth");
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isRecoverySession, setIsRecoverySession] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setIsRecoverySession(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || !!session) {
        setIsRecoverySession(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (password.length < 6) {
      setErrorMessage(t("reset_password_min"));
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage(t("reset_password_mismatch"));
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      setSuccessMessage(t("reset_password_success"));
      setTimeout(() => {
        router.replace("/login");
      }, 900);
    } catch {
      setErrorMessage(t("error_generic"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-4 md:p-8">
      <div className="absolute inset-0 bg-linear-to-tr from-primary/10 via-surface to-tertiary-fixed/30" />

      <section className="relative z-10 w-full max-w-xl rounded-2xl bg-surface-container-lowest p-8 shadow-[0_32px_64px_-12px_rgba(0,93,144,0.18)] md:p-10">
        <div className="mb-8 space-y-2">
          <p className="font-headline text-3xl font-extrabold tracking-tight text-primary">{t("brand")}</p>
          <h1 className="font-headline text-3xl font-bold text-on-surface">{t("reset_password_title")}</h1>
          <p className="text-on-surface-variant">{t("reset_password_subtitle")}</p>
        </div>

        {!isRecoverySession && (
          <p className="mb-6 rounded-xl bg-secondary-fixed px-4 py-3 text-sm font-medium text-on-secondary-fixed">
            {t("reset_password_missing_session")}
          </p>
        )}

        <form className="space-y-5" onSubmit={handleSubmit}>
          <label className="block space-y-1.5">
            <span className="ml-1 text-xs font-bold uppercase tracking-[0.12em] text-on-surface-variant">{t("password")}</span>
            <span className="relative block">
              <span className="material-symbols-outlined pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-outline">lock</span>
              <input
                required
                minLength={6}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t("password_placeholder")}
                className="w-full rounded-xl bg-surface-container-high py-4 pr-12 pl-12 text-on-surface outline-none ring-2 ring-transparent transition placeholder:text-outline focus:ring-primary-fixed"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute top-1/2 right-4 -translate-y-1/2 text-outline transition hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-[20px]">{showPassword ? "visibility_off" : "visibility"}</span>
              </button>
            </span>
          </label>

          <label className="block space-y-1.5">
            <span className="ml-1 text-xs font-bold uppercase tracking-[0.12em] text-on-surface-variant">{t("confirm_password")}</span>
            <span className="relative block">
              <span className="material-symbols-outlined pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-outline">lock</span>
              <input
                required
                minLength={6}
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder={t("password_placeholder")}
                className="w-full rounded-xl bg-surface-container-high py-4 pr-12 pl-12 text-on-surface outline-none ring-2 ring-transparent transition placeholder:text-outline focus:ring-primary-fixed"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((value) => !value)}
                className="absolute top-1/2 right-4 -translate-y-1/2 text-outline transition hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-[20px]">{showConfirmPassword ? "visibility_off" : "visibility"}</span>
              </button>
            </span>
          </label>

          {errorMessage && <p className="rounded-xl bg-error-container px-4 py-3 text-sm font-medium text-on-error-container">{errorMessage}</p>}
          {successMessage && <p className="rounded-xl bg-primary-fixed px-4 py-3 text-sm font-medium text-on-primary-fixed-variant">{successMessage}</p>}

          <button
            type="submit"
            disabled={loading || !isRecoverySession}
            className="w-full rounded-full bg-on-surface py-4 text-base font-bold text-surface transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-65"
          >
            {loading ? t("loading") : t("reset_password_submit")}
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-on-surface-variant">
          <Link href="/login" className="font-semibold text-primary transition hover:text-primary-container">
            {t("back_to_login")}
          </Link>
        </div>
      </section>
    </main>
  );
}
