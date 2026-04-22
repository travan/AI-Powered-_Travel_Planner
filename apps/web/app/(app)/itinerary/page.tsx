"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SiteHeader } from "../../../components/layout/SiteHeader";

// ─── Image constants ──────────────────────────────────────────────────────────

const HERO_IMG =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuCqSVQFRSZ2d4LsS9gVGLTDL-YDI6xG-l2GlQYC70ET76zQm3vUfBz6vvkktSCDcsbEbmS2UONTrdNRrwMZSJN837oZyvcCv9LxoTnAJor2vuH_FcSSaekCtieCDcvfqlZyBN_GOoixiwpRr4mEs7X14ooIUZ96OFZHIoGt76fsdV1Sm8MlYi0cuWMQMoXUE_ZGtYFBUhkN6RmYMjibkkgSHY_PVZBCe7ySbF73vQcYHAPNZB71kzPB5fQribcEp377IsKf1Of_03w";

const MAP_IMG =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuA2I0rxA9dbT86C3xch1yYw9H2ZckXHgxe9vmrgdhVEh36mA_aNuvBj1LypEsF1ojpXX0gonlnhZBt4yY3Mxer5YGwwp8g-cSWJ0m6l74ud1MfDc_9PUj4SA0dhN8xH3Eno9aYbC32j9DJOpouVREX_bYZ64T_LSAodEi19JimHJcEYUI-iGwDnh9jLsHkvsPWauPiwhnxfwBw1gLojORo_fm7AunuoSHTT2KU0ZIDUmQrrxUM_Xk4VSpta3ilwBUwwe75cXlc9_W0";

const MAP_MOBILE_IMG =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuD6VLYw_CME8SGHjECHWxPrxbwbW1IlurGnE75IFVkSY9g4E_y9UWq7TuzrCzY5lUGRElDgJcYwr1zkLcqHjn7UWKdj1WSVDg5VqQou_QL7eujklWXyV-Svz6jd__II4Vk2dD_BF5cCzhGn_t_U1piBbhqOKfeAq0Jh_SAWbOGnhaixidyO5j7v77ry0k3bBA79jtdZp8cLcYfLcURVyjKE6WsOmEWOM1I672jBjU-alaKdR-QCpJxqUSyersDeKTyApsqcXWu2bkM";

const VILLA_IMG =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuDW1KxBW0W7k0TXEd9H_T9h5JFebofp_i_MS2CCwKDx_9CczQnA9JWvwjRHIiSRar4OWjVzlanC2bpWFrxGa9nZFAX2sqRKcbGVrrS_58tXNgkpGg16whh_0c_w4t1eyfgp3-8OblIYNMn4AtIgge9EuEYbXAvGu7qeOcmp0D6uASC-KeMPwlS5v6-bxxNw1JLDv-N0ZkRXS_eZA5Xqemgm-uBpmn3jPysgZaU6UT3FBgLsx1IVNtcNwBU2Z49VHmDEta3L2bfI2zw";

const DINNER1_IMG =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuDg2FquGkJeyqXpFuqW4ptK1ynz9YWD_KonrnB3txa41TiW5GwswpiGrj7bpnDFPHbY71qXOdshOn28KSvIL58bFZREJp2V95oy9x4GPvIV_UzD2IbUbCDu_QNEsKuELkOCM55_zcPr1ToBINj6TICfnGPw9LQBBGVpqn9u67l-C52RzEz8M5fMo_mCQ39F8YlKn1pagm_fa36t3k-23rcs5ntxMPP72idujmMMOx3PFahMLGWfD1XJ8nfEjtImKSiXt_nzKuSvnXw";

const DINNER2_IMG =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuD5FjL6k3ptMPCOk-S_lop1UZNJsMcNcmyY_ght7NFFn21LsJDS5Da9k7V1EMxufLKuoslengZ0DFwBqIuLQY7D6mW8vCspW-yTs1l2nZcIfZF_DACR90TglK9ynbhJttxcLMovDY1e1m5frYVwxvcqb4_WGx4W9wxn1DlpdeREY5TsYkdoJvDfVuTpJu5f2EUXdibBWz4vH1pRK91zqgrb3SKuxmUrmNEai8P8yWLoC2kDgii29XfAxy41FP7Rp9HH7Ww7UML8pnA";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Activity {
  time: string;
  icon: string;
  title: string;
  desc: string;
  cost?: string;
  badge?: { label: string; bg: string; color: string };
  photo?: string;
}

