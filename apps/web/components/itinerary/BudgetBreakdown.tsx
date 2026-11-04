"use client";
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

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 text-lg">
          {" "}
          <UiText id="tfa5c1ce38652" fallback="Budget Breakdown" />{" "}
        </h2>
        {breakdown.total != null && (
          <span className="text-xl font-bold text-emerald-700">
            {breakdown.currency ?? "USD"}{" "}
            {breakdown.total.toLocaleString(formattingLocale)}
          </span>
        )}
      </div>

      {breakdown.complete === false && (
        <p
          role="status"
          className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900"
        >
          {formattingLocale === "vi"
            ? "Tổng tạm tính các khoản đã có giá. Chưa bao gồm: "
            : "Subtotal of priced items. Not yet included: "}
          {breakdown.missing_items?.join(", ")}
        </p>
      )}
      {breakdown.transport_details && (
        <div className="space-y-1 text-sm">
          {Object.entries(breakdown.transport_details).map(([kind, amount]) => (
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
                  {breakdown.currency ?? "USD"}{" "}
                  {cat.value.toLocaleString(formattingLocale)}
                </span>
                <span className="w-10 text-right text-xs text-gray-400">
                  {pct}%
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Per person / per day */}
      {(breakdown.per_person != null || breakdown.per_day != null) && (
        <div className="flex flex-wrap gap-4 border-t border-gray-100 pt-4">
          {breakdown.per_person != null && (
            <div className="text-sm text-gray-600">
              <span className="font-medium">
                {" "}
                <UiText id="tb9da4f7105fa" fallback="Per person:" />{" "}
              </span>{" "}
              {breakdown.currency ?? "USD"}{" "}
              {breakdown.per_person.toLocaleString(formattingLocale)}
            </div>
          )}
          {breakdown.per_day != null && (
            <div className="text-sm text-gray-600">
              <span className="font-medium">
                {" "}
                <UiText id="t83ec4f36d5e9" fallback="Per day:" />{" "}
              </span>{" "}
              {breakdown.currency ?? "USD"}{" "}
              {breakdown.per_day.toLocaleString(formattingLocale)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
