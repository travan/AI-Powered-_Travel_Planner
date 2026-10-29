"use client";
import { UiText, useUiText } from "../../../components/i18n/UiText";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Itinerary, SSEEventType, TripSummary } from "@travel/types";
import { SiteHeader } from "../../../components/layout/SiteHeader";
import { OverviewCard } from "../../../components/itinerary/OverviewCard";
import { RecentPlanningRequests } from "../../../components/plan/RecentPlanningRequests";
import { ApiRequestError, getItinerary, getMyTrips } from "../../../lib/api";
import { createClient } from "../../../lib/supabase/client";
import { useSSE } from "../../../hooks/useSSE";
import { useRouter } from "next/navigation";

type LoadState = "idle" | "waiting" | "loading" | "ready" | "error";

export default function TripsPage() {
  const t = useUiText();

  const router = useRouter();
  const searchParams = useSearchParams();
  const source = searchParams.get("source");
  const id = searchParams.get("id");

  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [itineraryId, setItineraryId] = useState<string | null>(null);
  const [steps, setSteps] = useState<SSEEventType[]>([]);
  const [myTrips, setMyTrips] = useState<TripSummary[]>([]);
  const previousContextRef = useRef<string | null>(null);

  const isQueued = source === "queued" && Boolean(id);
  const hasGeneratedContext = Boolean(source || id);

  const appendStep = (step: SSEEventType) => {
    setSteps((prev) => (prev.includes(step) ? prev : [...prev, step]));
  };

  useSSE(isQueued ? id : null, {
    queued: () => appendStep("queued"),
    processing: () => appendStep("processing"),
    overview_ready: () => appendStep("overview_ready"),
    city_ready: () => appendStep("city_ready"),
    transport_ready: () => appendStep("transport_ready"),
    restaurants_ready: () => appendStep("restaurants_ready"),
    complete: (data) => {
      appendStep("complete");
      const payload = data as { itinerary_id?: string };
      if (payload.itinerary_id) {
        setItineraryId(payload.itinerary_id);
      }
    },
    error: (data) => {
      appendStep("error");
      const payload = data as { message?: string };
      setError(payload.message ?? "Generation failed.");
      setState("error");
    },
  });

  useEffect(() => {
    if (!hasGeneratedContext) return;

    const contextKey = `${source ?? ""}:${id ?? ""}`;
    if (previousContextRef.current !== contextKey) {
      setItinerary(null);
      setSteps([]);
      setItineraryId(null);
      setError(null);
      previousContextRef.current = contextKey;
    }

    const targetId = source === "cached" ? id : itineraryId;

    if (!targetId) {
      if (isQueued) {
        setState("waiting");
        return;
      }

      if (!id) {
        setState("idle");
      }
      return;
    }

    let cancelled = false;

    setState("loading");
    setError(null);

    void (async () => {
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const data = await getItinerary(targetId, session?.access_token);
        if (cancelled) return;

        const first = data.itineraries?.[0] ?? null;
        if (!first) {
          setError(t("No itinerary data available."));
          setState("error");
          return;
        }

        setItinerary(first);
        setState("ready");
      } catch {
        if (cancelled) return;
        setError(t("Unable to load generated results."));
        setState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasGeneratedContext, id, isQueued, itineraryId, source]);

  useEffect(() => {
    if (hasGeneratedContext) return;

    let cancelled = false;
    setState("loading");
    setError(null);

    void (async () => {
      const supabase = createClient();

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          setState("idle");
          return;
        }

        const trips = await getMyTrips(session.access_token);
        if (cancelled) return;
        setMyTrips(trips);
        setState("ready");
      } catch (loadError) {
        if (cancelled) return;
        if (loadError instanceof ApiRequestError && loadError.status === 401) {
          await supabase.auth.signOut();
          if (!cancelled) {
            router.replace(`/login?redirectTo=${encodeURIComponent("/trips")}`);
          }
          return;
        }
        setError(t("Unable to load your trips."));
        setState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasGeneratedContext, router]);

  const progressLabel = useMemo(() => {
    if (!steps.length) return "Preparing your itinerary...";

    const latest = steps[steps.length - 1];
    switch (latest) {
      case "queued":
        return "Your request is queued.";
      case "processing":
        return "AI is building the plan.";
      case "overview_ready":
        return "Overview is ready. Finalizing details.";
      case "city_ready":
      case "transport_ready":
      case "restaurants_ready":
        return "Adding details for your trip.";
      case "complete":
        return "Result is ready.";
      default:
        return "Preparing your itinerary...";
    }
  }, [steps]);

  return (
    <div className="min-h-screen bg-background text-on-surface">
      <SiteHeader />

      <main
        className="mx-auto max-w-4xl px-4 py-10 space-y-6"
        data-testid="web-trips-screen"
      >
        <header className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-primary">
            {hasGeneratedContext ? (
              <UiText id="tf87edc892083" fallback="Generated Results" />
            ) : (
              <UiText id="tbdb1c97b12c9" fallback="My trips" />
            )}
          </p>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-2">
              <h1 className="text-3xl font-headline font-extrabold">
                {hasGeneratedContext ? (
                  <UiText id="t05ee412912f0" fallback="Pick your itinerary" />
                ) : (
                  <UiText id="t5e05e5ef3dd1" fallback="Your trips" />
                )}
              </h1>
              <p className="text-sm text-on-surface-variant">
                {hasGeneratedContext ? (
                  <UiText
                    id="t810962427c20"
                    fallback="Overview first, details next. Choose a result to open the full schedule."
                  />
                ) : (
                  <UiText
                    id="tded4bea1a600"
                    fallback="Your saved trips, planning progress, and shared travel workspaces in one place."
                  />
                )}
              </p>
            </div>
            {!hasGeneratedContext && (
              <Link
                href="/plan"
                className="inline-flex items-center rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary hover:brightness-105"
              >
                {" "}
                <UiText id="t2940253eb060" fallback="Plan a new trip" />{" "}
              </Link>
            )}
          </div>
        </header>

        {!hasGeneratedContext && <RecentPlanningRequests />}

        {state === "idle" && !hasGeneratedContext && (
          <section className="rounded-xl border border-outline-variant/30 bg-surface p-6">
            <p className="text-sm text-on-surface-variant">
              {" "}
              <UiText
                id="t84038e347cbc"
                fallback="Sign in to see your trips."
              />{" "}
            </p>
            <div className="mt-3 flex flex-wrap gap-4">
              <Link
                href="/login?redirectTo=%2Ftrips"
                className="inline-flex text-sm font-semibold text-primary hover:underline"
              >
                {" "}
                <UiText id="tada2e9e96fa9" fallback="Sign in" />{" "}
              </Link>
              <Link
                href="/plan"
                className="inline-flex text-sm font-semibold text-primary hover:underline"
              >
                {" "}
                <UiText id="t7c240a57fbb4" fallback="Plan a trip" />{" "}
              </Link>
            </div>
          </section>
        )}

        {state === "idle" && hasGeneratedContext && (
          <section className="rounded-xl border border-outline-variant/30 bg-surface p-6">
            <p className="text-sm text-on-surface-variant">
              {" "}
              <UiText
                id="tef9ea74ac1ba"
                fallback="No generated result in context."
              />{" "}
            </p>
            <Link
              href="/plan"
              className="mt-3 inline-flex text-sm font-semibold text-primary hover:underline"
            >
              {" "}
              <UiText id="t7c240a57fbb4" fallback="Plan a trip" />{" "}
            </Link>
          </section>
        )}

        {(state === "waiting" || state === "loading") && (
          <section className="rounded-xl border border-outline-variant/30 bg-surface p-6 space-y-3">
            <p className="text-sm font-semibold text-on-surface">
              {progressLabel}
            </p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
            </div>
          </section>
        )}

        {state === "error" && (
          <section className="rounded-xl border border-error/40 bg-error/10 p-6">
            <p className="text-sm font-semibold text-error">
              {error ?? <UiText text="Something went wrong." />}
            </p>
            <Link
              href="/plan"
              className="mt-3 inline-flex text-sm font-semibold text-primary hover:underline"
            >
              {" "}
              <UiText id="tc0e738c1bc3c" fallback="Back to planner" />{" "}
            </Link>
          </section>
        )}

        {state === "ready" && !hasGeneratedContext && (
          <section
            className="grid gap-4 md:grid-cols-2"
            data-testid="web-trip-list"
          >
            {myTrips.length === 0 ? (
              <div className="rounded-xl border border-outline-variant/30 bg-surface p-6 md:col-span-2">
                <p className="text-sm text-on-surface-variant">
                  {" "}
                  <UiText id="td0ea17370d0a" fallback="No trips yet." />{" "}
                </p>
                <Link
                  href="/plan"
                  className="mt-3 inline-flex text-sm font-semibold text-primary hover:underline"
                >
                  {" "}
                  <UiText
                    id="t393eeb00ba4d"
                    fallback="Plan your first trip"
                  />{" "}
                </Link>
              </div>
            ) : (
              myTrips.map((trip) => (
                <Link
                  key={trip.id}
                  href={`/trips/${trip.id}/workspace`}
                  className="rounded-2xl border border-outline-variant/30 bg-surface p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  data-testid="web-trip-card"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
                        {trip.role}
                      </p>
                      <h2 className="mt-2 font-headline text-xl font-bold text-on-surface">
                        {trip.title}
                      </h2>
                      <p className="mt-1 text-sm text-on-surface-variant">
                        {trip.start_date ?? "Flexible"} -{" "}
                        {trip.end_date ?? "TBD"}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-wide">
                        <span className="rounded-full bg-primary-fixed px-2.5 py-1 text-on-primary-fixed-variant">
                          {trip.visibility === "private" ? (
                            <UiText
                              id="tf52b06152869"
                              fallback="Personal trip"
                            />
                          ) : (
                            <UiText id="t75eb5fb56889" fallback="Shared trip" />
                          )}
                        </span>
                        <span className="rounded-full bg-surface-container px-2.5 py-1 text-on-surface-variant">
                          {trip.role === "host" ? (
                            <UiText
                              id="t62915e089ed9"
                              fallback="You own this trip"
                            />
                          ) : (
                            `Role: ${trip.role}`
                          )}
                        </span>
                      </div>
                    </div>
                    <span className="rounded-full bg-primary-fixed px-3 py-1 text-xs font-bold text-on-primary-fixed-variant">
                      {trip.status}
                    </span>
                  </div>
                  <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-xl bg-surface-container-low p-3">
                      <p className="text-lg font-bold">{trip.activity_count}</p>
                      <p className="text-[11px] uppercase tracking-wide text-outline">
                        {" "}
                        <UiText id="t053a51b9d0cd" fallback="activities" />{" "}
                      </p>
                    </div>
                    <div className="rounded-xl bg-surface-container-low p-3">
                      <p className="text-lg font-bold">
                        {trip.checklist_done}/{trip.checklist_total}
                      </p>
                      <p className="text-[11px] uppercase tracking-wide text-outline">
                        {" "}
                        <UiText id="t55d8727a05eb" fallback="tasks" />{" "}
                      </p>
                    </div>
                    <div className="rounded-xl bg-surface-container-low p-3">
                      <p className="text-lg font-bold">
                        {Math.round(trip.expense_total / 1000000)}{" "}
                        <UiText id="t6b0d31c0d563" fallback="m" />{" "}
                      </p>
                      <p className="text-[11px] uppercase tracking-wide text-outline">
                        {trip.currency}
                      </p>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </section>
        )}

        {state === "ready" && hasGeneratedContext && itinerary && (
          <section className="space-y-4">
            {searchParams.get("reused") === "1" && (
              <p className="rounded-xl border border-primary/30 bg-primary-fixed px-4 py-3 text-sm font-medium text-on-primary-fixed-variant">
                {" "}
                <UiText
                  id="tce4f7b02e7aa"
                  fallback="Reused your saved itinerary. No AI model was called for this request."
                />{" "}
              </p>
            )}
            <OverviewCard itinerary={itinerary} />
            <div className="flex justify-end">
              <Link
                href={`/itinerary/${itinerary.id ?? itineraryId ?? id}`}
                className="inline-flex items-center rounded-full bg-primary px-5 py-3 text-sm font-semibold text-on-primary hover:brightness-105"
                data-testid="web-trips-detail-link"
              >
                {" "}
                <UiText
                  id="tedfdc9633b21"
                  fallback="Open full itinerary"
                />{" "}
              </Link>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
