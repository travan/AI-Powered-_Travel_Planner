"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import { enUS, vi } from "react-day-picker/locale";
import { useTranslations } from "next-intl";
import { useAppLanguage } from "../i18n/LanguageProvider";
import "react-day-picker/style.css";

export function parsePlannerDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year!, month! - 1, day!, 12);
  return date.getFullYear() === year &&
    date.getMonth() === month! - 1 &&
    date.getDate() === day
    ? date
    : undefined;
}
export function formatPlannerDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function PlannerDatePicker({
  label,
  value,
  onChange,
  min,
  disabled = false,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  disabled?: boolean;
  className: string;
}) {
  const { locale } = useAppLanguage();
  const t = useTranslations("plannerUX");
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const selected = parsePlannerDate(value);
  const minimum = min ? parsePlannerDate(min) : undefined;
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else if (dialog.current?.open) dialog.current.close();
  }, [open]);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}{" "}
        <span aria-hidden="true" className="text-error">
          *
        </span>
      </label>
      <div className="relative">
        <input
          ref={trigger}
          id={id}
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={`${id}-calendar`}
          required
          readOnly
          disabled={disabled}
          value={
            selected
              ? new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-GB", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                }).format(selected)
              : ""
          }
          placeholder={t("date_placeholder")}
          className={`${className} cursor-pointer pr-12 disabled:cursor-not-allowed disabled:opacity-50`}
          onClick={() => setOpen(true)}
          onKeyDown={(e) => {
            if (["Enter", " ", "ArrowDown"].includes(e.key)) {
              e.preventDefault();
              setOpen(true);
            }
          }}
        />
        <button
          type="button"
          disabled={disabled}
          aria-label={t("open_calendar", { field: label })}
          onClick={() => setOpen(true)}
          className="absolute right-3 top-1/2 mt-1 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-primary hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40"
        >
          <svg
            aria-hidden="true"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <rect x="3" y="5" width="18" height="16" rx="3" />
            <path d="M7 3v4m10-4v4M3 11h18" />
          </svg>
        </button>
      </div>
      <dialog
        ref={dialog}
        id={`${id}-calendar`}
        aria-labelledby={`${id}-title`}
        onCancel={close}
        onClose={close}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        className="planner-calendar m-auto w-[min(360px,calc(100vw-24px))] max-h-[90dvh] overflow-auto rounded-3xl border border-outline-variant/30 bg-surface p-5 text-on-surface shadow-2xl backdrop:bg-black/30"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 id={`${id}-title`} className="text-lg font-bold">
            {t("calendar_for", { field: label })}
          </h3>
          <button
            type="button"
            onClick={close}
            className="rounded-full border border-outline-variant px-3 py-2 text-sm font-semibold"
          >
            {t("close_calendar")}
          </button>
        </div>
        {open && (
          <DayPicker
            mode="single"
            required
            selected={selected}
            defaultMonth={
              selected && (!minimum || selected >= minimum)
                ? selected
                : (minimum ?? new Date())
            }
            locale={locale === "vi" ? vi : enUS}
            weekStartsOn={1}
            captionLayout="dropdown"
            navLayout="after"
            formatters={{
              formatMonthDropdown: (date) =>
                locale === "vi"
                  ? t("calendar_month", { month: date.getMonth() + 1 })
                  : new Intl.DateTimeFormat("en", { month: "short" }).format(
                      date,
                    ),
            }}
            startMonth={new Date(2000, 0)}
            endMonth={new Date(2100, 11)}
            disabled={minimum ? { before: minimum } : undefined}
            autoFocus
            showOutsideDays
            onSelect={(date) => {
              if (date && (!min || formatPlannerDate(date) >= min)) {
                onChange(formatPlannerDate(date));
                close();
              }
            }}
          />
        )}
        {min && (
          <p className="mt-4 text-xs text-on-surface-variant">
            {t("return_after_departure")}
          </p>
        )}
      </dialog>
    </div>
  );
}
