import { PlanningGenerationError } from "@travel/ai";
import { HttpException } from "@nestjs/common";

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

export function publicJobError(code?: string) {
  switch (code) {
    case "PLANNING_INVALID":
    case "AI_UNAVAILABLE":
    case "AI_QUOTA_EXHAUSTED":
    case "AI_OUTLINE_INVALID":
    case "AI_DAY_INVALID":
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
    const params: Record<string, string> = quota
      ? { retry_at: next.toISOString() }
      : {};
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
      })
    : undefined;
  const reason =
    body?.code === "PLANNING_INVALID" && Array.isArray(body.issues)
      ? body.issues.find((issue) => issue.severity === "error")?.code
      : body?.code;
  const params = planningErrorParams(reason);
  const invalid =
    kind === "generate" &&
    status === 400 &&
    (body?.code === "PLANNING_INVALID" || Boolean(params.reason));
  const locationUnavailable =
    kind === "generate" &&
    stage === "catalog" &&
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