interface Day {
  label: string;
  date: string;
  activities: Activity[];
  faded?: boolean;
}

// ─── Static data ──────────────────────────────────────────────────────────────

const DAYS: Day[] = [
  {
    label: "Day 1",
    date: "Tuesday, Oct 12",
    activities: [
      {
        time: "9:00 AM",
        icon: "architecture",
        title: "Kinkaku-ji (Golden Pavilion)",
        desc: "Morning visit before the crowds arrive.",
        cost: "$7",
      },
      {
        time: "1:00 PM",
        icon: "dinner_dining",
        title: "Lunch at Nishiki Market",
        desc: "Explore Japan's kitchen; try tofu skewers & fresh mochi.",
        cost: "$15",
      },
      {
        time: "4:00 PM",
        icon: "forest",
        title: "Arashiyama Bamboo Grove",
        desc: "Late-afternoon light for ideal photos.",
      },
    ],
  },
  {
    label: "Day 2",
    date: "Wednesday, Oct 13",
    faded: true,
    activities: [
      {
        time: "10:00 AM",
        icon: "shrine",
        title: "Fushimi Inari Shrine",
        desc: "Hike the iconic torii gate trail.",
        cost: "Free",
      },
      {
        time: "3:00 PM",
        icon: "shopping_bag",
        title: "Gion District",
        desc: "Traditional arts, craft shops & tea houses.",
      },
    ],
  },
];

const MOBILE_DAYS: Day[] = [
  {
    label: "Day 1",
    date: "Mon, Aug 12",
    activities: [
      {
        time: "09:30 AM",
        icon: "directions_boat",
        title: "Arrival at Positano Port",
        desc: "Ferry arrival from Salerno. Meet the private shuttle at the main pier entrance.",
        badge: { label: "Google Maps", bg: "bg-surface-container", color: "text-on-surface-variant" },
      },
      {
        time: "02:00 PM",
        icon: "home",
        title: "Check-in: Villa Margherita",
        desc: "Door code: 1288#. Host Maria will meet you for a brief tour of the terrace and amenities.",
        badge: { label: "Airbnb", bg: "bg-secondary-fixed", color: "text-on-secondary-fixed-variant" },
        photo: VILLA_IMG,
      },
    ],
  },
];

const DINNER_SUGGESTIONS = [
  { name: "Chez Black", cuisine: "Seafood", price: "$$$", rating: "4.9", img: DINNER1_IMG },
  { name: "Da Vincenzo", cuisine: "Authentic", price: "$$", rating: "4.7", img: DINNER2_IMG },
  { name: "La Tagliata", cuisine: "Coastal", price: "$$", rating: "4.8", img: DINNER1_IMG },
];

// ─── Component ────────────────────────────────────────────────────────────────

