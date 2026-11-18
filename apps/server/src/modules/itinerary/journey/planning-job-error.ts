import { PlanningGenerationError } from "@travel/ai";
import { HttpException } from "@nestjs/common";
import { generationErrorParams } from "../generation/generation-error.js";
export const generationCodes = new Set([
  "PLANNING_DATA_INSUFFICIENT",
  "PLANNING_BUDGET_UNSATISFIABLE",
  "AI_RESPONSE_INVALID",
  "AI_RESULT_UNKNOWN",
  "GENERATION_DEADLINE_EXCEEDED",
]);

const inputFields = new Map([
  ["CITY_UNRESOLVED", "journey.destinations"],
  ["CITY_AMBIGUOUS", "journey.destinations"],
  ["UNSUPPORTED_DESTINATION", "journey.destinations"],
  ["MONTH_UNAVAILABLE", "flexible_month"],
  ["MONTH_BOOKING_CONFLICT", "flexible_month"],
  ["ORIGIN_REQUIRED", "journey.origin"],
  ["ENDPOINT_REQUIRED", "journey.endpoint"],
  ["DESTINATION_REQUIRED", "journey.destinations"],
  ["DATE_INVALID", "end_date"],
  ["DATE_ORDER", "end_date"],
  ["END_DATE_REQUIRED", "end_date"],
  ["TRIP_LENGTH", "num_days"],
  ["TRAVELERS_INVALID", "travelers"],
  ["ROOMS_INVALID", "stay_preferences.rooms"],
  ["TIME_INVALID", "transport_preferences"],
  ["TRAVEL_TIME_ORDER", "transport_preferences.departure_at"],
  ["TICKET_DETAILS_MISSING", "transport_preferences"],
  ["STAY_DATES_INVALID", "stay_preferences"],
  ["STAY_DATE_ORDER", "stay_preferences"],
  ["BOOKED_STAY_REQUIRED", "stay_preferences.booked_name"],
]);

export function planningErrorParams(reason: unknown): Record<string, string> {
  if (typeof reason !== "string") return {};
  const field = inputFields.get(reason);
  return field ? { reason, field } : {};
}

const dayIssueCodes = new Set([
  "JOURNEY_DAY_ORDER",
  "JOURNEY_LEG_MISSING",
  "MEAL_MISSING",
  "ACTIVITIES_MISSING",
  "EVENING_MISSING",
  "HOTEL_RETURN_MISSING",
  "SCHEDULE_CONFLICT",
  "SCHEDULE_DETAILS_MISSING",
  "REPEATED_PLACE",
  "DAY_ENTRY_INCOMPLETE",
  "DAY_MEAL_MISMATCH",
  "DAY_VENUE_MISMATCH",
  "DAY_PRICE_INVALID",
  "DAY_COST_DUPLICATED",
  "DAY_PLACE_REPEATED",
]);
export function budgetErrorParams(value: unknown): Record<string, string | number> {
  if (!value || typeof value !== "object") return {};
  const source = value as Record<string, unknown>;
  const result: Record<string, string | number> = {};
  for (const key of ["budget_total", "estimated_total", "accommodation", "food", "activities", "transport", "contingency"]) {
    const amount = source[key];
    if (typeof amount === "number" && Number.isFinite(amount) && amount >= 0 && amount <= 1e15) result[key] = amount;
  }
  if (typeof source.currency === "string" && /^[A-Z]{3}$/.test(source.currency)) result.currency = source.currency;
  return result;
}
export function validationErrorParams(
  value: unknown,
): Record<string, string | number> {
  if (!value || typeof value !== "object") return {};
  const source = value as Record<string, unknown>;
  const result: Record<string, string | number> = {};
  if (
    Number.isInteger(source.day) &&
    Number(source.day) >= 1 &&
    Number(source.day) <= 30
  )
    result.day = Number(source.day);
  for (let i = 1; i <= 5; i++) {
    const code = source[`issue_${i}_code`],
      slot = source[`issue_${i}_slot`];
    if (
      typeof code === "string" &&
      dayIssueCodes.has(code) &&
      typeof slot === "string" &&
      /^[a-z0-9_]{1,80}$/.test(slot)
    ) {
      result[`issue_${i}_code`] = code;
      result[`issue_${i}_slot`] = slot;
    }
  }
  return result;
}

