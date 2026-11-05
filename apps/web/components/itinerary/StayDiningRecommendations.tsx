"use client";
import { useAppLanguage } from "../i18n/LanguageProvider";
import { BookingLinks } from "./BookingLinks";
import { UiText } from "../i18n/UiText";
import React from "react";
import type { Itinerary } from "@travel/types";

function safeUrl(value?: string): string | undefined {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

export function StayDiningRecommendations({
  itinerary,
}: {
  itinerary: Itinerary;
}) {
  const { locale } = useAppLanguage();
  const hotels = (
    Array.isArray(itinerary.hotels) ? itinerary.hotels : []
  ).filter((hotel) => hotel && typeof hotel.name === "string");
  const restaurants = (
    Array.isArray(itinerary.restaurants) ? itinerary.restaurants : []
  ).filter((restaurant) => restaurant && typeof restaurant.name === "string");
  if (!hotels.length && !restaurants.length) return null;
  return (
    <section className="space-y-6" aria-label="Stays and local food">
      <p className="text-sm text-on-surface-variant">
        {" "}
        <UiText
          id="t891d52fbf1a8"
          fallback="Suggestions and estimated costs. Confirm availability, current prices and requirements before booking; no room or table has been reserved."
        />{" "}
      </p>
      {hotels.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xl font-bold">
            {" "}
            <UiText
              id="tdcf037cd304d"
              fallback="Where to stay & how to book"
            />{" "}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {hotels.map((hotel, index) => (
              <article
                key={`${hotel.name}-${index}`}
                className="space-y-3 rounded-xl border border-outline-variant/30 bg-surface p-5"
              >
                <h3 className="font-bold">{hotel.name}</h3>
                <p className="text-sm">{hotel.city}</p>
                <BookingLinks
                  links={hotel.booking_links}
                  context={`${hotel.name} · ${hotel.city ?? ""} · ${itinerary.days?.[0]?.date ?? ""} → ${itinerary.days?.at(-1)?.date ?? ""} · ${itinerary.num_travelers} ${locale === "vi" ? "khách" : "travelers"}`}
                />
                {hotel.estimate_basis !== "planning_estimate" && (
                  <p className="text-sm">
                    {hotel.price_per_night || hotel.price_range}
                  </p>
                )}
                {hotel.nightly_estimate != null &&
                  hotel.estimate_basis === "planning_estimate" && (
                    <p className="rounded-lg bg-primary-fixed/30 p-3 text-sm leading-6">
                      {locale === "vi" ? "Dự toán " : "Allowance "}
                      {hotel.nightly_estimate.toLocaleString(locale)}{" "}
                      {itinerary.currency}
                      {locale === "vi" ? "/phòng/đêm" : "/room/night"} ·{" "}
                      {hotel.rooms} {locale === "vi" ? "phòng" : "rooms"} ×{" "}
                      {hotel.nights} {locale === "vi" ? "đêm" : "nights"}.{" "}
                      {hotel.estimate_assumption}
                    </p>
                  )}
                {hotel.address && (
                  <p className="text-sm text-on-surface-variant">
                    {hotel.address}
                  </p>
                )}
                {hotel.note && (
                  <p className="whitespace-pre-line text-sm leading-6">
                    {hotel.note}
                  </p>
                )}
                <div className="flex flex-wrap gap-4 text-sm font-semibold text-primary">
                  {safeUrl(hotel.maps_link) && (
                    <a
                      href={safeUrl(hotel.maps_link)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {" "}
                      {locale === "vi"
                        ? "Tìm / mở bản đồ"
                        : "Search / open Maps"}{" "}
                    </a>
                  )}
                  {safeUrl(hotel.booking_url) && (
                    <a
                      href={safeUrl(hotel.booking_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {" "}
                      <UiText id="te6d063e238a0" fallback="Check rooms" />{" "}
                    </a>
                  )}
                  {safeUrl(hotel.airbnb_url) && (
                    <a
                      href={safeUrl(hotel.airbnb_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {" "}
                      <UiText id="ta057058dfa8a" fallback="Check rental" />{" "}
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
      {restaurants.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xl font-bold">
            {" "}
            <UiText
              id="t43e43c0dc2e0"
              fallback="Local restaurants & cafés by day"
            />{" "}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {restaurants.map((restaurant, index) => (
              <article
                key={`${restaurant.name}-${index}`}
                className="space-y-3 rounded-xl border border-outline-variant/30 bg-surface p-5"
              >
                <h3 className="font-bold">{restaurant.name}</h3>
                <p className="text-sm">
                  {restaurant.city} · {restaurant.time}
                </p>
                <p className="text-sm">
                  {restaurant.cuisine} ·{" "}
                  {restaurant.price_per_person || restaurant.price_range}
                </p>
                {restaurant.address && (
                  <p className="text-sm text-on-surface-variant">
                    {restaurant.address}
                  </p>
                )}
                {restaurant.note && (
                  <p className="whitespace-pre-line text-sm leading-6">
                    {restaurant.note}
                  </p>
                )}
                {safeUrl(restaurant.maps_link) && (
                  <a
                    href={safeUrl(restaurant.maps_link)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-primary"
                  >
                    {" "}
                    {locale === "vi"
                      ? "Tìm / mở bản đồ"
                      : "Search / open Maps"}{" "}
                  </a>
                )}
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
