"use client";
import { useAppLanguage } from "../i18n/LanguageProvider";

import { UiText, useUiText } from "../i18n/UiText";

import React from "react";
import { PlaceLookup } from "./PlaceLookup";
import { mapUrl } from "@travel/types";
import type { Activity, GoldenMoment, TicketOption } from "@travel/types";
import { Badge } from "@travel/ui";

// ─── Ticket chip ────────────────────────────────────────────────────────────
function TicketChip({ option }: { option: TicketOption }) {
  if (!option.url) return null;
  return (
    <a
      href={option.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium ring-1 ring-gray-300 hover:ring-brand-400 hover:text-brand-700 transition-colors"
    >
      {option.platform} · <UiText text="Search" />
      {option.price_from && (
        <span className="text-gray-400">
          {" "}
          <UiText id="t0b1e95cfd977" fallback="from" /> {option.price_from}
        </span>
      )}
    </a>
  );
}

// ─── Golden moment badge ─────────────────────────────────────────────────────
function GoldenBadge({ moment }: { moment: GoldenMoment }) {
  const icons: Record<string, string> = {
    sunrise: "🌅",
    sunset: "🌇",
    blue_hour: "🌆",
    golden_hour: "✨",
  };
  const type =
    typeof moment.type === "string" && moment.type
      ? moment.type
      : "special_moment";
  const bestTime = typeof moment.best_time === "string" ? moment.best_time : "";

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
      {icons[type] ?? "⭐"} {type.replace(/_/g, " ")}
      {bestTime && <> · {bestTime}</>}
    </span>
  );
}

// ─── Activity Card ───────────────────────────────────────────────────────────
interface ActivityCardProps {
  activity: Activity;
  index: number;
  city?: string;
  city_slug?: string;
}

