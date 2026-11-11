import type {
  ItineraryInput,
  ItineraryOverview,
  Itinerary,
} from "@travel/types";
import type { AIProvider, PreFetchedCityData } from "../provider.js";

type MockActivityTemplate = {
  time: string;
  name: string;
  description: string;
  duration: string;
  category: "attraction" | "food" | "leisure";
  costShare: number;
};

const MOCK_DAY_PLANS: MockActivityTemplate[][] = [
  [
    {
      time: "09:00",
      name: "Orientation walk",
      description: "Start with a relaxed walk to get familiar with the city.",
      duration: "2h",
      category: "attraction",
      costShare: 0,
    },
    {
      time: "13:00",
      name: "Local lunch tasting",
      description: "Try a well-rated local dish near the morning route.",
      duration: "1.5h",
      category: "food",
      costShare: 0.25,
    },
    {
      time: "18:00",
      name: "Scenic sunset stop",
      description: "End the first day at a viewpoint with a wide city view.",
      duration: "1h",
      category: "leisure",
      costShare: 0.15,
    },
  ],
  [
    {
      time: "08:30",
      name: "Morning market visit",
      description:
        "Explore the morning market and see how locals start the day.",
      duration: "2h",
      category: "attraction",
      costShare: 0.05,
    },
    {
      time: "12:30",
      name: "Regional specialties lunch",
      description:
        "Make time for a second local specialty away from yesterday's route.",
      duration: "1.5h",
      category: "food",
      costShare: 0.3,
    },
    {
      time: "19:00",
      name: "Evening street-food walk",
      description:
        "Sample small bites and browse the liveliest evening streets.",
      duration: "2h",
      category: "food",
      costShare: 0.2,
    },
  ],
  [
    {
      time: "09:00",
      name: "Nature trail morning",
      description:
        "Spend the morning on an easy nature trail outside the busiest area.",
      duration: "3h",
      category: "attraction",
      costShare: 0.1,
    },
    {
      time: "13:30",
      name: "Garden café break",
      description:
        "Take a slow lunch and coffee break in a quiet garden setting.",
      duration: "2h",
      category: "food",
      costShare: 0.25,
    },
    {
      time: "17:30",
      name: "Lakeside golden hour",
      description: "Walk by the water during the softer late-afternoon light.",
      duration: "1.5h",
      category: "leisure",
      costShare: 0.05,
    },
  ],
  [
    {
      time: "09:30",
      name: "Heritage and culture visit",
      description:
        "Learn about the destination through a cultural or heritage stop.",
      duration: "2.5h",
      category: "attraction",
      costShare: 0.15,
    },
    {
      time: "13:00",
      name: "Farm-to-table lunch",
      description: "Choose a relaxed meal built around regional ingredients.",
      duration: "1.5h",
      category: "food",
      costShare: 0.35,
    },
    {
      time: "18:30",
      name: "Riverside evening stroll",
      description: "Unwind with a walk through a calmer neighborhood at dusk.",
      duration: "1.5h",
      category: "leisure",
      costShare: 0.05,
    },
  ],
  [
    {
      time: "08:00",
      name: "Countryside day trip",
      description: "Take a half-day route through the surrounding countryside.",
      duration: "4h",
      category: "attraction",
      costShare: 0.2,
    },
    {
      time: "13:00",
      name: "Picnic or countryside lunch",
      description: "Have lunch close to the day's outdoor route.",
      duration: "1.5h",
      category: "food",
      costShare: 0.25,
    },
    {
      time: "19:30",
      name: "Night-view lookout",
      description: "See the destination from a different angle after dark.",
      duration: "1h",
      category: "leisure",
      costShare: 0.1,
    },
  ],
  [
    {
      time: "09:00",
      name: "Creative workshop",
      description: "Try a hands-on craft, coffee, or cooking experience.",
      duration: "2.5h",
      category: "attraction",
      costShare: 0.25,
    },
    {
      time: "13:30",
      name: "Neighborhood lunch crawl",
      description:
        "Compare two small local stops instead of repeating a single meal route.",
      duration: "2h",
      category: "food",
      costShare: 0.3,
    },
    {
      time: "18:00",
      name: "Local music or art evening",
      description: "Leave room for a low-key cultural experience after dinner.",
      duration: "2h",
      category: "leisure",
      costShare: 0.15,
    },
  ],
  [
    {
      time: "09:00",
      name: "Favorite-place revisit",
      description:
        "Return to the part of the city that best matched your pace this week.",
      duration: "2h",
      category: "attraction",
      costShare: 0.05,
    },
    {
      time: "12:30",
      name: "Farewell meal",
      description: "Use the final lunch to try one last signature dish.",
      duration: "1.5h",
      category: "food",
      costShare: 0.35,
    },
    {
      time: "17:00",
      name: "Farewell photo walk",
      description:
        "Take a final unhurried walk and collect a few last memories.",
      duration: "1.5h",
      category: "leisure",
      costShare: 0.05,
    },
  ],
];

