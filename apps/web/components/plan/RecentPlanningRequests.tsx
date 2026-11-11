"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { routeLabels, type PlanningJobSummary } from "@travel/types";
import { createClient } from "../../lib/supabase/client";
import { getPlanningRequests } from "../../lib/journey-api";
import { useAppLanguage } from "../i18n/LanguageProvider";

const PAGE_SIZE = 3;

export function RecentPlanningRequests() {
  const t = useTranslations("plannerUX.requests");
  const { locale } = useAppLanguage();
  const [requests, setRequests] = useState<PlanningJobSummary[]>([]);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(requests.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleRequests = requests.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const {
          data: { session },
        } = await createClient().auth.getSession();
        if (abort.signal.aborted || !session) return;
        const rows = await getPlanningRequests(
          session.access_token,
          abort.signal,
        );
        if (abort.signal.aborted) return;
        const available = rows.filter((row) => row.status !== "failed");
        setRequests(available);
        setPage((value) =>
          Math.min(value, Math.max(1, Math.ceil(available.length / PAGE_SIZE))),
        );
        setError(false);
        if (
          rows.some(
            (row) => row.status === "queued" || row.status === "processing",
          )
        )
          timer = setTimeout(load, 10000);
      } catch {
        if (!abort.signal.aborted) setError(true);
      }
    };
    void load();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [attempt]);

  if (!requests.length && !error) return null;
  return (
    <section
      className="my-6 overflow-hidden rounded-3xl border border-primary/20 bg-surface-container-lowest shadow-[0_8px_32px_-16px_var(--color-primary)]"
      aria-label={t("title")}
    >
      <div className="flex items-start gap-4 border-b border-primary/10 bg-primary/5 px-5 py-5 sm:px-6">
        <span
          aria-hidden="true"
          className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-on-primary shadow-sm"
        >
          <span className="material-symbols-outlined">travel_explore</span>
        </span>
        <div className="min-w-0">
          <h2 className="font-headline text-lg font-extrabold text-primary sm:text-xl">
            {t("title")}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">
            {t("hint")}
          </p>
        </div>
      </div>
      {error && (
        <p
          role="alert"
          className="mx-5 mt-4 rounded-xl bg-error-container p-3 text-sm text-on-error-container"
        >
          {t("error")}{" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => setAttempt((value) => value + 1)}
          >
            {t("retry")}
          </button>
        </p>
      )}
      <ul className="space-y-3 p-4 sm:p-5">
        {visibleRequests.map((request) => (
          <li
            key={request.id}
            className="group flex flex-col gap-4 rounded-2xl border border-outline-variant/30 bg-surface p-4 transition-colors hover:border-primary/30 hover:bg-primary/5 sm:flex-row sm:items-center sm:justify-between sm:p-5"
          >
            <div className="flex min-w-0 items-start gap-3">
              <span
                aria-hidden="true"
                className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
              >
                <span className="material-symbols-outlined">location_on</span>
              </span>
              <div className="min-w-0">
                <p className="break-words font-headline text-base font-extrabold text-on-surface sm:text-lg">
                  {(request.route
                    ? routeLabels(request.route, locale)
                    : request.city_names
                  ).join(" → ") || t("fallback")}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-on-surface-variant sm:text-sm">
                  <time dateTime={request.created_at}>
                    {new Date(request.created_at).toLocaleString(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </time>
                  <span className="inline-flex items-center gap-1">
                    <span
                      aria-hidden="true"
                      className="material-symbols-outlined !text-base"
                    >
                      calendar_month
                    </span>
                    {t("days", { count: request.num_days })}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${request.status === "complete" ? "bg-tertiary/10 text-tertiary" : request.status === "failed" ? "bg-error-container text-on-error-container" : "bg-secondary-fixed text-on-secondary-fixed-variant"}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`material-symbols-outlined !text-sm ${request.status === "processing" ? "motion-safe:animate-pulse" : ""}`}
                    >
                      {request.status === "complete"
                        ? "check_circle"
                        : request.status === "failed"
                          ? "error"
                          : "schedule"}
                    </span>
                    {t(request.status)}
                  </span>
                </div>
              </div>
            </div>
            <Link
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-on-primary shadow-sm transition-colors hover:bg-primary-container focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              href={
                request.status === "complete" && request.itinerary_id
                  ? `/itinerary/${encodeURIComponent(request.itinerary_id)}`
                  : `/plan/jobs/${encodeURIComponent(request.id)}`
              }
            >
              {t(
                request.status === "complete" && request.itinerary_id
                  ? "result"
                  : "status",
              )}
              <span
                aria-hidden="true"
                className="material-symbols-outlined !text-lg"
              >
                arrow_forward
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {pageCount > 1 && (
        <nav
          aria-label={t("pagination")}
          className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/30 bg-surface px-5 py-4 sm:px-6"
        >
          <p aria-live="polite" className="text-sm text-on-surface-variant">
            {t("page", { current: currentPage, total: pageCount })}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="min-h-11 rounded-full border border-primary/30 bg-surface-container-lowest px-4 py-2 text-sm font-bold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:border-outline-variant/40 disabled:text-on-surface-variant/40 disabled:hover:bg-surface-container-lowest"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              {t("previous")}
            </button>
            <button
              type="button"
              className="min-h-11 rounded-full border border-primary/30 bg-surface-container-lowest px-4 py-2 text-sm font-bold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:border-outline-variant/40 disabled:text-on-surface-variant/40 disabled:hover:bg-surface-container-lowest"
              disabled={currentPage === pageCount}
              onClick={() => setPage(currentPage + 1)}
            >
              {t("next")}
            </button>
          </div>
        </nav>
      )}
    </section>
  );
}
