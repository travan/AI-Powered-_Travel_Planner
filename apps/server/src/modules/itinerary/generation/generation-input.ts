import { createHash } from "node:crypto";
import type { ItineraryInput } from "@travel/types";
import * as types from "@travel/types";
import type { GenerateItineraryDto } from "../dto/itinerary.dto.js";
const {
  createPlanningCriteria,
  tripDayCount,
  validatePlanning,
  plannerToday,
  validTripDate,
} = (types as unknown as { default?: typeof types }).default ?? types;
import { BadRequestException } from "@nestjs/common";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return typeof value === "string" ? value.normalize("NFKC").trim() : value;
}
export function generationKey(dto: GenerateItineraryDto): string {
  const { force_refresh: _, ...criteria } = dto;
  return createHash("sha256")
    .update(JSON.stringify(canonical({ version: 2, ...criteria })))
    .digest("hex");
}
export function generationInput(dto: GenerateItineraryDto): ItineraryInput {
  const dateIssue =
    (dto.start_date && !validTripDate(dto.start_date)) ||
    (dto.end_date && !validTripDate(dto.end_date))
      ? "DATE_INVALID"
      : dto.start_date && dto.end_date && dto.end_date < dto.start_date
        ? "DATE_ORDER"
        : tripDayCount(dto) < 1 || tripDayCount(dto) > 30
          ? "TRIP_LENGTH"
          : undefined;
  if (dateIssue)
    throw new BadRequestException({
      code: "PLANNING_INVALID",
      issues: [{ code: dateIssue, severity: "error", field: "end_date" }],
    });
  const validation = validatePlanning(dto as ItineraryInput);
  if (!validation.valid)
    throw new BadRequestException({ code: "PLANNING_INVALID", ...validation });
  const planning = structuredClone(dto.planning ?? createPlanningCriteria());
  if (!dto.planning) {
    planning.journey.destinations = dto.cities;
    planning.travelers.adults = dto.num_travelers;
    planning.budget = { currency: dto.currency, total: dto.budget };
    // Legacy inputs describe a route within destinations and supply no home origin.
    planning.journey.origin = { label: dto.cities[0]!, source: "manual" };
    planning.journey.return_to_origin = false;
    planning.journey.endpoint = { label: dto.cities.at(-1)!, source: "manual" };
  }
  const start_date =
    dto.start_date ??
    (!dto.planning && !dto.flexible_month ? plannerToday() : undefined);
  const end_date =
    dto.end_date ??
    (!dto.planning && start_date
      ? new Date(
          Date.parse(`${start_date}T00:00:00Z`) +
            (tripDayCount(dto) - 1) * 86400000,
        )
          .toISOString()
          .slice(0, 10)
      : undefined);
  return {
    ...dto,
    start_date,
    end_date,
    planning,
    num_days: tripDayCount(dto),
    locale: dto.locale ?? "en",
    currency: planning.budget.currency.toUpperCase(),
    budget: planning.budget.total,
    num_travelers:
      planning.travelers.adults + planning.travelers.child_ages.length,
    trip_style: dto.trip_style as ItineraryInput["trip_style"],
  };
}