function buildDates(input: ItineraryInput): string[] {
  const days = input.num_days ?? 3;
  const start = input.start_date ?? new Date().toISOString().slice(0, 10);
  const startDate = new Date(start);
  return Array.from({ length: days }, (_, idx) => {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + idx);
    return d.toISOString().slice(0, 10);
  });
}

export class MockAIProvider implements AIProvider {
  async generateOverview(
    input: ItineraryInput,
    cityData: PreFetchedCityData[],
  ): Promise<ItineraryOverview> {
    const titleCities = cityData.map((c) => c.city).join(" & ");
    const totalDays = input.num_days ?? Math.max(3, cityData.length * 2);
    const baseBudget = input.budget ?? totalDays * 180 * input.num_travelers;

    return {
      title:
        input.locale === "vi"
          ? `Khám phá ${titleCities}`
          : `${titleCities} Discovery`,
      overview:
        input.locale === "vi"
          ? `Hành trình cân bằng qua ${titleCities} với nhịp độ hợp lý và trải nghiệm địa phương.`
          : `A balanced ${input.trip_style} journey across ${titleCities} with practical pacing and local highlights.`,
      cities: cityData.map((c) => c.city),
      total_days: totalDays,
      estimated_budget: {
        min: Math.round(baseBudget * 0.85),
        max: Math.round(baseBudget * 1.2),
        currency: input.currency,
      },
      day_plan: Array.from(
        { length: totalDays },
        (_, i) =>
          `Day ${i + 1}: Explore neighborhoods, food, and signature sights in ${cityData[Math.min(i, cityData.length - 1)]?.city ?? input.cities[0]}`,
      ),
    };
  }

  async generateDetail(
    input: ItineraryInput,
    overview: ItineraryOverview,
    cityData: PreFetchedCityData[],
  ): Promise<Itinerary> {
    if (input.planning) return buildMockJourney(input, overview, cityData);
    const dates = buildDates({ ...input, num_days: overview.total_days });
    const firstCity = cityData[0];
    const baseDaily = Math.max(
      100,
      Math.round(
        (input.budget ?? overview.estimated_budget.max) / overview.total_days,
      ),
    );

    const days = dates.map((date, idx) => {
      const city =
        cityData[Math.min(idx, cityData.length - 1)]?.city ??
        input.cities[0] ??
        "Unknown";
      const templates = MOCK_DAY_PLANS[idx % MOCK_DAY_PLANS.length]!;
      const dayCycle = Math.floor(idx / MOCK_DAY_PLANS.length);
      const dailyCost = Math.max(
        100,
        Math.round(baseDaily * (1 + ((idx % 3) - 1) * 0.08)),
      );
      return {
        day_number: idx + 1,
        date,
        city,
        title: `${city} ${dayCycle > 0 ? `Day ${idx + 1}` : "Highlights"}`,
        activities: templates.map((template) => ({
          time: template.time,
          name: `${template.name} in ${city}${dayCycle > 0 ? ` · Day ${idx + 1}` : ""}`,
          description: template.description,
          duration: template.duration,
          cost: Math.round(dailyCost * template.costShare),
          currency: input.currency,
          category: template.category,
          maps_link: "https://maps.google.com",
        })),
        daily_cost_estimate: dailyCost,
      };
    });

    const total = days.reduce((sum, day) => sum + day.daily_cost_estimate, 0);

    return {
      title: overview.title,
      overview: overview.overview,
      total_cost: total,
      currency: input.currency,
      num_days: overview.total_days,
      num_travelers: input.num_travelers,
      seasonal_notes: {
        travel_month: dates[0]?.slice(0, 7) ?? "N/A",
        daylight_hours: firstCity?.daylight_hours ?? "~12 hours of daylight",
        sunrise_time: firstCity?.sunrise ?? "06:00",
        sunset_time: firstCity?.sunset ?? "18:00",
        weather_note:
          firstCity?.weather_note ?? "Typical seasonal conditions expected.",
        highlights: firstCity?.weather_highlights ?? [],
        warnings: firstCity?.weather_warnings ?? [],
      },
      transport_summary: [],
      days,
      hotels: [],
      restaurants: [],
      suggestions: [],
      budget_breakdown: {
        accommodation: Math.round(total * 0.35),
        food: Math.round(total * 0.25),
        activities: Math.round(total * 0.2),
        transport: Math.round(total * 0.15),
        contingency: Math.round(total * 0.05),
        total,
        currency: input.currency,
        per_person: Math.round(total / Math.max(1, input.num_travelers)),
        per_day: Math.round(total / Math.max(1, overview.total_days)),
      },
    };
  }

