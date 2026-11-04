"use client";
import React from "react";
import type { Itinerary } from "@travel/types";
import { useAppLanguage } from "../i18n/LanguageProvider";
export function WeatherPanel({ plan }: { plan: Itinerary }) {
  const { locale } = useAppLanguage();
  const vi = locale === "vi";
  if (!plan.weather?.length) return null;
  return (
    <section
      className="rounded-2xl border border-outline-variant/30 bg-surface p-5 space-y-3"
      aria-label={vi ? "Thời tiết theo ngày" : "Daily weather"}
    >
      <h2 className="text-xl font-bold">
        {vi
          ? "Thời tiết theo thành phố và ngày đi"
          : "Weather by city and travel date"}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {plan.weather.map((w) => (
          <article
            key={`${w.city_slug}:${w.date}`}
            className="rounded-xl bg-surface-container-low p-4 space-y-1 text-sm"
          >
            <h3 className="font-bold">
              {plan.city_catalog?.[w.city_slug]?.name[locale] ??
                plan.city_catalog?.[w.city_slug]?.name.en ??
                w.city_slug}{" "}
              · {w.date}
            </h3>
            <p>
              {w.reference_only &&
                (vi
                  ? "Tham khảo hôm nay; hãy chọn ngày đi để xem dự báo phù hợp. "
                  : "Today for reference; choose travel dates for a trip forecast. ")}
              {w.status === "forecast"
                ? vi
                  ? "Dự báo"
                  : "Forecast"
                : w.status === "climate"
                  ? vi
                    ? `Khí hậu trung bình tháng (${w.climate_period}); chưa có dự báo ngày đi`
                    : `Monthly climate normals (${w.climate_period}); travel-date forecast unavailable`
                  : vi
                    ? "Chưa có dữ liệu thời tiết cho ngày đi"
                    : "Weather unavailable for this travel date"}
              {w.partial
                ? vi
                  ? " · Dữ liệu một phần ngày"
                  : " · Partial day"
                : ""}
            </p>
            {w.temperature_min != null && w.temperature_max != null && (
              <p>
                {w.temperature_min.toFixed(1)}–{w.temperature_max.toFixed(1)} °C
                {w.precipitation_mm != null
                  ? ` · ${vi ? "Mưa" : "Rain"}: ${w.precipitation_mm.toFixed(1)} mm${w.status === "climate" ? (vi ? "/ngày trung bình" : "/day average") : ""}`
                  : ""}
              </p>
            )}
            {w.symbol && <p>{weatherDescription(w.symbol, vi)}</p>}
            {w.updated_at && (
              <p>
                {vi ? "Cập nhật" : "Updated"}:{" "}
                {new Date(w.updated_at).toLocaleString(locale, {
                  timeZone: w.timezone,
                })}{" "}
                ({w.timezone})
              </p>
            )}
            <a
              href={w.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              {w.source}
            </a>
            {w.source === "MET Norway" && (
              <span>
                {" "}
                ·{" "}
                <a
                  href="https://creativecommons.org/licenses/by/4.0/"
                  className="underline"
                >
                  CC BY 4.0
                </a>
              </span>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
function weatherDescription(symbol: string, vi: boolean) {
  const code = symbol.replace(/_(day|night|polartwilight)$/, "");
  const labels: Record<string, [string, string]> = {
    clearsky: ["Trời quang", "Clear sky"],
    fair: ["Ít mây", "Fair"],
    partlycloudy: ["Mây rải rác", "Partly cloudy"],
    cloudy: ["Nhiều mây", "Cloudy"],
    fog: ["Sương mù", "Fog"],
    rain: ["Mưa", "Rain"],
    lightrain: ["Mưa nhẹ", "Light rain"],
    heavyrain: ["Mưa to", "Heavy rain"],
    rainshowers: ["Mưa rào", "Rain showers"],
    snow: ["Tuyết", "Snow"],
    sleet: ["Mưa tuyết", "Sleet"],
  };
  return (
    labels[code]?.[vi ? 0 : 1] ??
    (code.includes("thunder")
      ? vi
        ? "Mưa dông"
        : "Thunderstorms"
      : code.includes("rain")
        ? vi
          ? "Có mưa"
          : "Rain expected"
        : code.includes("snow")
          ? vi
            ? "Có tuyết"
            : "Snow expected"
          : vi
            ? "Xem chi tiết tại nguồn dự báo"
            : "See forecast source for details")
  );
}
