"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useSSE } from "../../../../../hooks/useSSE";
import type { SSEEventType } from "@travel/types";

type Step = { type: SSEEventType; label: string; detail?: string };

const STEP_LABELS: Partial<Record<SSEEventType, string>> = {
  queued: "Queued for processing",
  processing: "AI is crafting your itinerary",
  overview_ready: "Overview complete",
  city_ready: "Cities detailed",
  transport_ready: "Transport options ready",
  restaurants_ready: "Food & restaurants added",
  complete: "Itinerary ready!",
};

export default function GeneratingPage() {
  const router = useRouter();
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId;

  const [steps, setSteps] = useState<Step[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addStep = (type: SSEEventType, detail?: string) => {
    setSteps((prev) => {
      if (prev.some((s) => s.type === type)) return prev;
      return [...prev, { type, label: STEP_LABELS[type] ?? type, detail }];
    });
  };

  useSSE(jobId ?? null, {
    queued: () => addStep("queued"),
    processing: () => addStep("processing"),
    overview_ready: (data) => {
      const d = data as { cities?: string[] };
      addStep("overview_ready", d.cities?.join(" → "));
    },
    city_ready: () => addStep("city_ready"),
    transport_ready: () => addStep("transport_ready"),
    restaurants_ready: () => addStep("restaurants_ready"),
    complete: (data) => {
      const d = data as { itinerary_id?: string };
      addStep("complete");
      setDone(true);
      if (d.itinerary_id) {
        redirectTimeoutRef.current = setTimeout(() => {
          router.replace(`/itinerary/${d.itinerary_id}`);
        }, 800);
      }
    },
    error: (data) => {
      const d = data as { message?: string };
      setError(d.message ?? "Something went wrong generating your itinerary.");
    },
  });

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current) clearTimeout(redirectTimeoutRef.current);
    };
  }, []);

  const completedOrder: SSEEventType[] = [
    "queued",
    "processing",
    "overview_ready",
    "city_ready",
    "transport_ready",
    "restaurants_ready",
    "complete",
  ];

  const completedSet = new Set(steps.map((s) => s.type));

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6" data-testid="web-generating-screen">
      <div className="w-full max-w-lg space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          {done ? (
            <>
              <div className="w-20 h-20 mx-auto rounded-full bg-primary-fixed flex items-center justify-center">
                <span
                  className="material-symbols-outlined text-primary text-4xl"
                  style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 48" }}
                >
                  check_circle
                </span>
              </div>
              <h1 className="text-2xl font-headline font-extrabold text-on-surface">
                Your itinerary is ready!
              </h1>
              <p className="text-on-surface-variant">Redirecting you now…</p>
            </>
          ) : error ? (
            <>
              <div className="w-20 h-20 mx-auto rounded-full bg-error/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-error text-4xl">error</span>
              </div>
              <h1 className="text-2xl font-headline font-extrabold text-on-surface">
                Something went wrong
              </h1>
              <p className="text-error text-sm">{error}</p>
              <a
                href="/plan"
                className="mt-4 inline-block bg-primary text-on-primary px-6 py-3 rounded-full font-bold text-sm"
              >
                Try again
              </a>
            </>
          ) : (
            <>
              <div className="w-20 h-20 mx-auto rounded-full bg-primary-fixed flex items-center justify-center">
                <span
                  className="material-symbols-outlined text-primary text-4xl animate-spin"
                  style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 48" }}
                >
                  progress_activity
                </span>
              </div>
              <h1 className="text-2xl font-headline font-extrabold text-on-surface">
                Crafting your journey…
              </h1>
              <p className="text-on-surface-variant text-sm">
                Our AI is personalizing every detail. This usually takes 15–30 seconds.
              </p>
            </>
          )}
        </div>

        {/* Progress steps */}
        {!error && (
          <div className="bg-surface-container-low rounded-xl p-6 space-y-4">
            {completedOrder.map((stepType, idx) => {
              const isComplete = completedSet.has(stepType);
              const detail = steps.find((s) => s.type === stepType)?.detail;
              const label = STEP_LABELS[stepType] ?? stepType;

              // Show next upcoming step as pulsing
              const nextIdx = completedOrder.findIndex((t) => !completedSet.has(t));
              const isActive = !isComplete && idx === nextIdx;

              return (
                <div key={stepType} className="flex items-center gap-4">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all ${
                      isComplete
                        ? "bg-primary text-on-primary"
                        : isActive
                        ? "bg-primary-fixed border-2 border-primary animate-pulse"
                        : "bg-surface-container-high text-outline"
                    }`}
                  >
                    {isComplete ? (
                      <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>
                        check
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-current">{idx + 1}</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <p
                      className={`text-sm font-semibold ${
                        isComplete ? "text-on-surface" : isActive ? "text-on-surface animate-pulse" : "text-outline"
                      }`}
                    >
                      {label}
                    </p>
                    {detail && isComplete && (
                      <p className="text-xs text-on-surface-variant">{detail}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
