"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Itinerary, SSEEventType } from "@travel/types";
import { SiteHeader } from "../../../components/layout/SiteHeader";
import { OverviewCard } from "../../../components/itinerary/OverviewCard";
import { getItinerary } from "../../../lib/api";
import { useSSE } from "../../../hooks/useSSE";

type LoadState = "idle" | "waiting" | "loading" | "ready" | "error";

export default function TripsPage() {
  const searchParams = useSearchParams();
  const source = searchParams.get("source");
  const id = searchParams.get("id");

  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [itineraryId, setItineraryId] = useState<string | null>(null);
  const [steps, setSteps] = useState<SSEEventType[]>([]);
  const previousContextRef = useRef<string | null>(null);

  const isQueued = source === "queued" && Boolean(id);

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
        const data = await getItinerary(targetId);
        if (cancelled) return;

        const first = data.itineraries?.[0] ?? null;
        if (!first) {
          setError("No itinerary data available.");
          setState("error");
          return;
        }

        setItinerary(first);
        setState("ready");
      } catch {
        if (cancelled) return;
        setError("Unable to load generated results.");
        setState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, isQueued, itineraryId, source]);

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

      <main className="mx-auto max-w-4xl px-4 py-10 space-y-6" data-testid="web-trips-screen">
        <header className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-primary">Generated Results</p>
          <h1 className="text-3xl font-headline font-extrabold">Pick your itinerary</h1>
          <p className="text-sm text-on-surface-variant">
            Overview first, details next. Choose a result to open the full schedule.
          </p>
        </header>

        {state === "idle" && (
          <section className="rounded-xl border border-outline-variant/30 bg-surface p-6">
            <p className="text-sm text-on-surface-variant">No generated result in context.</p>
            <Link href="/plan" className="mt-3 inline-flex text-sm font-semibold text-primary hover:underline">
              Plan a trip
            </Link>
          </section>
        )}

        {(state === "waiting" || state === "loading") && (
          <section className="rounded-xl border border-outline-variant/30 bg-surface p-6 space-y-3">
            <p className="text-sm font-semibold text-on-surface">{progressLabel}</p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
            </div>
          </section>
        )}

        {state === "error" && (
          <section className="rounded-xl border border-error/40 bg-error/10 p-6">
            <p className="text-sm font-semibold text-error">{error ?? "Something went wrong."}</p>
            <Link href="/plan" className="mt-3 inline-flex text-sm font-semibold text-primary hover:underline">
              Back to planner
            </Link>
          </section>
        )}

        {state === "ready" && itinerary && (
          <section className="space-y-4">
            <OverviewCard itinerary={itinerary} />
            <div className="flex justify-end">
              <Link
                href={`/itinerary/${itinerary.id ?? itineraryId ?? id}`}
                className="inline-flex items-center rounded-full bg-primary px-5 py-3 text-sm font-semibold text-on-primary hover:brightness-105"
                data-testid="web-trips-detail-link"
              >
                Open full itinerary
              </Link>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
