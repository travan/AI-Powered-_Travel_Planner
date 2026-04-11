"use client";

import Link from "next/link";
import { SiteHeader } from "../../../../components/layout/SiteHeader";

// ─── Desktop data ─────────────────────────────────────────────────────────────

const CARDS = [
  {
    id: 1,
    title: "The Budget Backpacker",
    days: 12,
    cost: "$1,250 est.",
    highlights: [
      "Local hostel stays & authentic street food tours",
      "Public transit routes through scenic villages",
      "Self-guided hiking trails & free museums",
    ],
    badge: "VALUE CHOICE",
    badgeStyle: "bg-white/80 backdrop-blur text-on-surface",
    img: "https://lh3.googleusercontent.com/aida-public/AB6AXuCV5YF3Da854eNkcpm_jpZNwuPUa6b4NdgcQWzpVLnNuCw0ufsvYucmCAfQpqRNbG7-BXQia5DWjYKmUCKDZ74N_xr3cCL7T8Vj262xXoUXOktCB8BXw4izLLmT44aPNUdsGfGekzc9o__ntSscD9bstR82EPY_QgX7p1ErWD9KIJoSU4ZkOI8o0XB6q7_QYu_ki_MK5aPZpQDvw_ZufnoTlKxr_m09uV7EzKvpVTgSqIe-aukZutYJGToTWNSyB3UnzuTBaFOSkCk",
  },
  {
    id: 2,
    title: "Luxury Coastline Escape",
    days: 7,
    cost: "$4,800 est.",
    highlights: [
      "5-star beachfront resorts with private infinity pools",
      "Private yacht charters & Michelin dining",
      "Dedicated personal concierge & airport transfers",
    ],
    badge: "PREMIUM",
    badgeStyle: "bg-secondary-container text-on-secondary-container",
    img: "https://lh3.googleusercontent.com/aida-public/AB6AXuAhBNVEaaaL0Pi8f9-PXodQPiPbDPnnnZxGnRW3wQGoxdfML0_xv8JDPB8w0B0A1-jc7bdG6BWDXIMlSOmdh5QuNMbzvjShz2F62Y1T8K9Q7MyGH-9Iv_hNPBblYBdAjr-_4v1xhZqTQ6DaiemzZXRj3HS-2mdTa4RbvbqyLmDbu44D29wJmD5n1CfUzpsuDmmWkklWCYo6gapx4EgZgtWFN58hBMop8thd3KcN_19Bn9Xrq2uLrjVuIS8XAL4TJ_SJEYdDM8Rb9Q4",
  },
  {
    id: 3,
    title: "Cultural Heart & Soul",
    days: 10,
    cost: "$2,400 est.",
    highlights: [
      "Boutique riads & traditional artisan workshops",
      "Exclusive after-hours historical landmark tours",
      "Local home-stay dinner experiences",
    ],
    badge: "TOP RATED",
    badgeStyle: "bg-white/80 backdrop-blur text-on-surface",
    img: "https://lh3.googleusercontent.com/aida-public/AB6AXuDMW8OM3gZ9Yo9TAS7eJNETVxw9GPs9_KcFKWczyXq5xqtlhDgpQsMZrOZzWemauoDEe2lgR35vXKKtaXgFt1gSyqKPKk9-olXF5Ke2gIe3kPy6v_urbk8tZr10SrkYRh8eQJRaUq03gnd2mQ3Z3xlOetm-2xinjbwasXmtm-EsxxIhyq40VVt3sm860ItV1lxntEtjrCCCqKjdLGIDrtEFgSs4VtRUPvzv4eR4Vsxy0N0zEAmlVRo3gDYbz28BvuM8Sk1byH8LA3s",
  },
  {
    id: 4,
    title: "Hidden Gem Explorer",
    days: 9,
    cost: "$1,950 est.",
    highlights: [
      "Off-the-beaten-path destinations & eco-lodges",
      "Small group 4x4 overland expeditions",
      "Photography-focused sunrise mountain summits",
    ],
    badge: "TRENDING",
    badgeStyle: "bg-white/80 backdrop-blur text-on-surface",
    img: "https://lh3.googleusercontent.com/aida-public/AB6AXuAaNK0CE4SPcDFLjKivkBmU-BT4dmR08aqKJJ9ZMlQqfCvE76H2rF4KpTWDYDZ1lq3FGqGktUeYhwlKe1wOA0ArSznkiR_1t2OQM1RG4DZRQzkYjTQghDd2nOI1MNMZVppTNAuCCFH_tRn5G9PmT8FV9VceP-WGdljKB1U-25S9Ak_m4DW0SgRHEaXkd5YnZZ7IAgVUDrs_fkGMfVGz3Ny6iKcJZa-U3LGwGJT1jZI6FbF7vb8rpWakNgDK8qF-lXm1hKEXXf4R-ag",
  },
];