export function publicJobError(code?: string) {
  if (code && generationCodes.has(code)) return code;
  switch (code) {
    case "PLANNING_INVALID":
    case "AI_UNAVAILABLE":
    case "AI_QUOTA_EXHAUSTED":
    case "AI_OUTLINE_INVALID":
    case "AI_DAY_INVALID":
    case "AI_PROVIDER_CONFIGURATION_INVALID":
    case "AI_AUTH_INVALID":
    case "AI_RATE_LIMITED":
    case "NO_ITINERARY":
    case "LOCATION_LOOKUP_UNAVAILABLE":
      return code;
    default:
      return "PLANNING_FAILED";
  }
}

export function classifyJobError(error: unknown, stage: string, kind: string) {
  if (kind === "generate" && error instanceof PlanningGenerationError) {
    const quota = error.code === "AI_QUOTA_EXHAUSTED";
    const next = new Date();
    next.setUTCHours(24, 0, 0, 0);
    const params: Record<string, string | number> =
      quota && error.provider === "cloudflare"
        ? { retry_at: next.toISOString() }
        : {};
    if (error.details)
      Object.assign(
        params,
        validationErrorParams({
          day: error.details.day,
          ...Object.fromEntries(
            error.details.issues.slice(0, 5).flatMap((issue, index) => [
              [`issue_${index + 1}_code`, issue.code],
              [`issue_${index + 1}_slot`, issue.slot],
            ]),
          ),
        }),
      );
    return {
      code: error.code,
      params,
      status: quota ? 429 : 422,
      terminal: true,
      retrySeconds: 15,
    };
  }
  const http = error instanceof HttpException;
  const upstream = error as {
    status?: number;
    statusCode?: number;
    headers?: Headers | Record<string, string>;
  } | null;
  const status = http
    ? error.getStatus()
    : (upstream?.status ?? upstream?.statusCode);
  const body = http
    ? (error.getResponse() as {
        code?: string;
        issues?: { code: string; severity: string }[];
        params?: { reason?: unknown };
      })
    : undefined;
  const reason =
    body?.code === "PLANNING_INVALID" && Array.isArray(body.issues)
      ? body.issues.find((issue) => issue.severity === "error")?.code
      : body?.code;
  const params = planningErrorParams(reason);
  if (kind === "generate" && body?.code && generationCodes.has(body.code))
    return {
      code: body.code,
      params: {
        ...generationErrorParams(body.params?.reason),
        ...validationErrorParams(body.params),
        ...(body.code === "PLANNING_BUDGET_UNSATISFIABLE" ? budgetErrorParams(body.params) : {}),
      },
      status,
      terminal: true,
      retrySeconds: 15,
    };
  if (
    kind === "generate" &&
    [
      "AI_PROVIDER_CONFIGURATION_INVALID",
      "AI_AUTH_INVALID",
      "AI_RATE_LIMITED",
    ].includes(body?.code ?? "")
  )
    return {
      code: body!.code!,
      params: {},
      status,
      terminal: true,
      retrySeconds: 15,
    };
  const invalid =
    kind === "generate" &&
    status === 400 &&
    (body?.code === "PLANNING_INVALID" || Boolean(params.reason));
  const locationUnavailable =
    kind === "generate" &&
    (stage === "catalog" || body?.code === "LOCATION_LOOKUP_UNAVAILABLE") &&
    (status === 429 || status === 503);
  const aiUnavailable =
    kind === "generate" &&
    (body?.code === "AI_UNAVAILABLE" ||
      ((status === 429 || status === 503) &&
        ["overview", "detail", "repair"].includes(stage)));
  const code = invalid
    ? "PLANNING_INVALID"
    : aiUnavailable
      ? "AI_UNAVAILABLE"
      : locationUnavailable
        ? "LOCATION_LOOKUP_UNAVAILABLE"
        : body?.code === "NO_ITINERARY" && kind === "generate"
          ? "NO_ITINERARY"
          : "PLANNING_FAILED";
  const terminal =
    code === "NO_ITINERARY" ||
    (http && [400, 403, 404, 409].includes(error.getStatus()));
  const headers = upstream?.headers;
  const retryAfter =
    headers instanceof Headers
      ? headers.get("retry-after")
      : Object.entries(headers ?? {}).find(
          ([key]) => key.toLowerCase() === "retry-after",
        )?.[1];
  const delay =
    retryAfter == null
      ? 0
      : /^\d+$/.test(retryAfter)
        ? Number(retryAfter)
        : (Date.parse(retryAfter) - Date.now()) / 1000;
  const retrySeconds = Number.isFinite(delay)
    ? Math.min(3600, Math.max(15, Math.ceil(delay)))
    : 15;
  return {
    code,
    params: invalid ? params : {},
    status,
    terminal,
    retrySeconds,
  };
}