function ItineraryContent() {
  const params = useSearchParams();
  const cities = params.get("cities")?.split(",") ?? ["Kyoto", "Osaka"];
  const destination = cities[0] ?? "Kyoto";

  const spent = 3420;
  const total = 4500;
  const pct = Math.round((spent / total) * 100);

  return (
    <div className="bg-background text-on-surface min-h-screen">
      <SiteHeader />

      {/* ═══════════════════════ MOBILE LAYOUT ═══════════════════════ */}
      <div className="md:hidden pb-32">
        <main className="pt-24 px-6">
          {/* Hero card */}
          <section className="mb-8">
            <div className="relative h-48 w-full rounded-xl overflow-hidden mb-6">
              <img className="w-full h-full object-cover" alt="Amalfi Coast" src={HERO_IMG} />
              <div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-4 left-6">
                <h1 className="text-white text-3xl font-extrabold font-headline tracking-tight">
                  Amalfi Coast Escape
                </h1>
                <p className="text-white/80 font-medium">Aug 12 - Aug 19</p>
              </div>
            </div>

            {/* Budget card */}
            <div className="bg-surface-container-lowest rounded-xl p-6 shadow-sm">
              <div className="flex justify-between items-end mb-4">
                <div>
                  <p className="text-sm font-semibold text-outline tracking-wider uppercase mb-1">
                    Trip Budget
                  </p>
                  <h2 className="text-2xl font-bold text-primary font-headline">
                    ${spent.toLocaleString()}{" "}
                    <span className="text-sm font-medium text-outline">/ ${total.toLocaleString()}</span>
                  </h2>
                </div>
                <span className="text-xs font-bold bg-secondary-fixed text-on-secondary-fixed px-3 py-1 rounded-full uppercase tracking-widest">
                  {pct}% Spent
                </span>
              </div>
              <div className="h-3 w-full bg-surface-container-high rounded-full overflow-hidden">
                <div
                  className="h-full bg-linear-to-r from-primary to-primary-container"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex justify-between mt-3">
                <span className="text-xs font-semibold text-outline">Daily Avg: $427</span>
                <span className="text-xs font-semibold text-primary">
                  ${(total - spent).toLocaleString()} Remaining
                </span>
              </div>
            </div>
          </section>

          {/* Map toggle */}
          <section className="mb-10">
            <div className="relative rounded-xl overflow-hidden h-40 cursor-pointer group">
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <div className="bg-white/90 backdrop-blur-md px-6 py-2 rounded-full shadow-lg border border-white/20 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">map</span>
                  <span className="font-bold text-primary text-sm uppercase tracking-wider">Explore Map</span>
                </div>
              </div>
              <img
                className="w-full h-full object-cover opacity-60"
                alt="Map"
                src={MAP_MOBILE_IMG}
              />
            </div>
          </section>

          {/* Timeline */}
          {MOBILE_DAYS.map((day) => (
            <section key={day.label} className="mb-10">
              <div className="flex items-center gap-4 mb-8">
                <h3 className="text-4xl font-extrabold font-headline text-on-surface">{day.label}</h3>
                <div className="h-px flex-1 bg-surface-container-highest" />
                <span className="text-sm font-bold text-outline uppercase tracking-widest">{day.date}</span>
              </div>

              <div className="relative pl-8 border-l-2 border-primary-fixed-dim space-y-12">
                {day.activities.map((act, i) => (
                  <div key={i} className="relative">
                    <div className="absolute -left-10.25 top-0 w-4 h-4 rounded-full bg-primary ring-4 ring-background" />
                    <div className="flex flex-col gap-2">
                      <div className="flex justify-between items-start">
                        <span className="text-xs font-black text-primary uppercase tracking-widest">{act.time}</span>
                        {act.badge && (
                          <span className={`text-[10px] font-bold ${act.badge.bg} ${act.badge.color} px-2 py-0.5 rounded flex items-center gap-1`}>
                            <span className="material-symbols-outlined text-[12px]">{act.icon}</span>
                            {act.badge.label}
                          </span>
                        )}
                      </div>
                      <h4 className="text-lg font-bold font-headline leading-tight">{act.title}</h4>
                      <p className="text-sm text-on-surface-variant leading-relaxed">{act.desc}</p>
                      {act.photo && (
                        <div className="mt-2 rounded-lg overflow-hidden h-32">
                          <img className="w-full h-full object-cover" alt={act.title} src={act.photo} />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}

          {/* Dinner suggestions */}
          <section className="mb-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-extrabold font-headline">Suggested for Dinner</h3>
              <span className="text-xs font-bold text-primary uppercase tracking-widest">See All</span>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-4 -mx-6 px-6 scrollbar-hide">
              {DINNER_SUGGESTIONS.map((d) => (
                <div key={d.name} className="min-w-50 bg-surface-container-lowest rounded-xl overflow-hidden shadow-sm">
                  <div className="h-32 relative">
                    <img className="w-full h-full object-cover" alt={d.name} src={d.img} />
                    <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-md px-2 py-1 rounded-lg text-[10px] font-bold text-on-surface flex items-center gap-1">
                      <span
                        className="material-symbols-outlined text-[12px] text-secondary"
                        style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
                      >
                        star
                      </span>
                      {d.rating}
                    </div>
                  </div>
                  <div className="p-3">
                    <h5 className="font-bold text-sm">{d.name}</h5>
                    <p className="text-xs text-outline mb-2">{d.cuisine} • {d.price}</p>
                    <button className="w-full py-2 bg-surface-container-high rounded-full text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary-fixed transition-colors">
                      Add to Trip
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </main>

        {/* FAB */}
        <button className="fixed bottom-32 right-6 w-14 h-14 bg-linear-to-br from-primary to-primary-container text-white rounded-full shadow-lg shadow-primary/30 flex items-center justify-center active:scale-90 transition-transform z-50">
          <span className="material-symbols-outlined text-3xl">add</span>
        </button>
      </div>

      {/* ═══════════════════════ DESKTOP LAYOUT ═══════════════════════ */}
      <div className="hidden md:block">
          <main className="max-w-360 mx-auto p-4 md:p-8 pt-28">
          {/* Budget bar */}
          <section className="mb-8 bg-surface-container-lowest rounded-xl p-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
              <div>
                <p className="text-xs font-bold text-outline uppercase tracking-widest mb-1">
                  Trip Budget: Amalfi Coast
                </p>
                <h1 className="text-3xl font-black font-headline text-on-surface">Daily Breakdown</h1>
              </div>
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-xs text-outline mb-1">Spent:</p>
                  <p className="font-bold text-on-surface">${spent.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-outline mb-1">Budget:</p>
                  <p className="font-bold text-primary">${total.toLocaleString()}</p>
                </div>
                <div className="text-right bg-secondary-fixed text-on-secondary-fixed rounded-xl p-3">
                  <p className="text-xs font-bold uppercase tracking-widest">Remaining</p>
                  <p className="text-xl font-black font-headline">${(total - spent).toLocaleString()}.00</p>
                </div>
              </div>
            </div>
            <div className="relative h-3 bg-surface-container-high rounded-full overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-linear-to-r from-primary to-primary-container rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-outline">
              <span>${spent.toLocaleString()} spent</span>
              <span>${total.toLocaleString()} total</span>
            </div>
          </section>

          {/* Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Timeline col 5 */}
            <div className="lg:col-span-5 space-y-10">
              {DAYS.map((day, di) => (
                <div key={day.label} className={`relative pl-8 ${day.faded ? "opacity-60" : ""}`}>
                  <div className="absolute left-2 top-0 bottom-0 w-px bg-outline-variant/40" />
                  <div className="absolute -left-0.5 top-1 w-5 h-5 rounded-full border-2 border-primary bg-primary-fixed" />
                  <div className="mb-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-outline">{day.date}</p>
                    <h2 className="text-xl font-black font-headline">{day.label}</h2>
                  </div>
                  <div className="space-y-4">
                    {day.activities.map((act) => (
                      <div
                        key={act.title}
                        className="bg-surface-container-lowest rounded-xl p-5 flex gap-4 hover:translate-x-1 transition-transform shadow-sm"
                      >
                        <div className="w-10 h-10 rounded-lg bg-primary-fixed flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-primary text-xl">{act.icon}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-bold text-on-surface">{act.title}</p>
                            {act.cost && (
                              <span className="text-xs font-bold text-primary shrink-0">{act.cost}</span>
                            )}
                          </div>
                          <p className="text-xs text-outline mt-0.5">{act.time}</p>
                          <p className="text-sm text-on-surface-variant mt-1">{act.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {di === 1 && (
                    <div className="mt-6 space-y-3">
                      <p className="text-sm font-bold text-on-surface-variant">
                        Dinner Suggestions for {destination}
                      </p>
                      <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-hide -mx-2 px-2">
                        {DINNER_SUGGESTIONS.map((d) => (
                          <div
                            key={d.name}
                            className="relative shrink-0 w-40 h-64 rounded-xl overflow-hidden cursor-pointer group"
                          >
                            <img
                              alt={d.name}
                              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                              src={d.img}
                            />
                            <div className="absolute inset-0 bg-linear-to-t from-on-surface/80 via-transparent to-transparent" />
                            <div className="absolute bottom-3 left-3">
                              <p className="text-white font-bold text-sm font-headline">{d.name}</p>
                              <p className="text-white/70 text-xs">{d.cuisine} · {d.price}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Map col 7 */}
            <div className="lg:col-span-7 sticky top-28 h-150 rounded-3xl overflow-hidden shadow-xl">
              <img alt="Route map" className="w-full h-full object-cover" src={MAP_IMG} />
              <div className="absolute bottom-6 left-6 right-6 bg-surface-container-lowest/80 backdrop-blur-md rounded-2xl p-5 flex flex-wrap gap-3">
                {[
                  { label: "Kinkaku-ji", color: "bg-primary" },
                  { label: "Arashiyama", color: "bg-secondary-container" },
                  { label: "Fushimi Inari", color: "bg-tertiary-container" },
                ].map((stop) => (
                  <div key={stop.label} className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${stop.color}`} />
                    <span className="text-xs font-medium text-on-surface">{stop.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function ItineraryPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-on-surface-variant">Loading itinerary…</div>}>
      <ItineraryContent />
    </Suspense>
  );
}
