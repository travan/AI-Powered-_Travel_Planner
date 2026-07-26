import type { ItineraryInput, ItineraryOverview } from "@travel/types";
import type { PreFetchedCityData } from "../provider.js";

export const SYSTEM_PROMPT = (locale: string) =>
  locale === "vi"
    ? `Bạn là chuyên gia lập kế hoạch du lịch. Bạn CHỈ trả về JSON hợp lệ, không có markdown, không có giải thích thêm. Mọi thông tin phải dựa trên dữ liệu được cung cấp — không bịa thêm thông tin.`
    : `You are an expert travel planner. You ONLY return valid JSON, no markdown, no extra explanation. All information must be based on the provided data — never fabricate facts.`;

export function buildOverviewPrompt(
  input: ItineraryInput,
  cityData: PreFetchedCityData[]
): string {
  const cityNames = cityData.map((c) => c.city).join(", ");
  const dateInfo = input.start_date
    ? `from ${input.start_date} to ${input.end_date}`
    : `${input.num_days} days`;
  const budgetInfo = input.budget
    ? `Budget: ${input.budget} ${input.currency} for ${input.num_travelers} traveler(s)`
    : `No fixed budget — suggest an optimal estimate`;

  return `
Generate a travel itinerary OVERVIEW for: ${cityNames}
Travel dates: ${dateInfo}
${budgetInfo}
Trip style: ${input.trip_style}
Travelers: ${input.num_travelers}

City context (use this data):
${JSON.stringify(
  cityData.map((c) => ({
    city: c.city,
    country: c.country,
    sunrise: c.sunrise,
    sunset: c.sunset,
    daylight: c.daylight_hours,
    weather_note: c.weather_note,
  })),
  null,
  2
)}

Return ONLY this JSON structure:
{
  "title": "string — creative trip title",
  "overview": "string — 2-3 sentence summary",
  "cities": ["city1", "city2"],
  "total_days": number,
  "estimated_budget": { "min": number, "max": number, "currency": "${input.currency}" },
  "day_plan": ["City1 (3 days)", "City2 (2 days)"]
}`.trim();
}

export function buildDetailPrompt(
  input: ItineraryInput,
  overview: ItineraryOverview,
  cityData: PreFetchedCityData[]
): string {
  const dateInfo = input.start_date
    ? `from ${input.start_date} to ${input.end_date}`
    : `${input.num_days} days starting from today`;

  return `
Generate a FULL detailed itinerary. Use ONLY the pre-fetched data below — do not invent places.

TRIP INFO:
- Cities: ${overview.cities.join(", ")}
- Dates: ${dateInfo}
- Budget: ${input.budget ? `${input.budget} ${input.currency}` : "no fixed budget"}
- Style: ${input.trip_style}
- Travelers: ${input.num_travelers}
- Day plan: ${overview.day_plan.join(" → ")}

PRE-FETCHED CITY DATA:
${JSON.stringify(cityData, null, 2)}

INSTRUCTIONS:
1. Distribute activities across the exact number of days in each city
2. Schedule activities in logical geographic order to minimize travel within a day
3. Assign realistic cost estimates based on the city's currency
4. For each attraction that has ticket_options available, include them in ticket_activities
5. Set golden_moment only when the activity is genuinely best at a specific time (sunset views, sunrise hikes, etc.)
6. Transport between cities must use the transport_options data provided
7. Budget breakdown must sum to total_cost

Return strictly this JSON (no extra keys, no markdown):
{
  "title": "${overview.title}",
  "overview": "${overview.overview}",
  "total_cost": number,
  "currency": "${input.currency}",
  "num_days": ${overview.total_days},
  "num_travelers": ${input.num_travelers},
  "seasonal_notes": { ... },
  "transport_summary": [ ... ],
  "days": [ ... ],
  "hotels": [ ... ],
  "restaurants": [ ... ],
  "suggestions": [ ... ],
  "budget_breakdown": { ... }
}`.trim();
}

export function buildNLPPrompt(text: string): string {
  return `
Parse this natural-language travel query into a structured JSON object.

Query: "${text}"

Return ONLY this JSON (omit fields that are not mentioned):
{
  "cities": ["city1", "city2"],
  "num_days": number or null,
  "start_date": "YYYY-MM-DD" or null,
  "end_date": "YYYY-MM-DD" or null,
  "budget": number or null,
  "currency": "USD" or local currency code,
  "trip_style": "adventure|relax|culture|food|mixed",
  "num_travelers": number
}`.trim();
}
