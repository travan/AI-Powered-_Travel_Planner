"use client";
import { pollWhileVisible } from "@/lib/visible-poll";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  applyItineraryTranslation,
  type Itinerary,
  type ItineraryTranslation,
} from "@travel/types";
import { useAppLanguage } from "../i18n/LanguageProvider";
import { useIssueText } from "../i18n/UiText";
import { ApiRequestError } from "../../lib/api";
import {
  getJourneyJob,
  journeyRequest,
  notifyJobStatusChanged,
} from "../../lib/journey-api";

type TranslationList = {
  source_version: string;
  source: Itinerary;
  translations: ItineraryTranslation[];
};
type DisplayError = { code: string; params?: Record<string, string | number> };
function translationError(
  error: unknown,
  fallback = "TRANSLATION_FAILED",
): DisplayError {
  return error instanceof ApiRequestError && error.code
    ? { code: error.code, params: error.params }
    : { code: fallback };
}
export function TranslationControls({
  plan,
  path,
  token,
  onChange,
}: {
  plan: Itinerary;
  path: string;
  token: string;
  onChange: (plan: Itinerary | null) => void;
}) {
  const t = useTranslations("translations");
  const issueText = useIssueText();
  const { locale, setLocale } = useAppLanguage();
  const [data, setData] = useState<TranslationList | null>(null);
  const [status, setStatus] = useState<"idle" | "queued" | "processing">(
    "idle",
  );
  const [selected, setSelected] = useState("original");
  const [error, setError] = useState<DisplayError | null>(null);
  const [jobId, setJobId] = useState<string>();
  const epoch = useRef(0);
  const attempted = useRef(new Set<string>());
  const submitting = useRef(false);
  useEffect(() => {
    const current = ++epoch.current;
    setData(null);
    setSelected("original");
    onChange(null);
    setJobId(undefined);
    setStatus("idle");
    setError(null);
    attempted.current.clear();
    submitting.current = false;
    const abort = new AbortController();
    journeyRequest<TranslationList>(path, token, undefined, "GET", abort.signal)
      .then((result) => {
        if (current === epoch.current && !abort.signal.aborted) setData(result);
      })
      .catch((e) => {
        if (!abort.signal.aborted && current === epoch.current)
          setError(translationError(e, "TRANSLATION_LOAD_FAILED"));
      });
    return () => {
      abort.abort();
      epoch.current++;
    };
  }, [plan, path, token, onChange]);
  useEffect(() => {
    if (!jobId) return;
    const current = epoch.current;
    return pollWhileVisible(async (signal) => {
      try {
        const job = await getJourneyJob(jobId, token, signal);
        if (signal.aborted || current !== epoch.current) return false;
        if (job.status === "failed") {
          notifyJobStatusChanged();
          throw new ApiRequestError(
            "Translation failed",
            500,
            job.error_code ?? "TRANSLATION_FAILED",
            job.error_params,
          );
        }
        if (job.status === "complete") {
          notifyJobStatusChanged();
          const result = await journeyRequest<TranslationList>(
            path,
            token,
            undefined,
            "GET",
            signal,
          );
          if (signal.aborted || current !== epoch.current) return false;
          setData(result);
          setStatus("idle");
          setJobId(undefined);
          return false;
        }
        setStatus(job.status === "processing" ? "processing" : "queued");
        return true;
      } catch (e) {
        if (e instanceof ApiRequestError && e.status === 429)
          return e.retryAfterMs ?? true;
        if (!signal.aborted && current === epoch.current) {
          setError(translationError(e));
          setStatus("idle");
          setJobId(undefined);
        }
        return false;
      }
    });
  }, [jobId, path, token]);
  const translate = useCallback(
    async (target: "en" | "vi") => {
      if (!data || submitting.current) return;
      const current = epoch.current;
      submitting.current = true;
      attempted.current.add(`${data.source_version}:${target}`);
      setError(null);
      setStatus("queued");
      try {
        // Submit the version already shown, never silently accept a newer source.
        const result = await journeyRequest<{
          job_id?: string;
          translation?: ItineraryTranslation;
        }>(path, token, {
          target_locale: target,
          source_version: data.source_version,
        });
        if (current !== epoch.current) return;
        if (result.translation) {
          setData((previous) =>
            previous
              ? {
                  ...previous,
                  translations: [
                    result.translation!,
                    ...previous.translations.filter(
                      (x) => x.target_locale !== target,
                    ),
                  ],
                }
              : previous,
          );
          setStatus("idle");
        } else if (result.job_id) setJobId(result.job_id);
        else throw new Error("Missing translation job");
      } catch (e) {
        if (current === epoch.current) {
          setStatus("idle");
          setError(translationError(e));
        }
      } finally {
        if (current === epoch.current) submitting.current = false;
      }
    },
    [data, path, token],
  );
  const sourceChanged =
    plan.version !== undefined &&
    data?.source.version !== undefined &&
    plan.version !== data.source.version;
  const available = sourceChanged
    ? []
    : (data?.translations.filter(
        (entry) => !entry.stale && entry.source_version === data.source_version,
      ) ?? []);
  useEffect(() => {
    if (
      !data ||
      sourceChanged ||
      status !== "idle" ||
      error ||
      plan.locale === locale ||
      !plan.locale ||
      available.some((entry) => entry.target_locale === locale) ||
      attempted.current.has(`${data.source_version}:${locale}`)
    )
      return;
    void translate(locale);
  }, [
    data,
    sourceChanged,
    status,
    error,
    plan.locale,
    locale,
    available,
    translate,
  ]);
  useEffect(() => {
    const entry =
      plan.locale === locale || sourceChanged
        ? undefined
        : data?.translations.find(
            (translation) =>
              !translation.stale &&
              translation.source_version === data.source_version &&
              translation.target_locale === locale,
          );
    try {
      onChange(
        entry && data
          ? applyItineraryTranslation(data.source, entry.texts)
          : null,
      );
      setSelected(entry?.target_locale ?? "original");
    } catch {
      setError({ code: "TRANSLATION_INVALID_TEXT" });
    }
  }, [data, locale, onChange, plan.locale, sourceChanged]);

  const choose = (value: string) => {
    const language = value === "original" ? plan.locale : value;
    setError(null);
    if (language === "vi" || language === "en") setLocale(language);
    else {
      onChange(null);
      setSelected("original");
    }
  };
  return (
    <section
      className="space-y-3 rounded-2xl border border-outline-variant/30 bg-surface p-4"
      aria-label={t("panel")}
    >
      <p className="text-sm">
        {t("source_language")}:{" "}
        <strong>
          {plan.locale === "vi"
            ? "Tiếng Việt"
            : plan.locale === "en"
              ? "English"
              : t("unknown")}
        </strong>
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium">
          {t("viewing")}{" "}
          <select
            value={selected}
            className="min-h-11 min-w-40 max-w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 text-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            onChange={(e) => choose(e.target.value)}
          >
            <option value="original">{t("original")}</option>
            {available.map((entry) => (
              <option key={entry.id} value={entry.target_locale}>
                {entry.target_locale === "vi" ? "Tiếng Việt" : "English"}
              </option>
            ))}
          </select>
        </label>
        {(["en", "vi"] as const)
          .filter((target) => target !== plan.locale)
          .map((target) => (
            <button
              key={target}
              type="button"
              disabled={!data || sourceChanged || status !== "idle"}
              onClick={() => {
                setLocale(target);
                void translate(target);
              }}
              className="rounded-full border border-primary px-4 py-2 text-sm font-bold text-primary disabled:opacity-50"
            >
              {t("translate_to", {
                language: target === "vi" ? "Tiếng Việt" : "English",
              })}
            </button>
          ))}
      </div>
      {(sourceChanged || data?.translations.some((entry) => entry.stale)) && (
        <p className="text-sm text-amber-800">{t("stale")}</p>
      )}
      {status !== "idle" && <p role="status">{t(status)}</p>}
      {plan.locale && plan.locale !== locale && selected === "original" && (
        <p role="status" className="text-sm text-amber-800">
          {t("showing_original")}
        </p>
      )}
      {error && (
        <div role="alert" className="text-sm text-error">
          <p>{issueText(error)}</p>
          {data && !sourceChanged && plan.locale !== locale && (
            <button
              type="button"
              disabled={status !== "idle"}
              onClick={() => void translate(locale)}
              className="mt-2 rounded-full border border-primary px-4 py-2 font-bold text-primary disabled:opacity-50"
            >
              {t("retry")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
