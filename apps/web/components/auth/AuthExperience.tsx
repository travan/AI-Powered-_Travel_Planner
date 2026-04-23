"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

type AuthMode = "login" | "signup";

type AuthExperienceProps = {
  mode: AuthMode;
};

const HERO_BACKGROUND_IMAGE =
  "https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=1800&q=80";

const PANEL_BACKGROUND_IMAGE =
  "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1400&q=80";

export function AuthExperience({ mode }: AuthExperienceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("auth");

  const redirectTo = useMemo(() => {
    const target = searchParams.get("redirectTo");
    if (!target || !target.startsWith("/")) return "/plan";
    return target;
  }, [searchParams]);

  const authTabHref = useMemo(() => {
    if (redirectTo === "/plan") {
      return {
        login: "/login",
        signup: "/signup",
      };
    }

    const query = new URLSearchParams({ redirectTo }).toString();
    return {
      login: `/login?${query}`,
      signup: `/signup?${query}`,
    };
  }, [redirectTo]);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isLogin = mode === "login";

  async function handleGoogleAuth() {
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const supabase = createClient();
      const baseUrl = window.location.origin;
      const callbackPath = redirectTo === "/" ? "/plan" : redirectTo;

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${baseUrl}${callbackPath}`,
        },
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      if (data?.url && data.url.startsWith(baseUrl)) {
        window.location.assign(data.url);
      }
    } catch {
      setErrorMessage(t("google_error"));
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const supabase = createClient();

      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          setErrorMessage(error.message);
          return;
        }

        router.replace(redirectTo);
        router.refresh();
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName.trim(),
          },
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      if (data.session) {
        router.replace(redirectTo);
        router.refresh();
        return;
      }

      setSuccessMessage(t("signup_success"));
    } catch {
      setErrorMessage(t("error_generic"));
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!email.trim()) {
      setErrorMessage(t("forgot_requires_email"));
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      setSuccessMessage(t("forgot_sent"));
    } catch {
      setErrorMessage(t("error_generic"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-4 md:p-8">
      <div className="absolute inset-0">
        <img src={HERO_BACKGROUND_IMAGE} alt="Mountain landscape" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-linear-to-tr from-on-surface/35 to-primary/20" />
      </div>

      <section className="relative z-10 flex w-full max-w-275 overflow-hidden rounded-2xl bg-surface/80 shadow-[0_32px_64px_-12px_rgba(0,93,144,0.22)] backdrop-blur-lg md:flex-row">
        <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden p-12 text-on-primary md:flex">
          <div className="absolute inset-0">
            <img src={PANEL_BACKGROUND_IMAGE} alt="Lake and mountain" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-linear-to-br from-primary to-primary-container opacity-70 mix-blend-multiply" />
          </div>

          <div className="relative z-10 max-w-sm space-y-6">
            <p className="font-headline text-4xl font-extrabold tracking-tight">{t("brand")}</p>
            <h1 className="font-headline text-5xl font-bold leading-[1.05]">{t("hero_title")}</h1>
            <p className="text-lg text-primary-fixed">{t("hero_subtitle")}</p>
          </div>

          <div className="relative z-10 flex items-center gap-5">
            <div>
              <p className="font-headline text-3xl font-bold">{t("hero_stat_1_value")}</p>
              <p className="text-xs uppercase tracking-[0.2em] text-primary-fixed/75">{t("hero_stat_1_label")}</p>
            </div>
            <div className="h-10 w-px bg-primary-fixed-dim/35" />
            <div>
              <p className="font-headline text-3xl font-bold">{t("hero_stat_2_value")}</p>
              <p className="text-xs uppercase tracking-[0.2em] text-primary-fixed/75">{t("hero_stat_2_label")}</p>
            </div>
          </div>
        </aside>

        <div className="w-full bg-surface-container-lowest px-8 py-10 md:w-1/2 md:px-12 md:py-14">
          <div className="mx-auto flex h-full w-full max-w-md flex-col">
            <p className="mb-10 font-headline text-3xl font-extrabold tracking-tight text-primary md:hidden">{t("brand")}</p>

            <div className="mb-10 flex w-fit rounded-full bg-surface-container-low p-1.5" data-testid="web-auth-tabs">
              <Link
                href={authTabHref.login}
                className={`rounded-full px-8 py-2 text-sm font-semibold transition ${isLogin ? "bg-surface-container-lowest text-on-surface shadow-sm" : "text-on-surface-variant hover:text-on-surface"}`}
                data-testid="web-auth-tab-login"
              >
                {t("tab_login")}
              </Link>
              <Link
                href={authTabHref.signup}
                className={`rounded-full px-8 py-2 text-sm font-semibold transition ${!isLogin ? "bg-surface-container-lowest text-on-surface shadow-sm" : "text-on-surface-variant hover:text-on-surface"}`}
                data-testid="web-auth-tab-signup"
              >
                {t("tab_signup")}
              </Link>
            </div>

            <header className="mb-8 space-y-2">
              <h2 className="font-headline text-4xl font-bold text-on-surface">{isLogin ? t("welcome_back") : t("welcome_signup")}</h2>
              <p className="text-on-surface-variant">{t("subtitle")}</p>
            </header>

            <button
              type="button"
              disabled={loading}
              onClick={handleGoogleAuth}
              data-testid={`web-auth-google-${mode}`}
              className="mb-6 flex w-full items-center justify-center gap-3 rounded-full bg-linear-to-r from-primary to-primary-container px-6 py-4 text-base font-bold text-on-primary shadow-[0_18px_32px_-16px_rgba(0,93,144,0.9)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <GoogleIcon />
              {t("with_google")}
            </button>

            <div className="relative mb-8 flex items-center">
              <div className="h-px flex-1 bg-outline-variant/45" />
              <span className="mx-4 text-xs font-bold uppercase tracking-[0.22em] text-outline">{t("or_email")}</span>
              <div className="h-px flex-1 bg-outline-variant/45" />
            </div>

            <form className="space-y-5" onSubmit={handleEmailAuth} data-testid={`web-auth-form-${mode}`}>
              {!isLogin && (
                <label className="block space-y-1.5">
                  <span className="ml-1 text-xs font-bold uppercase tracking-[0.12em] text-on-surface-variant">{t("full_name")}</span>
                  <span className="relative block">
                    <span className="material-symbols-outlined pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-outline">person</span>
                    <input
                      required
                      type="text"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      placeholder={t("full_name_placeholder")}
                      data-testid="web-auth-full-name"
                      className="w-full rounded-xl bg-surface-container-high py-4 pr-4 pl-12 text-on-surface outline-none ring-2 ring-transparent transition placeholder:text-outline focus:ring-primary-fixed"
                    />
                  </span>
                </label>
              )}

              <label className="block space-y-1.5">
                <span className="ml-1 text-xs font-bold uppercase tracking-[0.12em] text-on-surface-variant">{t("email")}</span>
                <span className="relative block">
                  <span className="material-symbols-outlined pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-outline">mail</span>
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder={t("email_placeholder")}
                    data-testid="web-auth-email"
                    className="w-full rounded-xl bg-surface-container-high py-4 pr-4 pl-12 text-on-surface outline-none ring-2 ring-transparent transition placeholder:text-outline focus:ring-primary-fixed"
                  />
                </span>
              </label>

              <label className="block space-y-1.5">
                <div className="ml-1 flex items-center justify-between text-xs font-bold uppercase tracking-[0.12em] text-on-surface-variant">
                  <span>{t("password")}</span>
                  {isLogin && (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={handleForgotPassword}
                      data-testid="web-auth-forgot-password"
                      className="text-primary normal-case tracking-normal transition hover:text-primary-container disabled:opacity-60"
                    >
                      {t("forgot")}
                    </button>
                  )}
                </div>
                <span className="relative block">
                  <span className="material-symbols-outlined pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-outline">lock</span>
                  <input
                    required
                    minLength={6}
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={t("password_placeholder")}
                    data-testid="web-auth-password"
                    className="w-full rounded-xl bg-surface-container-high py-4 pr-12 pl-12 text-on-surface outline-none ring-2 ring-transparent transition placeholder:text-outline focus:ring-primary-fixed"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="absolute top-1/2 right-4 -translate-y-1/2 text-outline transition hover:text-on-surface"
                  >
                    <span className="material-symbols-outlined text-[20px]">{showPassword ? "visibility_off" : "visibility"}</span>
                  </button>
                </span>
              </label>

              {errorMessage && <p className="rounded-xl bg-error-container px-4 py-3 text-sm font-medium text-on-error-container" data-testid="web-auth-error">{errorMessage}</p>}
              {successMessage && (
                <p className="rounded-xl bg-primary-fixed px-4 py-3 text-sm font-medium text-on-primary-fixed-variant" data-testid="web-auth-success">{successMessage}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                data-testid={`web-auth-submit-${mode}`}
                className="mt-2 w-full rounded-full bg-on-surface py-4 text-base font-bold text-surface transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-65"
              >
                {loading ? t("loading") : isLogin ? t("submit_login") : t("submit_signup")}
              </button>
            </form>

            <footer className="mt-auto flex justify-center gap-6 pt-10 text-xs font-medium text-on-surface-variant/80">
              <Link href="/terms" className="transition hover:text-on-surface">
                {t("terms")}
              </Link>
              <Link href="/privacy" className="transition hover:text-on-surface">
                {t("privacy")}
              </Link>
              <Link href="/support" className="transition hover:text-on-surface">
                {t("support")}
              </Link>
            </footer>
          </div>
        </div>
      </section>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="currentColor"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="currentColor"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="currentColor"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