  async transcribeVideo(_videoUrl: string): Promise<string> {
    return "Mock transcript: no external AI provider configured.";
  }

  async parseNaturalInput(
    _text: string,
    _locale: string,
  ): Promise<Partial<ItineraryInput>> {
    return {};
  }
}

// Explicit test/demo data: unknown businesses remain area searches, never fake bookings.
function buildMockJourney(
  input: ItineraryInput,
  overview: ItineraryOverview,
  cities: PreFetchedCityData[],
): Itinerary {
  const p = input.planning!;
  const vi = input.locale === "vi";
  const text = (viText: string, enText: string) => (vi ? viText : enText);
  const dates = buildDates({ ...input, num_days: overview.total_days });
  const currency = input.currency,
    group = input.num_travelers;
  const dailyFood =
    ((p.dining_preferences.per_person_budget ?? 80000) * 3 + 40000) * group;
  const nightly = p.stay_preferences.nightly_budget ?? 600000;
  const nights =
    p.stay_preferences.type === "none" ? 0 : Math.max(0, dates.length - 1);
  const stay = nightly * p.stay_preferences.rooms * nights;
  const food = dailyFood * dates.length,
    activities = 100000 * group * dates.length;
  const transport = p.transport_preferences.total_price ?? 200000 * group;
  const contingency = Math.round((stay + food + activities + transport) * 0.1);
  const total = stay + food + activities + transport + contingency;
  const instant = (date: string, time: string) =>
    Date.parse(`${date.slice(0, 10)}T${time}:00+07:00`);
  const bound = (value?: string) =>
    value
      ? Date.parse(
          /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}+07:00`,
        )
      : null;
  const arrival = bound(p.transport_preferences.arrival_at),
    departure = bound(p.transport_preferences.departure_at);
  const days = dates.map((date, i) => {
    const city =
      cities[Math.min(i, cities.length - 1)]?.city ??
      input.cities[0] ??
      text("Điểm đến", "Destination");
    const stops: [string, string, string][] = [
      ["08:00", "meal", text("Bữa sáng địa phương", "Local breakfast")],
      ["09:00", "visit", text("Đi bộ khu vực công cộng", "Public area walk")],
      ["12:00", "meal", text("Bữa trưa địa phương", "Local lunch")],
      [
        "14:00",
        "cafe",
        text("Tìm café địa phương", "Find an independent café"),
      ],
      ["16:00", "visit", text("Dạo khu phố", "Neighborhood stroll")],
      ["18:00", "meal", text("Bữa tối địa phương", "Local dinner")],
    ];
    const activities = stops
      .filter(
        ([time]) =>
          (arrival === null || instant(date, time) >= arrival) &&
          (departure === null ||
            instant(date, time) + 3600000 <=
              departure -
                (p.transport_preferences.mode === "flight"
                  ? p.transport_preferences.airport_buffer_minutes * 60000
                  : 0)),
      )
      .map(([time, kind, name]) => ({
        time,
        name: `${name} ${text("tại", "in")} ${city}`,
        kind: kind as "visit" | "meal" | "cafe",
        description: text(
          "Gợi ý tìm theo khu vực dùng cho bản demo. Chọn địa điểm trong catalog hoặc xác minh trước khi đi. Thời gian và giá chỉ là ước tính.",
          "Demo search suggestion for this area. Choose a catalog venue or verify it before traveling. Times and prices are estimates.",
        ),
        duration: "1h",
        duration_minutes: 60,
        cost:
          kind === "visit"
            ? 50000 * group
            : kind === "cafe"
              ? 40000 * group
              : (p.dining_preferences.per_person_budget ?? 80000) * group,
        currency,
        category:
          kind === "visit" ? ("attraction" as const) : ("food" as const),
        maps_link: "",
        evidence: { source: "ai_suggestion" as const },
      }));
    return {
      day_number: i + 1,
      date,
      city,
      title: vi ? `Ngày ${i + 1} tại ${city}` : `Day ${i + 1} in ${city}`,
      activities,
      daily_cost_estimate: Math.round(total / dates.length),
    };
  });
  const origin = p.journey.origin.label,
    end = p.journey.return_to_origin
      ? origin
      : (p.journey.endpoint?.label ?? "");
  const mode = ["flight", "train", "bus", "car", "motorbike", "ferry"].includes(
    p.transport_preferences.mode,
  )
    ? (p.transport_preferences.mode as
        | "flight"
        | "train"
        | "bus"
        | "car"
        | "motorbike"
        | "ferry")
    : ("other" as const);
  const routeCities = days
    .map((day) => day.city)
    .filter((city, index, stops) => city !== stops[index - 1]);
  const cityNames = [...new Set(routeCities)];
  return {
    title: overview.title,
    overview: text(
      "Bản demo hành trình. Tên khu vực là gợi ý tìm kiếm, chưa có đặt chỗ.",
      "Demo itinerary. Area names are search suggestions; no reservations have been made.",
    ),
    currency,
    num_days: days.length,
    num_travelers: group,
    total_cost: total,
    seasonal_notes: {
      travel_month: dates[0]?.slice(0, 7) ?? "",
      daylight_hours: "",
      sunrise_time: "",
      sunset_time: "",
      weather_note: "",
      highlights: [],
      warnings: [
        text(
          "Dữ liệu demo; xác minh địa điểm, giá và chặng di chuyển trước khi đặt.",
          "Demo data; verify places, prices and travel segments before booking.",
        ),
      ],
    },
    transport_summary: [
      {
        segment: text(
          "Chặng đi đề xuất — cần xác minh",
          "Suggested outbound journey — verify details",
        ),
        from: origin,
        to: routeCities[0] ?? "",
        recommended_mode: mode,
        options: [],
      },
      ...routeCities.slice(1).map((city, i) => ({
        segment: text("Liên tỉnh đề xuất", "Suggested intercity journey"),
        from: routeCities[i]!,
        to: city,
        recommended_mode: mode,
        options: [],
      })),
      {
        segment: text(
          "Chặng về đề xuất — cần xác minh",
          "Suggested return journey — verify details",
        ),
        from: routeCities.at(-1) ?? "",
        to: end,
        recommended_mode: mode,
        options: [],
      },
    ],
    days,
    hotels: nights
      ? cityNames.map((city) => ({
          name:
            p.stay_preferences.booked_name ??
            (vi
              ? `Gợi ý tìm ${p.stay_preferences.type} tại ${city}`
              : `Search for ${p.stay_preferences.type} in ${city}`),
          city,
          rooms: p.stay_preferences.rooms,
          nights: days.slice(0, -1).filter((d) => d.city === city).length,
          nightly_estimate: nightly,
          stars: 0,
          price_per_night: `${text("Ước tính", "Estimate")} ${nightly} ${currency}${text("/phòng/đêm", "/room/night")}`,
          price_range: "",
          booking_url: "",
          airbnb_url: "",
          address: "",
          maps_link: "",
          note: text(
            "Gợi ý khu vực cho bản demo; xác nhận ngày, số phòng, giường, thuế/phí và hủy phòng trước khi đặt.",
            "Demo area suggestion; confirm dates, room count, beds, taxes, fees and cancellation before booking.",
          ),
        }))
      : [],
    restaurants: days.flatMap((d) =>
      d.activities
        .filter((a) => a.kind === "meal" || a.kind === "cafe")
        .map((a) => ({
          name: a.name,
          city: d.city,
          day_number: d.day_number,
          time: a.time,
          kind: a.kind as "meal" | "cafe",
          cuisine:
            a.kind === "cafe" ? "Café" : text("Món địa phương", "Local food"),
          estimated_per_person: Math.round(a.cost / group),
          price_range: text("Ước tính", "Estimate"),
          price_per_person: `${Math.round(a.cost / group)} ${currency}${text("/người", "/person")}`,
          address: "",
          maps_link: "",
          tiktok_search_link: "",
          ig_search_link: "",
          note: vi
            ? `Ngày ${d.day_number} lúc ${a.time}. Gợi ý tìm theo khu vực; cần xác minh quán thực tế và yêu cầu ăn uống.`
            : `Day ${d.day_number} at ${a.time}. Area search suggestion; verify the venue and dietary requirements.`,
        })),
    ),
    suggestions: [],
    budget_breakdown: {
      accommodation: stay,
      food,
      activities,
      transport,
      contingency,
      total,
      currency,
      per_person: Math.round(total / group),
      per_day: Math.round(total / days.length),
    },
  };
}
