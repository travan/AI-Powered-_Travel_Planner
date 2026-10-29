"use client";
import { useAppLanguage } from "../i18n/LanguageProvider";

import { UiText, useIssueText, useUiText } from "../i18n/UiText";
import React from "react";
import type { Itinerary } from "@travel/types";
export function JourneySummary({ plan }: { plan: Itinerary }) {
  const { locale: formattingLocale } = useAppLanguage();

  const issueText = useIssueText();
  const t = useUiText();
  if (!plan.planning) return null;
  const p = plan.planning,
    end = p.journey.return_to_origin ? p.journey.origin : p.journey.endpoint;
  // Travel days can already include the origin and final destination.
  // Collapse adjacent stops only, preserving actual returns later in the route.
  const route = [
    p.journey.origin.label,
    ...plan.days.map((day) => day.city),
    end?.label?.trim() || t("Chưa chọn điểm cuối"),
  ]
    .map((label) => label.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .filter(
      (label, index, stops) =>
        index === 0 ||
        label.normalize("NFC").toLowerCase() !==
          stops[index - 1]?.normalize("NFC").toLowerCase(),
    );
  return (
    <section
      className="space-y-4 rounded-2xl border border-primary/20 bg-primary-fixed/20 p-5"
      aria-label="Tóm tắt toàn hành trình"
    >
      <h2 className="text-xl font-bold">
        {" "}
        <UiText
          id="t9e83449deb8a"
          fallback="Từ điểm xuất phát đến điểm kết thúc"
        />{" "}
      </h2>
      <ol className="flex flex-wrap items-center gap-2">
        {route.map((label, i) => (
          <li key={`${label}-${i}`} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden>→</span>}
            <span className="rounded-full bg-surface px-3 py-2 text-sm font-semibold">
              {label}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-sm">
        {plan.num_days} <UiText id="tbbdc13ca8fc1" fallback="ngày ·" />{" "}
        {p.travelers.adults}{" "}
        <UiText id="t9e18682caa93" fallback="người lớn ·" />{" "}
        {p.travelers.child_ages.length}{" "}
        <UiText id="tad9c91035e8a" fallback="trẻ em ·" />{" "}
        {p.stay_preferences.rooms}{" "}
        <UiText id="t86f6edbb7eb6" fallback="phòng" />{" "}
      </p>
      <p className="text-sm">
        <strong>
          {plan.total_cost?.toLocaleString(formattingLocale)} {plan.currency}
        </strong>{" "}
        <UiText id="tb3428dd1453a" fallback="dự kiến cả nhóm. Ngân sách:" />{" "}
        {p.budget.total?.toLocaleString(formattingLocale) ?? (
          <UiText text="Chưa cố định" />
        )}{" "}
        {p.budget.currency}.
      </p>
      {!!plan.issues?.length && (
        <div className="rounded-xl bg-amber-50 p-4 text-amber-900">
          <h3 className="font-bold">
            {" "}
            <UiText
              id="te88abac489b8"
              fallback="Cần kiểm tra trước khi đặt"
            />{" "}
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {plan.issues.map((i, index) => (
              <li key={`${i.code}-${index}`}>
                {i.severity === "error" ? (
                  <UiText id="t9c526b9e1211" fallback="Cần sửa: " />
                ) : (
                  ""
                )}
                {issueText(i)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