// ─── Mobile editorial data ────────────────────────────────────────────────────

const MOBILE_CARDS = [
  {
    id: "zen",
    title: "The Zen Master",
    subtitle: "Luxury Experience",
    subtitleColor: "text-primary",
    price: "$4,200+",
    priceBg: "bg-white/80 backdrop-blur border border-primary/10",
    priceColor: "text-primary",
    days: "5 Days",
    daysIcon: "schedule",
    transport: "Ryokan Stay",
    transportIcon: "hotel",
    highlights: [
      "Private Geisha Tea Ceremony",
      "Michelin Star Kaiseki Dining",
      "VIP Access to Hidden Temples",
    ],
    img: "https://lh3.googleusercontent.com/aida-public/AB6AXuBu_oVbRqS25CeOOLHpRKTdlGBEgmdS-PdcU5wXTVKJVH_6yl6z79CHd_W5N_CB5bYRhz_YZXTJnX0GWlk3E3-HrF58Is4C_4rqVdY4IhltG3bshWcHhf05gke2nywKF6Ax2rY3VTHF5XYP_4j5v2NdgP67Mb_-i-7idkOHwVNy5GLNFQ9aBspf948SoWQpfz5GbB4_hyc_IlqW_I-4UL3M6yHIUizaunz9-x7wKegP6fH-rm0yKP76arRZGZOMj2Pt1L2elLqYDt8",
  },
  {
    id: "nomad",
    title: "Urban Nomad",
    subtitle: "Smart Budget",
    subtitleColor: "text-secondary",
    price: "$850",
    priceBg: "bg-secondary-fixed",
    priceColor: "text-on-secondary-fixed",
    days: "7 Days",
    daysIcon: "schedule",
    transport: "JR Pass Incl.",
    transportIcon: "train",
    highlights: [
      "Street Food Tour Gion District",
      "Bike Rentals for Arashiyama",
      "Boutique Hostel Stay",
    ],
    img: "https://lh3.googleusercontent.com/aida-public/AB6AXuAf8TB1IGbk_0HGCaB4heTgSGToJkO_bE1W3Z7IcvtukSCGzl4kpoarnZsEGSwgfdMyxd9fcuzcgI0UEDX0xmL5rjnT628s6GSCdnLf14_axOvbxqFU6XoauKFnXc7JBiwqZbeEupzlWiQVJSQCesTc3D2o8rngnHFMtoLUTUJGixXmObazn9dj7661tmZSRy6n43A_P_IkUosPbqSfCQYascHr1JrQwBpotf3mjBggK_9oyU55Qf-gti--Wi7jSCBrBu5HxbhqBzM",
  },
  {
    id: "curator",
    title: "The Curator",
    subtitle: "Cultural Deep-Dive",
    subtitleColor: "text-tertiary",
    price: "$1,850",
    priceBg: "bg-tertiary-fixed",
    priceColor: "text-on-tertiary-fixed",
    days: "6 Days",
    daysIcon: "schedule",
    transport: "Workshop Incl.",
    transportIcon: "brush",
    highlights: [
      "Pottery Class with Master Artisan",
      "Zen Meditation Session",
      "Sake Brewery Tasting Tour",
    ],
    img: "https://lh3.googleusercontent.com/aida-public/AB6AXuD2r6XxahdzU2dufMVvccklZHc-Q1RT27ER5X0alTUzpcIFklXbOVabRr82_WgcGgTUTVX89detviHH2yFuE6nnB3bXpdu7aDVm7scYgjw_zghDo_GVmq3zl3Dwb_vNevDFbTd-XqnrCM5CCpz8CsGcs2Kznj17Sogy9Kp63devn-xgnNQhavvEEhS6sSP5kPJvi1Jc3y7x8dMT7VpIMUnukgR3rVqPJcK4_KNvggxb51vc2jRWNLIWXP15uM_OICidBGxs4g8CMbM",
  },
];

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ComparisonPage() {
  return (
    <div className="bg-surface text-on-surface min-h-screen">
      <SiteHeader />

      {/* ═══════════════════════ MOBILE LAYOUT ═══════════════════════ */}
      <div className="md:hidden pb-40">
        <main className="pt-24 pb-8 px-6 max-w-md mx-auto">
          {/* Editorial header */}
          <div className="mb-10">
            <span className="text-primary font-bold tracking-widest uppercase text-[10px] block mb-2">
              Tailored Experiences
            </span>
            <h2 className="text-4xl font-headline font-extrabold text-on-surface tracking-tight leading-none mb-4">
              Choose Your <br />Journey.
            </h2>
            <p className="text-on-surface-variant font-medium text-sm leading-relaxed max-w-70">
              Our AI has curated three distinct paths for your adventure in Kyoto.
            </p>
          </div>

          {/* Editorial stacked cards */}
          <div className="space-y-12">
            {MOBILE_CARDS.map((card, idx) => (
              <section key={card.id} className={`relative ${idx > 0 ? "pt-8" : ""}`}>
                <div className="relative group">
                  {/* Photo */}
                  <div className="aspect-4/5 w-full rounded-xl overflow-hidden shadow-[0_32px_64px_-12px_rgba(0,93,144,0.08)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt={card.title}
                      className="w-full h-full object-cover grayscale-20"
                      src={card.img}
                    />
                    <div className="absolute inset-0 bg-linear-to-t from-on-surface/80 via-transparent to-transparent" />
                  </div>

                  {/* Content card overlapping photo */}
                  <div className="absolute -bottom-8 left-4 right-4 bg-surface-container-lowest p-6 rounded-xl shadow-[0_32px_64px_-12px_rgba(0,93,144,0.08)] border-t border-white/20">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-2xl font-headline font-bold text-on-surface">{card.title}</h3>
                        <span className={`font-bold text-xs ${card.subtitleColor}`}>{card.subtitle}</span>
                      </div>
                      <div className={`${card.priceBg} px-3 py-1 rounded-full`}>
                        <span className={`${card.priceColor} font-bold text-sm`}>{card.price}</span>
                      </div>
                    </div>

                    <div className="flex gap-4 mb-6 text-on-surface-variant text-[11px] font-bold uppercase tracking-wider">
                      <div className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">{card.daysIcon}</span>
                        {card.days}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">{card.transportIcon}</span>
                        {card.transport}
                      </div>
                    </div>

                    <ul className="space-y-3 mb-8">
                      {card.highlights.map((h) => (
                        <li key={h} className="flex items-center gap-3 text-sm font-medium text-on-surface-variant">
                          <span
                            className="material-symbols-outlined text-primary text-[20px]"
                            style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
                          >
                            check_circle
                          </span>
                          {h}
                        </li>
                      ))}
                    </ul>

                    <Link
                      href={`/itinerary?plan=${card.id}`}
                      className="block w-full text-center py-4 bg-linear-to-br from-primary to-primary-container text-on-primary rounded-full font-bold text-sm active:scale-95 transition-transform"
                    >
                      Select Itinerary
                    </Link>
                  </div>
                </div>
              </section>
            ))}
          </div>
        </main>

        {/* AI Assistant floating bar */}
        <div className="fixed bottom-24 left-6 right-6 z-40">
          <div className="bg-white/90 backdrop-blur-2xl rounded-full shadow-[0_32px_64px_-12px_rgba(0,93,144,0.08)] p-2 flex items-center justify-between border border-primary/5">
            <div className="flex items-center gap-3 pl-4">
              <span
                className="material-symbols-outlined text-primary"
                style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
              >
                auto_awesome
              </span>
              <span className="text-xs font-bold text-on-surface-variant uppercase tracking-tighter">
                AI Assistant
              </span>
            </div>
            <button className="bg-primary text-white px-6 py-3 rounded-full flex items-center gap-2 font-bold text-sm shadow-lg shadow-primary/20 active:scale-90 transition-all duration-300">
              Refine with AI
              <span className="material-symbols-outlined text-[18px]">tune</span>
            </button>
          </div>
        </div>
      </div>

      {/* ═══════════════════════ DESKTOP LAYOUT ═══════════════════════ */}
      <div className="hidden md:block">
        <main className="pt-28 pb-32 px-6 max-w-7xl mx-auto">
          {/* Page header */}
          <section className="mb-12">
            <span className="text-primary font-bold tracking-widest uppercase text-xs block mb-3">
              AI Curated Voyages
            </span>
            <h1 className="text-4xl md:text-5xl font-black font-headline text-on-surface mb-4">
              Compare Your Journeys
            </h1>
            <p className="text-outline text-lg max-w-2xl">
              We&apos;ve designed four distinct paths based on your preferences. Choose the itinerary that
              speaks to your spirit of adventure.
            </p>
          </section>

          {/* Cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {CARDS.map((card) => (
              <article
                key={card.id}
                className="group flex flex-col bg-surface-container-lowest rounded-xl overflow-hidden hover:-translate-y-2 transition-all duration-300 shadow-sm hover:shadow-xl"
              >
                <div className="relative h-48 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={card.title}
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    src={card.img}
                  />
                  <div className="absolute inset-0 bg-linear-to-t from-on-surface/30 to-transparent" />
                  <span className={`absolute top-3 left-3 text-[10px] font-black uppercase px-2.5 py-1 rounded-full ${card.badgeStyle}`}>
                    {card.badge}
                  </span>
                </div>
                <div className="flex flex-col flex-1 p-6 space-y-4">
                  <h2 className="text-xl font-black font-headline text-on-surface">{card.title}</h2>
                  <div className="flex items-center gap-4 text-sm text-on-surface-variant">
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-base">schedule</span>
                      {card.days} Days
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-base">payments</span>
                      {card.cost}
                    </span>
                  </div>
                  <ul className="space-y-2 flex-1">
                    {card.highlights.map((h) => (
                      <li key={h} className="flex items-start gap-2 text-sm text-on-surface-variant">
                        <span
                          className="material-symbols-outlined text-primary text-base mt-0.5 shrink-0"
                          style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
                        >
                          check_circle
                        </span>
                        {h}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={`/itinerary?plan=${card.id}`}
                    className="mt-auto block text-center bg-primary text-on-primary rounded-full py-4 font-bold hover:bg-primary-container transition-colors text-sm font-headline"
                  >
                    Select Itinerary
                  </Link>
                </div>
              </article>
            ))}
          </div>

          {/* Bottom CTA bar */}
          <div className="mt-16 bg-surface-container-low rounded-2xl p-6 flex items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-primary-fixed flex items-center justify-center">
                <span
                  className="material-symbols-outlined text-primary"
                  style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
                >
                  auto_awesome
                </span>
              </div>
              <div>
                <p className="font-bold text-on-surface">Need a custom blend?</p>
                <p className="text-sm text-on-surface-variant">
                  Mix and match elements from these plans to create your perfect trip.
                </p>
              </div>
            </div>
            <button className="shrink-0 bg-secondary-fixed text-on-secondary-fixed px-6 py-3 rounded-full font-bold text-sm hover:opacity-90 transition-opacity">
              Refine with AI
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}

