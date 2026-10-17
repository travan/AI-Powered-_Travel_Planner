import type { ItineraryInput, ItineraryOverview } from "@travel/types";
import type { PreFetchedCityData } from "../provider.js";

export const SYSTEM_PROMPT = (locale: string) =>
  locale === "vi"
    ? `Bạn là chuyên gia lập kế hoạch du lịch. Chỉ trả JSON hợp lệ đúng schema. Tuân thủ số ngày, ngân sách tổng và phong cách. Mỗi ngày đủ 6-8 hoạt động KHÔNG phải bữa ăn, trải đều từ sáng đến tối; ngày di chuyển có thể 3-4. Mỗi hoạt động phải nêu địa điểm/tên khu vực CỤ THỂ và mô tả 3 câu hữu ích: nên làm gì tại đó, vì sao đáng đi, cùng mẹo thực tế hoặc cách di chuyển. Không dùng mục chung chung như "khám phá trung tâm", "tham quan các địa danh" hay "mua sắm cuối ngày". Ưu tiên dữ liệu có source đáng tin cậy; các mục source="ai_generated" hoặc "user_submission" chỉ là gợi ý chưa xác minh, không khẳng định chắc chắn đó là địa điểm có thật. Khi thiếu dữ liệu thì dùng kiến thức chung, không bịa giờ mở cửa, giá hiện thời, thời tiết hoặc lịch phương tiện. Ghi điều cần xác minh vào seasonal_notes.warnings. Không đưa bữa ăn vào activities; gợi ý ăn uống chỉ nằm trong restaurants. Tránh lặp địa điểm/ý tưởng.`
    : `You are an expert travel planner. Return only valid JSON matching the requested schema. Respect exact trip length, total group budget, and travel style. Each full day needs 6-8 distinct NON-MEAL activities spread from morning to evening; a travel day may have 3-4. Every activity must name a SPECIFIC real venue or named neighborhood and have 3 useful sentences: what to do there, why it is worthwhile, plus a practical tip or how to get around. Never use generic filler such as "explore the city center", "visit local landmarks", or "final shopping". Prefer supplied city data from trusted sources. Entries marked source="ai_generated" or source="user_submission" are unverified suggestions; do not present them as confirmed real places. Otherwise use general knowledge without inventing current hours, prices, weather, or transit schedules. Put verification reminders in seasonal_notes.warnings. Keep meals out of activities; put dining recommendations only in restaurants. Do not repeat places or ideas.`;

export function buildOverviewPrompt(
  input: ItineraryInput,
  cityData: PreFetchedCityData[],
): string {
  const cityNames = cityData.map((c) => c.city).join(", ");
  const dateInfo =
    input.start_date && input.end_date
      ? `${input.start_date} to ${input.end_date}`
      : `${input.num_days ?? 1} days; dates not specified`;
  const budgetInfo =
    input.budget !== undefined
      ? `${input.budget} ${input.currency} total for all ${input.num_travelers} traveler(s)`
      : `No fixed budget; provide a sensible estimate in ${input.currency}`;

  return `
Create a concise trip overview.
DESTINATIONS: ${cityNames}
DURATION: ${dateInfo}
BUDGET: ${budgetInfo}
STYLE: ${input.trip_style} (keep this exact level; do not convert mid_range to mixed)
TRAVELERS: ${input.num_travelers}
EXTRA REQUEST: ${input.prompt_text?.trim() || "none"}
KNOWN CONTEXT: ${JSON.stringify(cityData.map(({ city, country, currency }) => ({ city, country, currency })))}

Return JSON only: {"title":"short title","overview":"one sentence","cities":["requested names"],"total_days":${input.num_days ?? 1},"estimated_budget":{"min":number,"max":number,"currency":"${input.currency}"},"day_plan":["Day 1: city", "..."]}.
Use exactly the requested number of days. Keep the overview short; this is an intermediate step, not the final itinerary.`.trim();
}