export function ActivityCard({
  activity: original,
  index,
  city,
  city_slug,
}: ActivityCardProps) {
  const activity = {
    ...original,
    city: original.city ?? city,
    city_slug: original.city_slug ?? city_slug,
  };
  const t = useUiText();
  const { locale: formattingLocale } = useAppLanguage();

  const scheduleMeta = [activity.time, activity.duration]
    .filter(Boolean)
    .join(" · ");
  const ticketActivities = Array.isArray(activity.ticket_activities)
    ? activity.ticket_activities.filter(
        (ticket) =>
          ticket !== null &&
          typeof ticket === "object" &&
          typeof ticket.platform === "string" &&
          typeof ticket.url === "string",
      )
    : [];

  if (activity.kind) {
    const labels: Record<string, string> = {
      visit: "Tham quan",
      meal: "Ăn uống",
      cafe: "Café",
      transfer: "Di chuyển",
      check_in: "Nhận phòng",
      check_out: "Trả phòng",
      rest: "Nghỉ ngơi",
    };
    const source =
      activity.evidence?.source === "catalog"
        ? "Dữ liệu địa điểm"
        : activity.evidence?.source === "user"
          ? "Bạn cung cấp"
          : "Gợi ý AI — cần xác minh";
    const scope = {
      person: "/người",
      group: "/cả nhóm",
      room_night: "/phòng/đêm",
      segment: "/chặng",
    }[activity.price?.scope ?? "group"];
    return (
      <article className="mb-4 rounded-xl border border-outline-variant/30 bg-surface p-4">
        <div className="flex flex-wrap justify-between gap-2">
          <div>
            <p className="text-xs font-bold text-primary">
              {t(labels[activity.kind] ?? activity.kind)} · {scheduleMeta}
            </p>
            <h4 className="mt-1 font-bold">{activity.name}</h4>
            <p className="text-sm text-on-surface-variant">
              {activity.city} {activity.address && `· ${activity.address}`}
            </p>
          </div>
          <span className="text-sm">
            {activity.price?.amount != null ? (
              `${activity.price.amount.toLocaleString(formattingLocale)} ${activity.currency}${t(scope)}`
            ) : activity.cost != null ? (
              `${activity.cost.toLocaleString(formattingLocale)} ${activity.currency}${t("/cả nhóm")}`
            ) : (
              <UiText id="t1006ab49c0bf" fallback="Chưa có giá" />
            )}
          </span>
        </div>
        {activity.reason && <p className="mt-2 text-sm">{activity.reason}</p>}
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold text-primary">
            {" "}
            <UiText
              id="t01f214b4e130"
              fallback="Xem kế hoạch, nguồn & phương án thay thế"
            />{" "}
          </summary>
          <div className="mt-3 space-y-2 leading-6">
            <p>{activity.description}</p>
            {activity.travel_minutes != null && (
              <p>
                {" "}
                <UiText
                  id="t3ae9d22794ab"
                  fallback="Di chuyển từ điểm trước: khoảng"
                />{" "}
                {activity.travel_minutes}{" "}
                <UiText id="t41cdffb3a96c" fallback="phút." />{" "}
              </p>
            )}
            <p>
              {t(source)}
              {activity.evidence?.verified_at
                ? ` · Cập nhật ${activity.evidence.verified_at}`
                : ""}
            </p>
            {activity.alternative && (
              <p>
                {" "}
                <UiText id="t02b3d63ad0e6" fallback="Phương án khác:" />{" "}
                {activity.alternative}
              </p>
            )}
            <p>
              {activity.price?.status === "user_confirmed" ? (
                <UiText id="t58154db14870" fallback="Giá do bạn xác nhận" />
              ) : (
                <UiText
                  id="t470c0565dedc"
                  fallback="Chi phí ước tính; xác minh trước khi đặt."
                />
              )}
            </p>
          </div>
        </details>
        <a
          className="mt-3 inline-block text-sm font-semibold text-primary"
          href={mapUrl(activity)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {" "}
          {formattingLocale === "vi"
            ? activity.map_precision === "verified"
              ? "Mở vị trí trên bản đồ"
              : "Tìm trên bản đồ"
            : activity.map_precision === "verified"
              ? "Open location on Maps"
              : "Search on Maps"}{" "}
        </a>
        <div className="mt-3 flex flex-wrap gap-2">
          {ticketActivities.map((option, i) => (
            <TicketChip key={i} option={option} />
          ))}
        </div>
        {activity.map_precision !== "verified" && <PlaceLookup citySlug={activity.city_slug} name={activity.name} />}
      </article>
    );
  }

  return (
    <div className="relative flex gap-4">
      {/* Timeline dot */}
      <div className="flex flex-col items-center">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 ring-2 ring-brand-200">
          {index + 1}
        </div>
        <div className="mt-1 flex-1 w-px bg-gray-200" />
      </div>

      {/* Content */}
      <div className="mb-6 flex-1 rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-semibold text-gray-900">{activity.name}</h4>
              <span className="text-xs text-gray-500">{activity.city}</span>
              {typeof activity.category === "string" && activity.category && (
                <Badge variant="default" className="text-xs">
                  {activity.category.replace(/_/g, " ")}
                </Badge>
              )}
              {activity.golden_moment &&
                typeof activity.golden_moment === "object" && (
                  <GoldenBadge moment={activity.golden_moment} />
                )}
            </div>
            {scheduleMeta && (
              <p className="text-xs text-gray-400 mt-0.5">{scheduleMeta}</p>
            )}
          </div>
          {activity.cost != null && (
            <span className="text-sm font-medium text-emerald-700 whitespace-nowrap">
              ~{activity.currency ?? "USD"}{" "}
              {activity.cost.toLocaleString(formattingLocale)}
            </span>
          )}
        </div>

        {/* Description */}
        {activity.description && (
          <p className="text-sm text-gray-700 leading-relaxed">
            {activity.description}
          </p>
        )}

        {/* Tips */}
        {typeof activity.golden_moment?.tip === "string" &&
          activity.golden_moment.tip && (
            <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
              <span className="font-semibold">
                {" "}
                <UiText id="t2ee750e04190" fallback="Tip:" />{" "}
              </span>{" "}
              {activity.golden_moment.tip}
            </div>
          )}

        {/* Ticket options */}
        {ticketActivities.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {ticketActivities.map((t, i) => (
              <TicketChip key={i} option={t} />
            ))}
          </div>
        )}

        {/* Links */}
        <div className="flex flex-wrap gap-3 pt-1">
          {activity.maps_link && (
            <a
              href={mapUrl(activity)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-brand-600 hover:underline"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                  clipRule="evenodd"
                />
              </svg>{" "}
              {formattingLocale === "vi"
                ? activity.map_precision === "verified"
                  ? "Mở vị trí trên bản đồ"
                  : "Tìm trên bản đồ"
                : activity.map_precision === "verified"
                  ? "Open location on Maps"
                  : "Search on Maps"}{" "}
            </a>
          )}
          {activity.booking_link && (
            <a
              href={activity.booking_link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-500 hover:text-brand-600 hover:underline"
            >
              {" "}
              <UiText id="t0c130c933d48" fallback="Booking link" />{" "}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
