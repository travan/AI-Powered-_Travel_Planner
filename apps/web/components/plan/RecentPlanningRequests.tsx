"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { PlanningJobSummary } from "@travel/types";
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
        setRequests(rows);
        setPage((value) =>
          Math.min(value, Math.max(1, Math.ceil(rows.length / PAGE_SIZE))),
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
      className="my-6 rounded-3xl border border-outline-variant/30 bg-surface p-5"
      aria-label={t("title")}
    >
      <h2 className="text-lg font-bold">{t("title")}</h2>
      <p className="mt-1 text-sm text-on-surface-variant">{t("hint")}</p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-error">
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
      <ul className="mt-3 divide-y divide-outline-variant/30">
        {visibleRequests.map((request) => (
          <li
            key={request.id}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <div>
              <p className="font-semibold">
                {request.city_names.join(" → ") || t("fallback")}
              </p>
              <p className="text-sm text-on-surface-variant">
                {new Date(request.created_at).toLocaleString(locale)} ·{" "}
                {t("days", { count: request.num_days })} · {t(request.status)}
              </p>
            </div>
            <Link
              className="rounded-full border border-primary px-4 py-2 text-sm font-semibold text-primary"
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
            </Link>
          </li>
        ))}
      </ul>
      {pageCount > 1 && (
        <nav
          aria-label={t("pagination")}
          className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/30 pt-4"
        >
          <p aria-live="polite" className="text-sm text-on-surface-variant">
            {t("page", { current: currentPage, total: pageCount })}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-full border border-primary px-4 py-2 text-sm font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-40"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              {t("previous")}
            </button>
            <button
              type="button"
              className="rounded-full border border-primary px-4 py-2 text-sm font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-40"
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
