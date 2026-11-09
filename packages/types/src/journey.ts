import { flexibleMonthWindows, plannerToday } from "./flexible-dates";
import type { Itinerary, ItineraryInput, Activity } from "./itinerary";

export type Requirement = { value: string; priority: "required" | "preferred" };
export interface JourneyLocation {
  label: string;
  city_slug?: string;
  latitude?: number;
  longitude?: number;
  accuracy_m?: number;
  source: "manual" | "browser" | "catalog";
}
export interface PlanningCriteria {
  schema_version: 2;
  journey: {
    origin: JourneyLocation;
    return_to_origin: boolean;
    endpoint?: JourneyLocation;
    destinations: string[];
    timezone: "Asia/Ho_Chi_Minh";
  };
  travelers: { adults: number; child_ages: number[] };
  budget: { total?: number; currency: string };
  transport_preferences: {
    mode: string;
    arrival_at?: string;
    departure_at?: string;
    airport_buffer_minutes: number;
    confirmed: boolean;
    provider?: string;
    booking_reference?: string;
    total_price?: number;
  };
  stay_preferences: {
    type: string;
    rooms: number;
    nightly_budget?: number;
    requirements: Requirement[];
    booked_name?: string;
    booking_reference?: string;
    check_in?: string;
    check_out?: string;
  };
  dining_preferences: {
    requirements: Requirement[];
    allergies: string[];
    per_person_budget?: number;
    cafe: string;
    independent_only: boolean;
  };
  experience_preferences: {
    pace: "relaxed" | "balanced" | "packed";
    interests: string[];
    requirements: Requirement[];
  };
}
export interface PlanningIssue {
  params?: Record<string, string | number>;
  code: string;
  severity: "error" | "warning";
  message: string;
  field?: string;
  day_id?: string;
}
export type TimelineKind =
  | "visit"
  | "meal"
  | "cafe"
  | "transfer"
  | "check_in"
  | "check_out"
  | "rest";
export interface ScopedPrice {
  basis?: "planning_estimate" | "catalog" | "user";
  assumption?: string;
  amount: number | null;
  currency: string;
  scope: "person" | "group" | "room_night" | "segment";
  status: "estimated" | "user_confirmed";
}
export interface PlaceEvidence {
  source: "catalog" | "user" | "ai_suggestion";
  source_id?: string;
  verified_at?: string;
  url?: string;
}
export interface AccommodationBooking {
  id: string;
  trip_id: string;
  name: string;
  city: string;
  rooms: number;
  guests: number;
  check_in_date: string | null;
  check_out_date: string | null;
  nights: number;
  price_per_night: number | null;
  total_price: number | null;
  currency: string;
  booking_status: "planned" | "selected" | "booked" | "cancelled" | "completed";
  booking_provider: string | null;
  booking_reference: string | null;
  room_type: string | null;
  cancellation_policy: string | null;
  booking_url: string | null;
  locked: boolean;
  version: number;
}
export interface PlanningJob {
  translation_id?: string;
  error_code?: string;
  error_params?: Record<string, string | number>;
  id: string;
  status: "queued" | "processing" | "complete" | "failed";
  stage: string;
  attempts: number;
  itinerary_id?: string;
  revision_id?: string;
  error?: string;
}
export interface PlanningJobSummary extends PlanningJob {
  created_at: string;
  city_names: string[];
  num_days: number;
}

export interface PlanRevision {
  id: string;
  base_version: number;
  status: string;
  candidate: Itinerary;
  diff: {
    added: string[];
    removed: string[];
    changed: string[];
    cost_delta: number;
  };
}

export function createPlanningCriteria(): PlanningCriteria {
  return {
    schema_version: 2,
    journey: {
      origin: { label: "", source: "manual" },
      return_to_origin: true,
      destinations: [],
      timezone: "Asia/Ho_Chi_Minh",
    },
    travelers: { adults: 2, child_ages: [] },
    budget: { currency: "VND" },
    transport_preferences: {
      mode: "suggest",
      airport_buffer_minutes: 120,
      confirmed: false,
    },
    stay_preferences: { type: "hotel", rooms: 1, requirements: [] },
    dining_preferences: {
      requirements: [],
      allergies: [],
      cafe: "",
      independent_only: true,
    },
    experience_preferences: {
      pace: "balanced",
      interests: [],
      requirements: [],
    },
  };
}

