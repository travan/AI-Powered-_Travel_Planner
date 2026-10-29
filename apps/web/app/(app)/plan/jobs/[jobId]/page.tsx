"use client";
import {
  UiText,
  useUiText,
  useIssueText,
} from "../../../../../components/i18n/UiText";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "../../../../../lib/supabase/client";
import { getJourneyJob } from "../../../../../lib/journey-api";
import type { PlanningJob } from "@travel/types";
import { useTranslations } from "next-intl";
const LABELS: Record<string, string> = {
  queued: "Yêu cầu đang chờ xử lý",
  catalog: "Đang lấy dữ liệu địa điểm",
  overview: "Đang xây dựng khung hành trình",
  detail: "Đang lập lịch, lưu trú và ăn uống",
  validation: "Đang kiểm tra thời gian và chi phí",
  retry: "Đang chờ thử lại",
  complete: "Hành trình đã sẵn sàng",
  failed: "Không thể hoàn tất yêu cầu",
};
export default function JourneyJobPage() {
  const t = useUiText();
  const issueText = useIssueText();
  const requestsText = useTranslations("plannerUX.requests");
  const { jobId } = useParams<{ jobId: string }>(),
    router = useRouter();
  const [job, setJob] = useState<PlanningJob | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const {
          data: { session },
        } = await createClient().auth.getSession();
        if (!session) {
          router.replace(
            `/login?redirectTo=${encodeURIComponent(`/plan/jobs/${jobId}`)}`,
          );
          return;
        }
        const next = await getJourneyJob(
          jobId,
          session.access_token,
          abort.signal,
        );
        if (abort.signal.aborted) return;
        setJob(next);
        setError("");
        if (next.status === "complete" && next.itinerary_id) {
          router.replace(`/itinerary/${next.itinerary_id}`);
          return;
        }
        if (next.status === "failed") return;
      } catch (e) {
        if (abort.signal.aborted) return;
        setError(
          e instanceof Error
            ? e.message
            : "Không tải được trạng thái; đang kết nối lại.",
        );
      }
      timer = setTimeout(poll, 3000);
    };
    void poll();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [jobId, router]);
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
              code: job.error_code,
              params: job.error_params,
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
      {job?.status !== "failed" && (
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
