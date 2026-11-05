import type { Activity } from "./itinerary";

/** Accept stored 12-hour times as well as the generation contract's HH:MM. */
export function timelineMinutes(value: string): number | null {
  const match = value?.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59) return null;
  if (match[3]) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (match[3].toUpperCase() === "PM" ? 12 : 0);
  } else if (hour > 23) return null;
  return hour * 60 + minute;
}

export function activityMinutes(activity: Activity): number {
  if (
    Number.isFinite(activity.duration_minutes) &&
    activity.duration_minutes! > 0
  )
    return activity.duration_minutes!;
  const duration = activity.duration ?? "";
  return (
    Number(duration.match(/([\d.]+)\s*(?:h|giờ)/i)?.[1] ?? 0) * 60 +
    Number(duration.match(/(\d+)\s*(?:m|min|phút)/i)?.[1] ?? 0)
  );
}

export function mealSlot(activity: Activity): Activity["meal_slot"] {
  if (activity.meal_slot) return activity.meal_slot;
  if (activity.kind === "cafe") return undefined;
  const name = activity.name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  if (/\b(breakfast|bua sang|an sang)\b/.test(name)) return "breakfast";
  if (/\b(lunch|bua trua|an trua)\b/.test(name)) return "lunch";
  if (/\b(dinner|bua toi|an toi)\b/.test(name)) return "dinner";
  if (activity.kind !== "meal" && activity.category !== "food")
    return undefined;
  const time = timelineMinutes(activity.time);
  if (time == null) return undefined;
  if (time >= 420 && time < 660) return "breakfast";
  if (time >= 660 && time < 900) return "lunch";
  if (time >= 1020 && time < 1320) return "dinner";
  return undefined;
}
