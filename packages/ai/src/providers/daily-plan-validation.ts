import type { Activity, ItineraryInput } from "@travel/types";

type Json = Record<string, any>;
type ValidationSlot = {
  slot_id: string;
  kind: Activity["kind"];
  place_name?: string;
};
export type DayOutputIssue = {
  slot: string;
  code: string;
  message: string;
};
const object = (value: unknown): value is Json =>
  !!value && typeof value === "object" && !Array.isArray(value);

export function dayActivityRows(response: unknown): Json[] {
  const activities = object(response) ? response.activities : undefined;
  if (Array.isArray(activities)) return activities.filter(object);
  return object(activities)
    ? Object.entries(activities)
        .filter(([, row]) => object(row))
        .map(([slot_id, row]) => ({ ...row, slot_id }))
    : [];
}

export function validateDayOutput(
  response: unknown,
  slots: ValidationSlot[],
  input: ItineraryInput,
  allDay: boolean,
  alreadyUsed: (name: string) => boolean,
): DayOutputIssue[] {
  const rows = dayActivityRows(response);
  return slots.flatMap((slot): DayOutputIssue[] => {
    const matches = rows.filter((row) => row.slot_id === slot.slot_id);
    const row = matches[0];
    const issue = (code: string, message: string) => [
      { slot: slot.slot_id, code, message: `${slot.slot_id}: ${message}` },
    ];
    if (
      matches.length !== 1 ||
      typeof row?.name !== "string" ||
      !row.name.trim() ||
      typeof row.description !== "string" ||
      !row.description.trim() ||
      (!["transfer", "check_in", "check_out", "rest"].includes(
        slot.kind ?? "",
      ) &&
        row.description.trim().split(/\s+/).length < 30)
    )
      return issue(
        "DAY_ENTRY_INCOMPLETE",
        "include exactly one specific entry; visits and meals need at least 30 words, logistics need a useful non-empty description.",
      );
    if (
      slot.kind === "meal" &&
      /japan|日本|nhật bản/iu.test(JSON.stringify(input.cities)) &&
      input.planning?.experience_preferences.interests.some((interest) =>
        /ẩm thực địa phương|local food/iu.test(interest),
      ) &&
      !/món việt|quán việt|Vietnamese food/iu.test(input.prompt_text ?? "") &&
      /phở|cơm tấm|bún bò/iu.test(row.name)
    )
      return issue(
        "DAY_MEAL_MISMATCH",
        "propose a Japanese local meal, not Vietnamese food.",
      );
    if (slot.place_name && row.name !== slot.place_name)
      return issue(
        "DAY_VENUE_MISMATCH",
        `name and description must use exactly ${slot.place_name}.`,
      );
    if (
      !Number.isFinite(row.price?.amount) ||
      row.price.amount < 0 ||
      row.price.currency !== input.currency ||
      !["person", "group"].includes(row.price.scope) ||
      row.price.basis !== "planning_estimate" ||
      typeof row.price.assumption !== "string" ||
      !row.price.assumption.trim()
    )
      return issue(
        "DAY_PRICE_INVALID",
        "include a numeric planning allowance, correct currency/scope and an explicit assumption.",
      );
    if (
      (["check_in", "check_out", "return"].includes(slot.slot_id) ||
        (allDay && slot.slot_id === "afternoon_1")) &&
      row.price.amount !== 0
    )
      return issue(
        "DAY_COST_DUPLICATED",
        "cost is already included elsewhere; amount must be 0 and the assumption must identify the existing allowance.",
      );
    if (slot.kind === "visit" && alreadyUsed(row.name))
      return issue(
        "DAY_PLACE_REPEATED",
        "this place was already visited; use today's planned place.",
      );
    return [];
  });
}
