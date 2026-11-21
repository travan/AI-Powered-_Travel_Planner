const fields = [
  "schema_version",
  "locale",
  "title",
  "overview",
  "total_cost",
  "currency",
  "num_days",
  "num_travelers",
  "trip_style",
  "seasonal_notes",
  "transport_summary",
  "days",
  "budget_breakdown",
  "hotels",
  "restaurants",
  "suggestions",
  "weather",
  "city_catalog",
  "issues",
];
const privateFields = new Set([
  "booking_reference",
  "booking_code",
  "booking_url",
  "confirmation_code",
  "prompt_text",
  "generation_cache_key",
  "ai_usage",
  "learning_summary",
  "user_id",
  "owner_user_id",
  "email",
  "phone",
  "token",
  "access_token",
  "refresh_token",
]);
function clean(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !privateFields.has(key))
        .map(([key, item]) => [key, clean(item)]),
    );
  return value;
}
export function publicItinerary(plan: object) {
  const source = plan as Record<string, unknown>;
  return Object.fromEntries(
    fields
      .filter((key) => key in source)
      .map((key) => [key, clean(source[key])]),
  );
}
