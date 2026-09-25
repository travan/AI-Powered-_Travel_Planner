import type { ItineraryInput, ItineraryOverview, Itinerary } from "@travel/types";
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
    { time: "09:00", name: "Orientation walk", description: "Start with a relaxed walk to get familiar with the city.", duration: "2h", category: "attraction", costShare: 0 },
    { time: "13:00", name: "Local lunch tasting", description: "Try a well-rated local dish near the morning route.", duration: "1.5h", category: "food", costShare: 0.25 },
    { time: "18:00", name: "Scenic sunset stop", description: "End the first day at a viewpoint with a wide city view.", duration: "1h", category: "leisure", costShare: 0.15 },
  ],
  [
    { time: "08:30", name: "Morning market visit", description: "Explore the morning market and see how locals start the day.", duration: "2h", category: "attraction", costShare: 0.05 },
    { time: "12:30", name: "Regional specialties lunch", description: "Make time for a second local specialty away from yesterday's route.", duration: "1.5h", category: "food", costShare: 0.3 },
    { time: "19:00", name: "Evening street-food walk", description: "Sample small bites and browse the liveliest evening streets.", duration: "2h", category: "food", costShare: 0.2 },
  ],
  [
    { time: "09:00", name: "Nature trail morning", description: "Spend the morning on an easy nature trail outside the busiest area.", duration: "3h", category: "attraction", costShare: 0.1 },
    { time: "13:30", name: "Garden café break", description: "Take a slow lunch and coffee break in a quiet garden setting.", duration: "2h", category: "food", costShare: 0.25 },
    { time: "17:30", name: "Lakeside golden hour", description: "Walk by the water during the softer late-afternoon light.", duration: "1.5h", category: "leisure", costShare: 0.05 },
  ],
  [
    { time: "09:30", name: "Heritage and culture visit", description: "Learn about the destination through a cultural or heritage stop.", duration: "2.5h", category: "attraction", costShare: 0.15 },
    { time: "13:00", name: "Farm-to-table lunch", description: "Choose a relaxed meal built around regional ingredients.", duration: "1.5h", category: "food", costShare: 0.35 },
    { time: "18:30", name: "Riverside evening stroll", description: "Unwind with a walk through a calmer neighborhood at dusk.", duration: "1.5h", category: "leisure", costShare: 0.05 },
  ],
  [
    { time: "08:00", name: "Countryside day trip", description: "Take a half-day route through the surrounding countryside.", duration: "4h", category: "attraction", costShare: 0.2 },
    { time: "13:00", name: "Picnic or countryside lunch", description: "Have lunch close to the day's outdoor route.", duration: "1.5h", category: "food", costShare: 0.25 },
    { time: "19:30", name: "Night-view lookout", description: "See the destination from a different angle after dark.", duration: "1h", category: "leisure", costShare: 0.1 },
  ],
  [
    { time: "09:00", name: "Creative workshop", description: "Try a hands-on craft, coffee, or cooking experience.", duration: "2.5h", category: "attraction", costShare: 0.25 },
    { time: "13:30", name: "Neighborhood lunch crawl", description: "Compare two small local stops instead of repeating a single meal route.", duration: "2h", category: "food", costShare: 0.3 },
    { time: "18:00", name: "Local music or art evening", description: "Leave room for a low-key cultural experience after dinner.", duration: "2h", category: "leisure", costShare: 0.15 },
  ],
  [
    { time: "09:00", name: "Favorite-place revisit", description: "Return to the part of the city that best matched your pace this week.", duration: "2h", category: "attraction", costShare: 0.05 },
    { time: "12:30", name: "Farewell meal", description: "Use the final lunch to try one last signature dish.", duration: "1.5h", category: "food", costShare: 0.35 },
    { time: "17:00", name: "Farewell photo walk", description: "Take a final unhurried walk and collect a few last memories.", duration: "1.5h", category: "leisure", costShare: 0.05 },
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
      const templates = MOCK_DAY_PLANS[idx % MOCK_DAY_PLANS.length]!;
      const dayCycle = Math.floor(idx / MOCK_DAY_PLANS.length);
      const dailyCost = Math.max(100, Math.round(baseDaily * (1 + ((idx % 3) - 1) * 0.08)));
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
