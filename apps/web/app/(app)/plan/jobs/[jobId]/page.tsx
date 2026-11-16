"use client";
import {
  UiText,
  useUiText,
  useIssueText,
} from "../../../../../components/i18n/UiText";

import React, { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "../../../../../lib/supabase/client";
import { getJourneyJob, notifyJobStatusChanged, retryJourneyJob } from "../../../../../lib/journey-api";
import { pollWhileVisible } from "@/lib/visible-poll";
import { ApiRequestError } from "@/lib/api";
import type { PlanningJob } from "@travel/types";
import { useLocale, useTranslations } from "next-intl";
const LABELS: Record<string, string> = {
  queued: "Yêu cầu đang chờ xử lý",
  catalog: "Đang lấy dữ liệu địa điểm",
  cache: "Đang kiểm tra lịch trình đã có",
  supplement: "Đang bổ sung dữ liệu còn thiếu",
  assembly: "Đang sắp xếp lịch trình",
  persist: "Đang lưu lịch trình",
  overview: "Đang xây dựng khung hành trình",
  detail: "Đang lập lịch, lưu trú và ăn uống",
  validation: "Đang kiểm tra thời gian và chi phí",
  retry: "Đang chờ thử lại",
  complete: "Hành trình đã sẵn sàng",
  failed: "Không thể hoàn tất yêu cầu",
};
export default function JourneyJobPage() {
  const t = useUiText();
  const locale = useLocale();
  const issueText = useIssueText();
  const requestsText = useTranslations("plannerUX.requests");
  const { jobId } = useParams<{ jobId: string }>(),
    router = useRouter();
  const [job, setJob] = useState<PlanningJob | null>(null),
    [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const retryKey = useRef<{ jobId: string; key: string } | undefined>(undefined);
  useEffect(() => {
    return pollWhileVisible(async (signal) => {
      try {
        const { data: { session } } = await createClient().auth.getSession();
        if (signal.aborted) return false;
        if (!session) {
          router.replace(`/login?redirectTo=${encodeURIComponent(`/plan/jobs/${jobId}`)}`);
          return false;
        }
        const next = await getJourneyJob(jobId, session.access_token, signal);
        if (signal.aborted) return false;
        setJob(next);
        setError("");
        if (next.status === "complete" || next.status === "failed") {
          notifyJobStatusChanged();
          if (next.itinerary_id) router.replace(`/itinerary/${next.itinerary_id}`);
          return false;
        }
        return true;
      } catch (e) {
        if (signal.aborted) return false;
        setError(e instanceof Error ? e.message : "Không tải được trạng thái; đang kết nối lại.");
        if (e instanceof ApiRequestError) {
          if ([401, 403, 404].includes(e.status)) return false;
          return e.retryAfterMs ?? true;
        }
        return true;
      }
    });
  }, [jobId, router]);

  const retry = async () => {
    if (retrying || !window.confirm(t("Thử lập lại lịch trình này?"))) return;
    setRetrying(true);
    try {
      const { data: { session } } = await createClient().auth.getSession();
      if (!session) return;
      if (retryKey.current?.jobId !== jobId)
        retryKey.current = { jobId, key: crypto.randomUUID() };
      const result = await retryJourneyJob(jobId, session.access_token, retryKey.current.key);
      notifyJobStatusChanged();
      setJob(null);
      router.replace(`/plan/jobs/${result.job_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể thử lại.");
    } finally {
      setRetrying(false);
    }
  };
  const retryAt = job?.error_code === "AI_QUOTA_EXHAUSTED" &&
    typeof job.error_params?.retry_at === "string"
    ? Date.parse(job.error_params.retry_at) : NaN;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const delay = retryAt - Date.now();
    if (!Number.isFinite(delay) || delay <= 0) return;
    const timer = window.setTimeout(() => setNow(Date.now()), delay + 100);
    return () => window.clearTimeout(timer);
  }, [retryAt]);
  const resetTime = Number.isFinite(retryAt)
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh",
      }).format(retryAt)
    : "";
  return (
    <main className="mx-auto max-w-xl space-y-6 px-5 py-20">
      <p className="text-sm font-bold text-primary">
        {" "}
        <UiText id="t868f6c8e3c1e" fallback="HÀNH TRÌNH CỦA BẠN" />{" "}
      </p>
      <h1 className="text-3xl font-black">
        {t(LABELS[job?.stage ?? "queued"] ?? "Đang xử lý")}
      </h1>
      <p role="status">
        {job?.status === "failed" ? (
          job.error_code ? (
            issueText({
              code: job.error_code === "PLANNING_INVALID" &&
                typeof job.error_params?.reason === "string"
                ? job.error_params.reason
                : job.error_code,
              params: { ...job.error_params, retry_time: resetTime },
              message: job.error ?? undefined,
            })
          ) : (
            <UiText text={job.error ?? "Không thể hoàn tất yêu cầu"} />
          )
        ) : (
          <UiText
            id="tcc0937e09e26"
            fallback="Bạn có thể tải lại trang hoặc quay lại sau; yêu cầu đã được lưu."
          />
        )}
      </p>
      {job?.status === "failed" && job.kind === "generate" && job.error_code !== "PLANNING_INVALID" && (
        <button type="button" disabled={retrying || retryAt > now} onClick={() => void retry()} className="rounded-full bg-primary px-5 py-3 text-white">
          {t("Thử lại")}
        </button>
      )}
      {job?.status !== "failed" && job?.status !== "complete" && (
        <div className="h-2 animate-pulse rounded-full bg-primary/30" />
      )}
      {error && (
        <p role="alert" className="text-error">
          <UiText text={error} />
        </p>
      )}
      <p className="text-sm text-on-surface-variant">
        {requestsText("return_hint")}
      </p>
      <Link
        className="inline-block rounded-full border border-primary px-5 py-3 font-semibold text-primary"
        href="/plan"
      >
        {" "}
        <UiText id="t44a1a7c46056" fallback="Quay lại bộ lập kế hoạch" />{" "}
      </Link>
    </main>
  );
}
