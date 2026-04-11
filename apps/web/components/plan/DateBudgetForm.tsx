"use client";

import type { FormState } from "./types";

const CURRENCIES = ["USD", "VND", "EUR", "JPY", "THB", "GBP", "AUD", "SGD"];

interface Props {
  form: FormState;
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
}

export function DateBudgetForm({ form, update }: Props) {
  return (
    <div className="space-y-6">
      {/* Date mode toggle */}
      <section className="space-y-3">
        <div className="flex gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700">
            <input
              type="radio"
              checked={!form.use_date_range}
              onChange={() => update("use_date_range", false)}
              className="accent-brand-600"
            />
            Number of days
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700">
            <input
              type="radio"
              checked={form.use_date_range}
              onChange={() => update("use_date_range", true)}
              className="accent-brand-600"
            />
            Date range
          </label>
        </div>

        {!form.use_date_range ? (
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={30}
              value={form.num_days}
              onChange={(e) => update("num_days", Number(e.target.value))}
              className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
            />
            <span className="text-sm text-gray-600">days</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">From</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => update("start_date", e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">To</label>
              <input
                type="date"
                value={form.end_date}
                min={form.start_date}
                onChange={(e) => update("end_date", e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              />
            </div>
          </div>
        )}
      </section>

      {/* Budget */}
      <section className="space-y-3">
        <h2 className="font-semibold text-gray-800">
          Budget{" "}
          <span className="font-normal text-gray-500 text-sm">(optional)</span>
        </h2>
        <div className="flex gap-2">
          <input
            type="number"
            min={0}
            value={form.budget}
            onChange={(e) => update("budget", e.target.value)}
            placeholder="e.g. 500"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
          />
          <select
            value={form.currency}
            onChange={(e) => update("currency", e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <p className="text-xs text-gray-500">
          Leave blank and we&apos;ll suggest an optimized budget for you.
        </p>
      </section>
    </div>
  );
}
