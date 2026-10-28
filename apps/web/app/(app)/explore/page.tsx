"use client";
import { UiText, useUiText } from "../../../components/i18n/UiText";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePopularCities } from "@travel/hooks";
import { SiteHeader } from "../../../components/layout/SiteHeader";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "";
const GRADIENT_FALLBACKS = [
  "from-primary/80 to-secondary/70",
  "from-secondary/80 to-tertiary/70",
  "from-tertiary/80 to-primary/70",
  "from-primary-container/90 to-secondary-container/80",
];

export default function ExplorePage() {
  const t = useUiText();

  const [query, setQuery] = useState("");
  const { cities, loading, error, getDisplayName } = usePopularCities(API_URL);

  const filteredCities = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return cities;

    return cities.filter((city) =>
      `${getDisplayName(city)} ${city.country} ${city.slug}`
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [cities, getDisplayName, query]);

  return (
    <div
      className="min-h-screen bg-background text-on-surface"
      data-testid="web-explore-page"
    >
      <SiteHeader />

      <main className="mx-auto max-w-7xl px-6 py-10 md:py-16">
        <section className="max-w-3xl space-y-5">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-primary">
            {" "}
            <UiText id="t0c70a7783569" fallback="Explore with Horizon" />{" "}
          </p>
          <h1 className="font-headline text-4xl font-extrabold tracking-tight md:text-6xl">
            {" "}
            <UiText id="t1b2060ba2a11" fallback="Find your next" />{" "}
            <span className="text-primary">
              {" "}
              <UiText id="t6982bc400b42" fallback="starting point." />{" "}
            </span>
          </h1>
          <p className="max-w-2xl text-base leading-7 text-on-surface-variant md:text-lg">
            {" "}
            <UiText
              id="ta75cdc7815a3"
              fallback="Browse AI-curated destinations, choose one that fits your mood, then adjust days, budget, travel style, and travelers in Plan."
            />{" "}
          </p>
        </section>

        <section className="mt-10 flex flex-col gap-4 rounded-2xl border border-outline-variant/20 bg-surface-container-low p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-headline text-lg font-bold">
              {" "}
              <UiText
                id="t69ab9e996b64"
                fallback="AI-curated destination ideas"
              />{" "}
            </p>
            <p className="text-sm text-on-surface-variant">
              {" "}
              <UiText
                id="taeb8860dcdb8"
                fallback="Start with a suggestion. Your final itinerary stays fully editable."
              />{" "}
            </p>
          </div>
          <label className="flex w-full items-center gap-3 rounded-full bg-surface px-4 py-3 ring-1 ring-outline-variant/30 focus-within:ring-2 focus-within:ring-primary md:max-w-sm">
            <span className="material-symbols-outlined text-primary">
              search
            </span>
            <span className="sr-only">
              {" "}
              <UiText id="t86cdde82421b" fallback="Search destinations" />{" "}
            </span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Search destination or country")}
              className="min-w-0 flex-1 bg-transparent text-sm text-on-surface outline-none placeholder:text-outline"
              data-testid="web-explore-search"
            />
          </label>
        </section>

        {loading && (
          <section
            className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
            aria-label={t("Loading destinations")}
          >
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <div
                key={item}
                className="h-80 animate-pulse rounded-2xl bg-surface-container-high"
              />
            ))}
          </section>
        )}

        {!loading && error && (
          <section className="mt-8 rounded-2xl border border-error/30 bg-error/10 p-6 text-sm text-error">
            {" "}
            <UiText
              id="t10b2b9a4db00"
              fallback="We could not load destinations right now. You can still start a custom plan."
            />{" "}
            <Link href="/plan" className="ml-2 font-semibold underline">
              {" "}
              <UiText id="t50bc96c61c87" fallback="Open Plan" />{" "}
            </Link>
          </section>
        )}

        {!loading && !error && filteredCities.length === 0 && (
          <section className="mt-8 rounded-2xl border border-outline-variant/30 bg-surface p-8 text-center">
            <p className="font-semibold">
              {" "}
              <UiText
                id="te354769b1183"
                fallback="No destinations match “"
              />{" "}
              {query}”.
            </p>
            <p className="mt-2 text-sm text-on-surface-variant">
              {" "}
              <UiText
                id="t0478e7aad57a"
                fallback="Try another city or build a custom plan."
              />{" "}
            </p>
            <Link
              href="/plan"
              className="mt-4 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary"
            >
              {" "}
              <UiText id="t50bc96c61c87" fallback="Open Plan" />{" "}
            </Link>
          </section>
        )}

        {!loading && !error && filteredCities.length > 0 && (
          <section
            className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
            data-testid="web-explore-results"
          >
            {filteredCities.map((city, index) => (
              <article
                key={city.slug}
                className="group overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
                data-testid="web-explore-card"
              >
                <div className="relative h-52 overflow-hidden">
                  {city.cover_image ? (
                    <img
                      src={city.cover_image}
                      alt={getDisplayName(city)}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div
                      className={`flex h-full w-full items-center justify-center bg-linear-to-br ${GRADIENT_FALLBACKS[index % GRADIENT_FALLBACKS.length]}`}
                    >
                      <span className="material-symbols-outlined text-8xl text-white/25">
                        travel_explore
                      </span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-linear-to-t from-on-surface/70 via-transparent to-transparent" />
                  {city.popular && (
                    <span className="absolute left-4 top-4 rounded-full bg-secondary-fixed px-3 py-1 text-[10px] font-black uppercase tracking-wider text-on-secondary-fixed">
                      {" "}
                      <UiText id="tdd985c6ea635" fallback="AI pick" />{" "}
                    </span>
                  )}
                  <div className="absolute bottom-4 left-4 text-white">
                    <h2 className="font-headline text-2xl font-bold">
                      {getDisplayName(city)}
                    </h2>
                    <p className="text-sm text-white/80">{city.country}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 p-5">
                  <div>
                    <p className="text-sm font-semibold text-on-surface">
                      {" "}
                      <UiText
                        id="t54135155f880"
                        fallback="Make it yours"
                      />{" "}
                    </p>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      {" "}
                      <UiText
                        id="t51e675944e99"
                        fallback="Tune the plan before generating."
                      />{" "}
                    </p>
                  </div>
                  <Link
                    href={`/plan?city=${encodeURIComponent(city.slug)}`}
                    className="shrink-0 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition hover:brightness-105"
                    data-testid="web-explore-customize"
                  >
                    {" "}
                    <UiText id="t239dce622324" fallback="Customize" />{" "}
                  </Link>
                </div>
              </article>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