export function buildDetailPrompt(
  input: ItineraryInput,
  overview: ItineraryOverview,
  cityData: PreFetchedCityData[],
): string {
  const dateInfo =
    input.start_date && input.end_date
      ? `${input.start_date} to ${input.end_date}`
      : `${overview.total_days} days; travel dates not specified`;
  const budgetInfo =
    input.budget !== undefined
      ? `${input.budget} ${input.currency} total for the entire group of ${input.num_travelers}; stay within this total`
      : `No fixed total; choose a realistic estimate in ${input.currency}`;

  return `
Create the final itinerary JSON. Make it detailed enough to follow on the ground, but do not write an essay.
TRIP: ${overview.cities.join(", ")} | ${dateInfo} | ${input.trip_style} | ${input.num_travelers} travelers
BUDGET: ${budgetInfo}
USER REQUEST: ${input.prompt_text?.trim() || "none"}
DAY OUTLINE: ${overview.day_plan.join("; ")}
CITY CATALOG DATA (each entry includes a source; ai_generated and user_submission entries are unverified suggestions, not confirmed facts): ${JSON.stringify(cityData.map(({ city, country, currency, places, restaurants, hotels, transport_options, ticket_options }) => ({ city, country, currency, places, restaurants, hotels, transport_options, ticket_options })))}

QUALITY RULES:
- Return exactly ${overview.total_days} days, numbered 1..${overview.total_days}. A full day needs 6-8 distinct non-meal activities across morning, late morning, afternoon, and evening; use 3-4 only for arrival/departure or a user-requested rest day. Meals do not count toward this minimum and never replace experiences.
- Include a balanced mix of named landmarks, culture/hands-on experiences, a walkable neighborhood or market, and nature/viewpoint/evening activity where available. Every activity name must identify a specific real venue or named area; reject generic labels such as "Explore [city]", "city landmarks", "final shopping", or "free time". Each activity description must be 3 concise but informative sentences (about 45-65 words total): the first explains a specific on-site plan; the second explains what makes this stop worthwhile; the third gives a practical route from the previous stop, timing, or preparation tip without inventing exact current hours. Use realistic time and duration. Do not put meals or category=food entries in activities; put all meal and restaurant choices in restaurants instead. Before returning JSON, count the non-meal activities for every full day and ensure there are 6-8.
- Group each day by one city and cluster stops geographically to reduce backtracking. Leave realistic breaks and travel time; do not repeat venues, pad the schedule, or use vague filler such as "explore the city".
- Preserve style "${input.trip_style}": budget=low-cost/transit/simple stays; mid_range=moderate-cost/comfortable stays; luxury=premium; family=child-friendly/rest breaks; romantic=two-person experiences; cultural=museums/heritage; adventure=active outdoors. Other styles follow their literal meaning.
- Treat ${input.budget ?? "unspecified"} ${input.currency} as the total budget for all travelers, not per person. Allocate costs across lodging, food, activities, transport and contingency; breakdown must sum exactly to total_cost and total_cost must not exceed the budget when one is supplied.
- Use approximate costs only. Do not invent live prices, exact opening hours, addresses, weather forecasts, coordinates, bookings or transit schedules. Treat supplied city/place data as grounding, not as permission to invent missing facts. Use empty strings for unknown optional text and add one concise verification warning for time-sensitive facts.
- Include transport_summary only for useful named routes with non-empty from, to and recommended_mode. Allowed modes: train, flight, bus, car, self_drive, taxi, motorbike, bicycle, boat, ferry, cruise, walk, other. Each entry must be {"segment":"route label","from":"named origin","to":"named destination","recommended_mode":"one allowed mode","options":[]}. Add options only when grounded: {"provider":"name","type":"transport type","duration":"approximate travel time","price_range":"estimate or empty","booking_url":"verified URL or empty","note":"practical tip"}. Never return empty objects, placeholder routes or made-up booking URLs. Use [] if no useful route is available.
- Do not assume admission, interior access, tours or venue activities are available without grounding. Describe public areas/exteriors when access is uncertain, and ask travelers to verify access rather than inventing it.
- Keep overview and notes short. Return no markdown or prose outside JSON.

Required JSON shape (all keys required; use empty arrays when there are no entries):
{"title":"string","overview":"2 concise sentences","total_cost":number,"currency":"${input.currency}","num_days":${overview.total_days},"num_travelers":${input.num_travelers},"seasonal_notes":{"travel_month":"string or empty","daylight_hours":"string or empty","sunrise_time":"string or empty","sunset_time":"string or empty","weather_note":"general only or empty","highlights":["string"],"warnings":["string"]},"transport_summary":[],"days":[{"day_number":1,"date":"YYYY-MM-DD or empty","city":"string","title":"short area/theme","activities":[{"time":"HH:MM or time of day","name":"specific venue/activity","description":"3 useful sentences: on-site plan, reason to visit, and practical travel/timing tip","duration":"e.g. 2h","cost":0,"currency":"${input.currency}","category":"attraction|food|transport|accommodation|leisure|shopping","maps_link":"","ticket_activities":[]}],"daily_cost_estimate":number}],"hotels":[{"name":"string","stars":number,"price_per_night":"approximate or empty","price_range":"approximate or empty","booking_url":"","airbnb_url":"","address":"","maps_link":"","note":"mark as suggestion"}],"restaurants":[{"name":"string","cuisine":"string","price_range":"approximate or empty","price_per_person":"approximate or empty","address":"","maps_link":"","tiktok_search_link":"","ig_search_link":"","note":"mark as suggestion"}],"suggestions":[],"budget_breakdown":{"accommodation":number,"food":number,"activities":number,"transport":number,"contingency":number,"total":number,"currency":"${input.currency}","per_person":number,"per_day":number}}`.trim();
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
