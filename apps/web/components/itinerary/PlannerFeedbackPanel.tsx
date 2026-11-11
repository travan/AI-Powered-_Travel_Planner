"use client";

import React, { useState } from "react";
import { useAppLanguage } from "../i18n/LanguageProvider";
import { ApiRequestError } from "../../lib/api";
import { journeyRequest } from "../../lib/journey-api";

type FeedbackTarget =
  | { itineraryId: string; tripId?: never }
  | { tripId: string; itineraryId?: never };

export function PlannerFeedbackPanel({
  token,
  itineraryId,
  tripId,
}: FeedbackTarget & { token: string }) {
  const { locale } = useAppLanguage();
  const vi = locale === "vi";
  const [rating, setRating] = useState(5);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
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
      setMessage(vi ? "Đã ghi nhận phản hồi." : "Feedback received.");
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 403)
        setMessage(
          vi
            ? "Chỉ chủ lịch trình có thể đánh giá."
            : "Only the plan owner can review it.",
        );
      else
        setMessage(
          vi
            ? "Chưa gửi được phản hồi. Bạn có thể thử lại."
            : "Could not submit feedback. Please try again.",
        );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-4 rounded-2xl border border-outline-variant/30 bg-surface p-5">
      <h2 className="text-xl font-bold">
        {vi ? "Góp ý lịch trình" : "Itinerary feedback"}
      </h2>
      <p className="text-sm">
        {vi
          ? "Điểm và ghi chú bạn gửi sẽ được chuyển đến đội vận hành để cải thiện lịch trình."
          : "Your rating and note will be shared with the team to improve itineraries."}
      </p>
      <div className="grid min-w-0 gap-4">
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
            vi ? "Điều cần cải thiện lần sau" : "What should improve next time"
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
          {vi ? "Gửi phản hồi" : "Send feedback"}
        </button>
      </div>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </section>
  );
}
