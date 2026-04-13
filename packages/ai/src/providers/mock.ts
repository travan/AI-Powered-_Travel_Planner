import type { ItineraryInput, ItineraryOverview, Itinerary } from "@travel/types";
import type { AIProvider, PreFetchedCityData } from "../provider.js";

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
    cityData: PreFetchedCityData[]
  ): Promise<ItineraryOverview> {
    const titleCities = cityData.map((c) => c.city).join(" & ");
    const totalDays = input.num_days ?? Math.max(3, cityData.length * 2);
    const baseBudget = input.budget ?? totalDays * 180 * input.num_travelers;

    return {
      title: `${titleCities} Discovery`,
      overview: `A balanced ${input.trip_style} journey across ${titleCities} with practical pacing and local highlights.`,
      cities: cityData.map((c) => c.city),
      total_days: totalDays,
      estimated_budget: {
        min: Math.round(baseBudget * 0.85),
        max: Math.round(baseBudget * 1.2),
        currency: input.currency,
      },
      day_plan: Array.from({ length: totalDays }, (_, i) =>
        `Day ${i + 1}: Explore neighborhoods, food, and signature sights in ${cityData[Math.min(i, cityData.length - 1)]?.city ?? input.cities[0]}`
      ),
    };
  }

  async generateDetail(
    input: ItineraryInput,
    overview: ItineraryOverview,
    cityData: PreFetchedCityData[]
  ): Promise<Itinerary> {
    const dates = buildDates({ ...input, num_days: overview.total_days });
    const firstCity = cityData[0];
    const baseDaily = Math.max(100, Math.round((input.budget ?? overview.estimated_budget.max) / overview.total_days));

    const days = dates.map((date, idx) => {
      const city = (cityData[Math.min(idx, cityData.length - 1)]?.city ?? input.cities[0]) ?? "Unknown";
      return {
        day_number: idx + 1,
        date,
        city,
        title: `${city} Highlights`,
        activities: [
          {
            time: "09:00",
            name: `Morning walk in ${city}`,
            description: "Start slow with an orientation walk and coffee.",
            duration: "2h",
            cost: 0,
            currency: input.currency,
            category: "attraction" as const,
            maps_link: "https://maps.google.com",
          },
          {
            time: "13:00",
            name: `${city} local lunch`,
            description: "Try a highly rated local restaurant nearby.",
            duration: "1.5h",
            cost: Math.round(baseDaily * 0.25),
            currency: input.currency,
            category: "food" as const,
            maps_link: "https://maps.google.com",
          },
          {
            time: "18:00",
            name: `Sunset viewpoint in ${city}`,
            description: "Golden hour at a scenic location.",
            duration: "1h",
            cost: Math.round(baseDaily * 0.15),
            currency: input.currency,
            category: "leisure" as const,
            maps_link: "https://maps.google.com",
          },
        ],
        daily_cost_estimate: baseDaily,
      };
    });

    const total = baseDaily * overview.total_days;

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
        weather_note: firstCity?.weather_note ?? "Typical seasonal conditions expected.",
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

  async parseNaturalInput(_text: string, _locale: string): Promise<Partial<ItineraryInput>> {
    return {};
  }
}
