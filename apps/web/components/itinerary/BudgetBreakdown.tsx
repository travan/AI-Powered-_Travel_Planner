"use client";
import React from "react";
import { useAppLanguage } from "../i18n/LanguageProvider";

import { UiText } from "../i18n/UiText";

import type { BudgetBreakdown as BudgetBreakdownType } from "@travel/types";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const COLORS = [
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

interface Props {
  breakdown: BudgetBreakdownType;
}

export function BudgetBreakdown({ breakdown }: Props) {
  const { locale: formattingLocale } = useAppLanguage();

  if (!breakdown) return null;

  const categories = [
    { label: "Accommodation", value: breakdown.accommodation ?? 0 },
    { label: "Food", value: breakdown.food ?? 0 },
    { label: "Activities", value: breakdown.activities ?? 0 },
    { label: "Transport", value: breakdown.transport ?? 0 },
    { label: "Contingency", value: breakdown.contingency ?? 0 },
  ].filter((c) => c.value > 0);

  if (!categories.length && breakdown.complete !== false) return null;

  const hasEstimates = breakdown.items?.some(
    (item) => item.basis === "planning_estimate",
  );
  const money = (value: number) =>
    value.toLocaleString(formattingLocale, { maximumFractionDigits: 2 });

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-gray-900 text-lg">
          {" "}
          <UiText id="tfa5c1ce38652" fallback="Budget Breakdown" />{" "}
        </h2>
        {breakdown.total > 0 && (
          <span className="whitespace-nowrap text-xl font-bold text-emerald-700">
            {breakdown.complete === false &&
              (formattingLocale === "vi"
                ? "Tạm tính các khoản đã có giá · "
                : "Subtotal of priced items · ")}
            {breakdown.currency ?? "USD"} {money(breakdown.total)}
          </span>
        )}
      </div>

      {hasEstimates && (
        <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">
          {formattingLocale === "vi"
            ? "Dự toán lập ngân sách, chưa phải báo giá. Mỗi khoản bên dưới ghi rõ giả định và tính cho cả nhóm; giá thực tế phụ thuộc ngày đi và lựa chọn dịch vụ."
            : "Planning allowances, not confirmed quotes. Item amounts below cover the entire group; actual prices depend on dates and service choices."}
        </p>
      )}
      {breakdown.complete === false && (
        <p
          role="status"
          className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900"
        >
          {formattingLocale === "vi"
            ? "Chỉ gồm các khoản đã có giá; chưa phải tổng chi phí chuyến đi."
            : "Includes priced items only; this is not the full trip cost."}
        </p>
      )}
      {breakdown.transport_details && (
        <div className="space-y-1 text-sm">
          {Object.entries(breakdown.transport_details)
            .filter(([, amount]) => amount != null && Number.isFinite(amount))
            .map(([kind, amount]) => (
              <p key={kind}>
                {
                  (
                    {
                      flight:
                        formattingLocale === "vi" ? "Vé máy bay" : "Flights",
                      intercity:
                        formattingLocale === "vi" ? "Liên tỉnh" : "Intercity",
                      airport_transfer:
                        formattingLocale === "vi"
                          ? "Đưa đón sân bay"
                          : "Airport transfers",
                      local:
                        formattingLocale === "vi"
                          ? "Đi lại nội đô"
                          : "Local transport",
                    } as Record<string, string>
                  )[kind]
                }
                :{" "}
                {amount == null
                  ? formattingLocale === "vi"
                    ? "Chưa có giá"
                    : "Unknown"
                  : `${amount.toLocaleString(formattingLocale)} ${breakdown.currency}`}
              </p>
            ))}
        </div>
      )}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        {/* Pie chart */}
        {categories.length > 0 && (
          <div className="h-48 w-full sm:w-48 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categories}
                  dataKey="value"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={72}
                  paddingAngle={2}
                >
                  {categories.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) =>
                    `${breakdown.currency ?? "USD"} ${value.toLocaleString(formattingLocale)}`
                  }
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Legend */}
        <ul className="flex-1 space-y-2">
          {categories.map((cat, i) => {
            const pct =
              breakdown.total && breakdown.total > 0
                ? Math.round((cat.value / breakdown.total) * 100)
                : 0;
            return (
              <li key={cat.label} className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full shrink-0"
                  style={{ background: COLORS[i % COLORS.length] }}
                />
                <span className="flex-1 text-sm text-gray-700">
                  <UiText text={cat.label} />
                </span>
                <span className="text-sm font-medium text-gray-900">
                  {breakdown.currency ?? "USD"} {money(cat.value)}
                </span>
                <span className="w-10 text-right text-xs text-gray-400">
                  {pct}%
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {!!breakdown.items?.length && (
        <details className="rounded-xl border border-gray-200 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-primary">
            {formattingLocale === "vi"
              ? "Dự toán từng khoản cho cả nhóm"
              : "Itemized group budget"}
          </summary>
          <ul className="mt-4 divide-y divide-gray-100">
            {breakdown.items.map((item) => (
              <li key={item.id} className="py-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">{item.label}</span>
                  <span className="whitespace-nowrap font-semibold">
                    {item.amount == null
                      ? formattingLocale === "vi"
                        ? "Chưa dự tính được"
                        : "Not estimated yet"
                      : `${breakdown.currency} ${money(item.amount)}`}
                  </span>
                </div>
                {item.assumption && (
                  <p className="mt-1 text-xs leading-5 text-gray-600">
                    {item.assumption}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {!!breakdown.missing_items?.length && (
        <div className="text-sm text-amber-900">
          <p className="font-semibold">
            {formattingLocale === "vi"
              ? "Các khoản chưa dự tính được"
              : "Items not estimated yet"}
          </p>
          <ul className="mt-2 list-disc pl-5">
            {breakdown.missing_items.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      {/* Per person / per day */}
      {breakdown.complete !== false &&
        (breakdown.per_person != null || breakdown.per_day != null) && (
          <div className="flex flex-wrap gap-4 border-t border-gray-100 pt-4">
            {breakdown.per_person != null && (
              <div className="text-sm text-gray-600">
                <span className="font-medium">
                  {" "}
                  <UiText id="tb9da4f7105fa" fallback="Per person:" />{" "}
                </span>{" "}
                {breakdown.currency ?? "USD"} {money(breakdown.per_person)}
              </div>
            )}
            {breakdown.per_day != null && (
              <div className="text-sm text-gray-600">
                <span className="font-medium">
                  {" "}
                  <UiText id="t83ec4f36d5e9" fallback="Per day:" />{" "}
                </span>{" "}
                {breakdown.currency ?? "USD"} {money(breakdown.per_day)}
              </div>
            )}
          </div>
        )}
    </div>
  );
}
