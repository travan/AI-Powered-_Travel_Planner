"use client";
import { UiText, useUiText } from "../../../../components/i18n/UiText";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SiteHeader } from "../../../../components/layout/SiteHeader";
import { createClient } from "../../../../lib/supabase/client";
import {
  joinTripByInviteToken,
  joinTripByShareToken,
  type TripMember,
  type WorkspaceApiError,
} from "../../../../lib/workspace-api";

type JoinType = "share" | "invite";

export default function JoinTripPage() {
  const t = useUiText();

  const router = useRouter();
  const searchParams = useSearchParams();
  const initialToken = searchParams.get("token") ?? "";
  const initialType =
    searchParams.get("type") === "invite" ? "invite" : "share";

  const [token, setToken] = useState(initialToken);
  const [joinType, setJoinType] = useState<JoinType>(initialType);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [state, setState] = useState<
    "loading" | "ready" | "joining" | "joined" | "error"
  >("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [joinedMember, setJoinedMember] = useState<TripMember | null>(null);

  const redirectTo = useMemo(() => {
    const params = new URLSearchParams();
    if (token) params.set("token", token);
    params.set("type", joinType);
    return `/trips/join?${params.toString()}`;
  }, [joinType, token]);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (cancelled) return;
      if (!session?.access_token) {
        router.replace(`/login?redirectTo=${encodeURIComponent(redirectTo)}`);
        return;
      }

      setAuthToken(session.access_token);
      setCurrentEmail(session.user?.email ?? null);
      setState("ready");
    }

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, [redirectTo, router]);

  async function handleJoin() {
    if (!authToken || !token.trim()) return;
    setState("joining");
    setMessage(null);

    try {
      const member =
        joinType === "invite"
          ? await joinTripByInviteToken(authToken, token.trim())
          : await joinTripByShareToken(authToken, token.trim());
      setJoinedMember(member);
      setState("joined");
      setMessage(`Joined trip as ${member.role}.`);
    } catch (error) {
      const apiError = error as WorkspaceApiError;
      setState("error");
      setMessage(apiError.message ?? "Unable to join this trip.");
    }
  }

  async function handleSwitchAccount() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace(`/login?redirectTo=${encodeURIComponent(redirectTo)}`);
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#e0f2fe_0,#f8fafc_38%,#fff7ed_100%)] pb-24 text-on-surface">
      <SiteHeader />
      <main
        className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8"
        data-testid="web-trip-join-page"
      >
        <section className="rounded-[2rem] border border-white/70 bg-surface/90 p-6 shadow-[0_24px_70px_rgba(0,93,144,0.12)] md:p-8">
          <p className="text-xs font-extrabold uppercase tracking-[0.28em] text-primary">
            {" "}
            <UiText id="tce93f1bdd01b" fallback="Join trip" />{" "}
          </p>
          <h1 className="mt-3 font-headline text-3xl font-black tracking-tight md:text-5xl">
            {" "}
            <UiText
              id="tf516d25450b4"
              fallback="Step into the shared workspace."
            />{" "}
          </h1>
          <p className="mt-3 text-sm leading-6 text-on-surface-variant">
            {" "}
            <UiText
              id="taf78820f95ed"
              fallback="Use an invite token from the host or a share token to join the trip with the role configured by the host."
            />{" "}
          </p>

          {currentEmail && (
            <div className="mt-5 rounded-2xl bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
              <p>
                {" "}
                <UiText id="ta02107c35fb1" fallback="Signed in as" />{" "}
                <strong className="text-on-surface">{currentEmail}</strong>{" "}
                <UiText
                  id="te55a3825fbc5"
                  fallback=". The invited traveler must open this link with their own account; the host cannot join their own invite."
                />{" "}
              </p>
              <button
                type="button"
                onClick={() => void handleSwitchAccount()}
                className="mt-2 text-sm font-bold text-primary hover:underline"
                data-testid="web-trip-join-switch-account"
              >
                {" "}
                <UiText
                  id="te76371211dbe"
                  fallback="Sign out and switch account"
                />{" "}
              </button>
            </div>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-[160px_1fr]">
            <select
              value={joinType}
              onChange={(event) => setJoinType(event.target.value as JoinType)}
              className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm font-bold outline-none focus:border-primary"
              data-testid="web-trip-join-type"
            >
              <option value="share">
                {" "}
                <UiText id="t3c1362260633" fallback="Share link" />{" "}
              </option>
              <option value="invite">
                {" "}
                <UiText id="t12fe31a0fdd6" fallback="Invite token" />{" "}
              </option>
            </select>
            <input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder={t("Paste invite/share token")}
              className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm outline-none focus:border-primary"
              data-testid="web-trip-join-token"
            />
          </div>

          <button
            type="button"
            onClick={() => void handleJoin()}
            disabled={
              !token.trim() || state === "joining" || state === "loading"
            }
            className="mt-5 rounded-full bg-primary px-5 py-3 text-sm font-bold text-on-primary disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="web-trip-join-submit"
          >
            {state === "joining" ? (
              <UiText id="t757a266e7519" fallback="Joining..." />
            ) : (
              <UiText id="tce93f1bdd01b" fallback="Join trip" />
            )}
          </button>

          {message && (
            <p
              className="mt-5 rounded-2xl bg-surface-container-low px-4 py-3 text-sm font-bold"
              data-testid="web-trip-join-message"
            >
              <UiText text={message} />
            </p>
          )}

          {joinedMember && (
            <Link
              href={`/trips/${joinedMember.tripId}/workspace`}
              className="mt-4 inline-flex rounded-full bg-secondary px-5 py-3 text-sm font-bold text-on-secondary"
              data-testid="web-trip-join-open-workspace"
            >
              {" "}
              <UiText id="t8b23311bbdc0" fallback="Open workspace" />{" "}
            </Link>
          )}
        </section>
      </main>
    </div>
  );
}
