"use client";
import React, { useEffect, useState } from "react";
import type { Itinerary, LearningSettings } from "@travel/types";
import { useAppLanguage } from "../i18n/LanguageProvider";
import { journeyRequest } from "../../lib/journey-api";
import { fetchWithLocalSession } from "../../lib/session-fetch";
export function PlannerLearningPanel({
  plan,
  token,
  itineraryId,
  tripId,
}: {
  plan: Itinerary;
  token: string;
  itineraryId?: string;
  tripId?: string;
}) {
  const { locale } = useAppLanguage(),
    vi = locale === "vi";
  const [settings, setSettings] = useState<LearningSettings>(),
    [rating, setRating] = useState(5),
    [note, setNote] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    journeyRequest<LearningSettings>("learning/settings", token)
      .then((s) => {
        if (active) setSettings(s);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [token]);
  const change = async (patch: Partial<LearningSettings>) => {
    setBusy(true);
    setMessage("");
    try {
      const next = await journeyRequest<LearningSettings>(
        "learning/settings",
        token,
        patch,
        "PATCH",
      );
      setSettings(next);
    } catch {
      setMessage(vi ? "Không lưu được lựa chọn." : "Could not save settings.");
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    setBusy(true);
    setMessage("");
    try {
      await journeyRequest(
        tripId
          ? `trips/${tripId}/learning-feedback`
          : `itinerary/${itineraryId}/feedback`,
        token,
        { rating, note },
      );
      setMessage(
        vi
          ? "Đã lưu phản hồi. Các lần tạo sau sẽ tham khảo yêu cầu và chi tiêu đã duyệt của bạn."
          : "Feedback saved. Future plans can use your preferences and approved spending.",
      );
    } catch {
      setMessage(
        vi
          ? "Không lưu được phản hồi. Chỉ chủ lịch trình có thể đánh giá."
          : "Could not save feedback. Only the plan owner can review it.",
      );
    } finally {
      setBusy(false);
    }
  };
  const download = async () => {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetchWithLocalSession(
        `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/learning/dataset`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      if (!r.ok) throw new Error();
      const text = await r.text();
      if (!text.trim()) {
        setMessage(
          vi
            ? "Chưa có mẫu đủ điều kiện. Hãy đánh giá lịch trình tốt từ 4–5 sao."
            : "No eligible samples yet. Review a good itinerary with 4–5 stars.",
        );
        return;
      }
      const url = URL.createObjectURL(
        new Blob([text], { type: "application/x-ndjson" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "travel-training-data.jsonl";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setMessage(
        vi ? "Chưa thể xuất dataset." : "Could not export the dataset.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="space-y-4 rounded-2xl border border-outline-variant/30 bg-surface p-5"
      aria-label={
        vi ? "Ghi nhớ và cải thiện lịch trình" : "Planning memory and feedback"
      }
    >
      <h2 className="text-xl font-bold">
        {vi ? "Giúp lịch trình sau phù hợp hơn" : "Improve your next itinerary"}
      </h2>
      <p className="text-sm">
        {vi
          ? "Lịch sử tạo, chỉnh sửa và chi tiêu giúp gợi ý sau phù hợp hơn với nhu cầu của bạn."
          : "Your planning history, changes and spending help personalize future suggestions."}
      </p>
      {plan.learning_summary &&
        (plan.learning_summary.past_plans > 0 ||
          plan.learning_summary.approved_expense_samples > 0) && (
          <p className="text-sm">
            {vi ? "Lịch sử có" : "Planning history"}:{" "}
            {plan.learning_summary.past_plans}{" "}
            {vi ? "lịch trình; đã tham khảo" : "previous plans; consulted"}{" "}
            {plan.learning_summary.approved_expense_samples}{" "}
            {vi
              ? "khoản chi đã duyệt, cùng thành phố/tiền tệ/số người."
              : "approved expense samples matching city, currency and group size."}
          </p>
        )}
      {settings && (
        <div className="space-y-2 text-sm">
          <label className="flex items-start gap-3 leading-6">
            <input
              className="mt-1 h-4 w-4 shrink-0 accent-primary"
              type="checkbox"
              disabled={busy}
              checked={settings.memory_enabled}
              onChange={(e) => change({ memory_enabled: e.target.checked })}
            />
            {vi
              ? "Dùng lịch sử riêng của tôi để gợi ý tốt hơn"
              : "Use my private history for better suggestions"}
          </label>
          <label className="flex items-start gap-3 leading-6">
            <input
              className="mt-1 h-4 w-4 shrink-0 accent-primary"
              type="checkbox"
              disabled={busy}
              checked={settings.training_consent}
              onChange={(e) => change({ training_consent: e.target.checked })}
            />
            {vi
              ? "Cho phép chuẩn bị dataset đã lọc từ lịch trình tôi đánh giá tốt"
              : "Prepare filtered training samples from plans I rate positively"}
          </label>
          <p className="text-xs text-on-surface-variant">
            {vi
              ? "Dataset xuất theo tài khoản, loại bỏ yêu cầu tự do, tên người, địa chỉ, ngày đi cụ thể và mã đặt chỗ. Không tự gửi đi để huấn luyện."
              : "Exports are account-scoped and exclude free-text requests, personal names, addresses, exact dates and booking references. No automatic training upload."}
          </p>
        </div>
      )}
      {(itineraryId || tripId) && (
        <div className="grid min-w-0 gap-4 border-t border-outline-variant/30 pt-4">
          <label className="flex flex-wrap items-center gap-3 text-sm font-medium">
            {vi ? "Đánh giá lịch trình" : "Rate this itinerary"}
            <select
              aria-label={vi ? "Đánh giá lịch trình" : "Rate this itinerary"}
              value={rating}
              disabled={busy}
              onChange={(e) => setRating(Number(e.target.value))}
              className="w-28 rounded-xl border border-outline-variant bg-surface-container-lowest py-2 pl-3 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} / 5
                </option>
              ))}
            </select>
          </label>
          <textarea
            rows={4}
            className="block min-h-28 w-full min-w-0 resize-y rounded-xl border border-outline-variant bg-surface-container-lowest p-3 text-sm leading-6 text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary"
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label={
              vi
                ? "Điều cần cải thiện lần sau"
                : "What should improve next time"
            }
            placeholder={
              vi
                ? "Ví dụ: thêm quán địa phương, giảm thời gian di chuyển, ưu tiên chi phí ăn uống…"
                : "For example: more local food, less travel time, adjust meal spending…"
            }
          />
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="min-h-11 justify-self-start rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary disabled:opacity-50"
          >
            {vi ? "Lưu phản hồi" : "Save feedback"}
          </button>
        </div>
      )}
      {settings?.training_consent && (
        <button
          type="button"
          disabled={busy}
          onClick={download}
          className="text-sm text-primary underline"
        >
          {vi
            ? "Tải dataset huấn luyện JSONL"
            : "Download training dataset (JSONL)"}
        </button>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </section>
  );
}
