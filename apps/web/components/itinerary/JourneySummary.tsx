"use client";
import { useAppLanguage } from "../i18n/LanguageProvider";

import { UiText, useIssueText, useUiText } from "../i18n/UiText";
import React from "react";
import { itineraryRoute, routeLabels, type Itinerary } from "@travel/types";
export function JourneySummary({ plan }: { plan: Itinerary }) {
  const { locale: formattingLocale } = useAppLanguage();

  const issueText = useIssueText();
  const t = useUiText();
  const diagnosticCodes = new Set([
    "MEAL_MISSING",
    "ACTIVITIES_MISSING",
    "SCHEDULE_DETAILS_MISSING",
    "ACTIVITY_DETAILS_MISSING",
    "EVENING_MISSING",
    "HOTEL_RETURN_MISSING",
    "BUDGET_INCOMPLETE",
    "STAY_UNSELECTED",
    "STAY_NOT_SELECTED",
  ]);
  const issues = (plan.issues ?? []).filter(
    (issue) => !diagnosticCodes.has(issue.code),
  );
  const p = plan.planning;
  const route = routeLabels(itineraryRoute(plan), formattingLocale);
  if (p && !p.journey.return_to_origin && !p.journey.endpoint?.label.trim())
    route.push(t("Chưa chọn điểm cuối"));
  if (!route.length && !issues.length) return null;
  return (
    <section
      className="space-y-4 rounded-2xl border border-primary/20 bg-primary-fixed/20 p-5"
      aria-label={
        formattingLocale === "vi"
          ? "Tóm tắt toàn hành trình"
          : "Journey summary"
      }
    >
      {!!route.length && (
        <>
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
        </>
      )}
      {p && (
        <>
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
            {plan.budget_breakdown?.complete !== false &&
              plan.total_cost > 0 && (
                <strong>
                  {plan.total_cost.toLocaleString(formattingLocale)}{" "}
                  {plan.currency}
                  {" · "}
                </strong>
              )}
            {formattingLocale === "vi"
              ? "Ngân sách của bạn: "
              : "Your budget: "}
            {p.budget.total?.toLocaleString(formattingLocale) ??
              t("Chưa cố định")}{" "}
            {p.budget.currency}
          </p>
        </>
      )}
      {!!issues.length && (
        <div className="rounded-xl bg-amber-50 p-4 text-amber-900">
          <h3 className="font-bold">
            {" "}
            <UiText
              id="te88abac489b8"
              fallback="Cần kiểm tra trước khi đặt"
            />{" "}
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {issues.map((i, index) => (
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
