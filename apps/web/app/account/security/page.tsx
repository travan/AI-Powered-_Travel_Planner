"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { LOCAL_AUTH_ENABLED } from "@/lib/supabase/local-auth";
import {
  startGoogleAuth,
  getGoogleAccountMethods,
  type GoogleAccountMethods,
} from "@/lib/google-auth";

export default function AccountSecurityPage() {
  const t = useTranslations("auth");
  const [password, setPassword] = useState("");
  const [methods, setMethods] = useState<GoogleAccountMethods | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!LOCAL_AUTH_ENABLED) return;
    let active = true;
    createClient()
      .auth.getSession()
      .then(async ({ data }) => {
        if (!active) return;
        setSignedIn(Boolean(data.session));
        if (data.session) {
          const value = await getGoogleAccountMethods();
          if (active) setMethods(value);
        }
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      });
    if (new URLSearchParams(window.location.search).get("google") === "linked")
      setMessage(t("google_link_success"));
    return () => {
      active = false;
    };
  }, [t]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await createClient().auth.getSession();
      const url = await startGoogleAuth({
        intent: "link",
        password,
        next: "/account/security?google=linked",
      });
      setPassword("");
      window.location.assign(url);
    } catch (error) {
      setPassword("");
      setMessage(
        t(
          (error as { code?: string }).code === "google_reauth_required"
            ? "google_reauth_required"
            : "google_error",
        ),
      );
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-lg p-8 space-y-6">
      <h1 className="text-3xl font-bold">{t("signin_methods_title")}</h1>

      {message && <p role="status">{message}</p>}
      {loadFailed ? (
        <p role="alert">{t("google_status_error")}</p>
      ) : !signedIn ? (
        <Link href="/login?redirectTo=%2Faccount%2Fsecurity">
          {t("google_signin_required")}
        </Link>
      ) : !methods ? (
        <p role="status">{t("loading")}</p>
      ) : methods.googleLinked ? (
        <div className="space-y-3">
          <p role="status">{t("google_connected")}</p>
          <p>
            {t(
              methods.hasPassword
                ? "google_connected_with_password"
                : "google_connected_without_password",
            )}
          </p>
        </div>
      ) : !methods.hasPassword ? (
        <p>{t("google_no_password_to_link")}</p>
      ) : !methods.googleEnabled ? (
        <p>{t("google_unavailable")}</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p>{t("google_link_description")}</p>
          <label className="block">
            {t("google_confirm_password")}
            <input
              aria-label={t("google_confirm_password")}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              maxLength={256}
              className="block w-full rounded border p-3"
            />
          </label>
          <button
            disabled={busy}
            className="rounded bg-primary px-5 py-3 text-on-primary disabled:opacity-50"
          >
            {t("google_link_continue")}
          </button>
        </form>
      )}
    </main>
  );
}