export function validTripDate(value: string): boolean {
  const time = Date.parse(`${value}T00:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(time) &&
    new Date(time).toISOString().slice(0, 10) === value
  );
}
export function localTripInstant(value?: string): number | null {
  if (!value || !validTripDate(value.slice(0, 10))) return null;
  const hasZone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
  const parsed = Date.parse(
    hasZone
      ? value
      : `${value.length === 10 ? `${value}T00:00:00` : value}+07:00`,
  );
  return Number.isFinite(parsed) ? parsed : null;
}
export function tripDayCount(
  input: Pick<ItineraryInput, "start_date" | "end_date" | "num_days">,
): number {
  const start = localTripInstant(input.start_date),
    end = localTripInstant(input.end_date);
  return start !== null && end !== null
    ? Math.round((end - start) / 86400000) + 1
    : (input.num_days ?? 1);
}
export function validatePlanning(input: Partial<ItineraryInput>): {
  valid: boolean;
  issues: PlanningIssue[];
} {
  const p = input.planning;
  const issues: PlanningIssue[] = [];
  const issue = (
    code: string,
    message: string,
    field?: string,
    severity: PlanningIssue["severity"] = "warning",
  ) => issues.push({ code, message, field, severity, params: {} });
  if (input.flexible_month !== undefined) {
    if (
      !flexibleMonthWindows(
        input.flexible_month,
        input.num_days ?? 1,
        plannerToday(),
      ).length ||
      (input.start_date &&
        input.start_date.slice(0, 7) !== input.flexible_month) ||
      (input.end_date && input.end_date.slice(0, 7) !== input.flexible_month)
    )
      issue(
        "MONTH_UNAVAILABLE",
        "Chọn tháng còn đủ số ngày cho chuyến đi.",
        "flexible_month",
        "error",
      );
    if (
      p?.transport_preferences.confirmed ||
      p?.stay_preferences.type === "already_booked"
    )
      issue(
        "MONTH_BOOKING_CONFLICT",
        "Hãy chọn ngày cụ thể khi đã có vé hoặc phòng đặt trước.",
        "flexible_month",
        "error",
      );
  }
  if (!p) return { valid: !issues.some((i) => i.severity === "error"), issues };
  if (!p.journey.origin.label.trim())
    issue(
      "ORIGIN_REQUIRED",
      "Chọn điểm xuất phát để lập chặng đi và về.",
      "journey.origin",
      "error",
    );
  if (!p.journey.return_to_origin && !p.journey.endpoint?.label.trim())
    issue(
      "ENDPOINT_REQUIRED",
      "Chọn điểm kết thúc chuyến đi.",
      "journey.endpoint",
      "error",
    );
  if (!(input.cities?.length || p.journey.destinations.length))
    issue(
      "DESTINATION_REQUIRED",
      "Chọn ít nhất một điểm đến.",
      "journey.destinations",
      "error",
    );
  if (
    (input.start_date && !validTripDate(input.start_date)) ||
    (input.end_date && !validTripDate(input.end_date))
  )
    issue("DATE_INVALID", "Ngày đi/về không hợp lệ.", "end_date", "error");
  if (
    input.start_date &&
    input.end_date &&
    (input.end_date < input.start_date ||
      (input.end_date === input.start_date && !input.flexible_month))
  )
    issue("DATE_ORDER", "Ngày về phải sau ngày đi.", "end_date", "error");
  if (input.start_date && !input.end_date)
    issue(
      "END_DATE_REQUIRED",
      "Chọn ngày kết thúc hoặc dùng số ngày.",
      "end_date",
      "error",
    );
  if (
    !Number.isInteger(tripDayCount({ ...input })) ||
    tripDayCount({ ...input }) > 30 ||
    tripDayCount({ ...input }) < 1
  )
    issue(
      "TRIP_LENGTH",
      "Chuyến đi cần từ 1 đến 30 ngày.",
      "num_days",
      "error",
    );
  const totalTravelers = p.travelers.adults + p.travelers.child_ages.length;
  if (
    p.travelers.adults < 1 ||
    totalTravelers > 20 ||
    p.travelers.child_ages.some(
      (age) => age < 0 || age > 17 || !Number.isInteger(age),
    )
  )
    issue(
      "TRAVELERS_INVALID",
      "Cần ít nhất một người lớn, tối đa 20 khách; tuổi trẻ em từ 0–17.",
      "travelers",
      "error",
    );
  if (p.stay_preferences.rooms < 1 || p.stay_preferences.rooms > 20)
    issue(
      "ROOMS_INVALID",
      "Số phòng cần từ 1–20.",
      "stay_preferences.rooms",
      "error",
    );
  const arrival = localTripInstant(p.transport_preferences.arrival_at),
    departure = localTripInstant(p.transport_preferences.departure_at);
  if (
    (p.transport_preferences.arrival_at && arrival === null) ||
    (p.transport_preferences.departure_at && departure === null)
  )
    issue(
      "TIME_INVALID",
      "Thời gian di chuyển không hợp lệ.",
      "transport_preferences",
      "error",
    );
  if (arrival !== null && departure !== null && departure <= arrival)
    issue(
      "TRAVEL_TIME_ORDER",
      "Giờ rời điểm đến phải sau giờ đến.",
      "transport_preferences.departure_at",
      "error",
    );
  if (p.transport_preferences.mode === "flight" && (!arrival || !departure))
    issue(
      "FLIGHT_TIMES_MISSING",
      "Chưa đủ giờ bay; các chặng và thời gian dự phòng là ước tính.",
      "transport_preferences",
    );
  if (
    p.transport_preferences.confirmed &&
    (!arrival || !departure || !p.transport_preferences.provider)
  )
    issue(
      "TICKET_DETAILS_MISSING",
      "Bổ sung nhà cung cấp và giờ vé đã đặt.",
      "transport_preferences",
      "error",
    );
  if (
    (p.stay_preferences.check_in &&
      !validTripDate(p.stay_preferences.check_in)) ||
    (p.stay_preferences.check_out &&
      !validTripDate(p.stay_preferences.check_out))
  )
    issue(
      "STAY_DATES_INVALID",
      "Ngày nhận/trả phòng không hợp lệ.",
      "stay_preferences",
      "error",
    );
  if (
    p.stay_preferences.check_in &&
    p.stay_preferences.check_out &&
    p.stay_preferences.check_out <= p.stay_preferences.check_in
  )
    issue(
      "STAY_DATE_ORDER",
      "Ngày trả phòng phải sau ngày nhận phòng.",
      "stay_preferences",
      "error",
    );
  if (
    p.stay_preferences.type === "already_booked" &&
    !p.stay_preferences.booked_name?.trim()
  )
    issue(
      "BOOKED_STAY_REQUIRED",
      "Nhập tên chỗ ở đã đặt.",
      "stay_preferences.booked_name",
      "error",
    );
  if (
    tripDayCount({ ...input }) > 1 &&
    !["none", "already_booked"].includes(p.stay_preferences.type)
  )
    issue(
      "STAY_NOT_SELECTED",
      "Chưa chọn chỗ ở; cần xác nhận trước khi đặt phòng.",
      "stay_preferences",
    );
  if (p.dining_preferences.allergies.length)
    issue(
      "ALLERGY_CONFIRMATION",
      "Liên hệ trực tiếp quán để xác nhận dị ứng; gợi ý không bảo đảm an toàn dị ứng.",
      "dining_preferences.allergies",
    );
  const nights = Math.max(0, tripDayCount({ ...input }) - 1);
  const stayTotal =
    p.stay_preferences.type === "none"
      ? 0
      : nights *
        p.stay_preferences.rooms *
        (p.stay_preferences.nightly_budget ?? 0);
  if (p.budget.total !== undefined && stayTotal > p.budget.total)
    issue(
      "LODGING_OVER_BUDGET",
      "Riêng tiền phòng dự kiến đã vượt ngân sách cả nhóm.",
      "budget",
    );
  return { valid: !issues.some((i) => i.severity === "error"), issues };
}

export function stablePlanId(prefix: string, value: string): string {
  let hash = 2166136261;
  for (const char of value)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `${prefix}-${(hash >>> 0).toString(16)}`;
}
export function timelineKind(a: Activity): TimelineKind {
  if (a.kind) return a.kind;
  return a.category === "transport"
    ? "transfer"
    : a.category === "accommodation"
      ? "check_in"
      : a.category === "food"
        ? "meal"
        : "visit";
}

/** Add metadata without discarding legacy notes or replacing unknowns with facts. */
export function upgradeJourneyPlan(
  plan: Itinerary,
  input?: ItineraryInput,
): Itinerary {
  const planning = input?.planning ?? plan.planning;
  const result: Itinerary = {
    ...plan,
    schema_version: 2,
    version: plan.version ?? 1,
    planning,
    days: (plan.days ?? []).map((day, index) => ({
      ...day,
      id:
        day.id ??
        stablePlanId(
          "day",
          `${day.day_number ?? index + 1}:${day.city}:${day.date}`,
        ),
      activities: (day.activities ?? []).map((a, i) => ({
        ...a,
        id: a.id ?? stablePlanId("item", `${day.day_number}:${a.name}:${i}`),
        kind: timelineKind(a),
        evidence: a.evidence ?? { source: "ai_suggestion" as const },
        price: a.price ?? {
          amount: a.cost,
          currency: a.currency || plan.currency,
          scope: "group" as const,
          status: "estimated" as const,
        },
      })),
    })),
    hotels: (plan.hotels ?? []).map((h, i) => ({
      ...h,
      id: h.id ?? stablePlanId("stay", `${h.name}:${i}`),
      evidence: h.evidence ?? { source: "ai_suggestion" as const },
    })),
    restaurants: (plan.restaurants ?? []).map((r, i) => ({
      ...r,
      id: r.id ?? stablePlanId("dining", `${r.name}:${i}`),
      evidence: r.evidence ?? { source: "ai_suggestion" as const },
    })),
    transport_summary: (plan.transport_summary ?? []).map((s, i) => ({
      ...s,
      id: s.id ?? stablePlanId("leg", `${s.from}:${s.to}:${i}`),
    })),
  };
  const issues = input
    ? validatePlanning(input).issues
    : [...(plan.issues ?? [])];
  if (input && result.days.length !== tripDayCount(input))
    issues.push({
      code: "DAY_COUNT_MISMATCH",
      severity: "error",
      message: "Kết quả chưa đủ số ngày đã yêu cầu; cần tạo lại.",
    });
  if (planning) {
    const end = planning.journey.return_to_origin
      ? planning.journey.origin
      : planning.journey.endpoint;
    if (
      !result.transport_summary.some(
        (s) => s.from === planning.journey.origin.label,
      )
    )
      issues.push({
        code: "OUTBOUND_MISSING",
        severity: "warning",
        message: "Chặng từ điểm xuất phát chưa đủ dữ liệu, cần bổ sung.",
      });
    if (end && !result.transport_summary.some((s) => s.to === end.label))
      issues.push({
        code: "RETURN_MISSING",
        severity: "warning",
        message: "Chặng về điểm kết thúc chưa đủ dữ liệu, cần bổ sung.",
      });
    const limit = planning.budget.total;
    if (limit !== undefined && plan.total_cost > limit)
      issues.push({
        code: "OVER_BUDGET",
        params: { amount: plan.total_cost - limit, currency: plan.currency },
        severity: "warning",
        message: `Chi phí dự kiến vượt ngân sách ${plan.total_cost - limit} ${plan.currency}.`,
      });
    const arrival = localTripInstant(planning.transport_preferences.arrival_at);
    const departure = localTripInstant(
      planning.transport_preferences.departure_at,
    );
    const buffer =
      planning.transport_preferences.mode === "flight"
        ? planning.transport_preferences.airport_buffer_minutes * 60000
        : 0;
    for (const day of result.days) {
      let previousEnd = 0;
      for (const a of day.activities) {
        const time =
          /^\d{2}:\d{2}$/.test(a.time) && day.date
            ? localTripInstant(`${day.date.slice(0, 10)}T${a.time}:00`)
            : null;
        const hours = /([\d.]+)\s*h/.exec(a.duration),
          minutes = /(\d+)\s*(?:m|min|phút)/.exec(a.duration);
        const duration =
          (a.duration_minutes ??
            Number(hours?.[1] ?? 0) * 60 + Number(minutes?.[1] ?? 0)) * 60000;
        if (time !== null) {
          if (
            a.kind !== "transfer" &&
            ((arrival !== null && time < arrival) ||
              (departure !== null && time + duration > departure - buffer))
          )
            issues.push({
              code: "TRAVEL_CONFLICT",
              params: { activity: a.name },
              severity: "error",
              message: `${a.name}: trùng giờ di chuyển hoặc khoảng dự phòng.`,
              day_id: day.id,
            });
          if (time < previousEnd)
            issues.push({
              code: "OVERLAP",
              params: { activity: a.name },
              severity: "warning",
              message: `${a.name}: thời gian chồng với mục trước.`,
              day_id: day.id,
            });
          previousEnd = time + duration;
        }
      }
    }
    const required = [
      ...planning.stay_preferences.requirements,
      ...planning.dining_preferences.requirements,
      ...planning.experience_preferences.requirements,
    ].filter((r) => r.priority === "required");
    if (required.length)
      issues.push({
        code: "REQUIREMENTS_UNVERIFIED",
        params: { criteria: required.map((r) => r.value).join(", ") },
        severity: "warning",
        message: `Cần xác minh tiêu chí bắt buộc: ${required.map((r) => r.value).join(", ")}.`,
      });
  }
  if (result.budget_breakdown) {
    const b = result.budget_breakdown;
    const sum =
      b.accommodation + b.food + b.activities + b.transport + b.contingency;
    if (
      Math.abs(sum - b.total) > 1 ||
      Math.abs(b.total - result.total_cost) > 1
    )
      issues.push({
        code: "COST_MISMATCH",
        severity: "warning",
        message:
          "Chi phí thành phần chưa khớp tổng; cần kiểm tra trước khi đặt.",
      });
    if (planning?.stay_preferences.type === "none" && b.accommodation > 0)
      issues.push({
        code: "UNEXPECTED_STAY_COST",
        severity: "error",
        message: "Chuyến không nghỉ đêm đang có chi phí phòng.",
      });
  }
  result.issues = [
    ...new Map(issues.map((i) => [`${i.code}:${i.message}`, i])).values(),
  ];
  return result;
}
