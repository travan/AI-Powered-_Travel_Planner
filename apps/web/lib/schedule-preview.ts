import type { Activity, ActivityCategory, Itinerary, ItineraryDay } from "@travel/types";
import type { TripActivity } from "./workspace-api";

type DayGroup = {
  key: string;
  activities: TripActivity[];
};

const ACTIVITY_CATEGORIES = new Set<ActivityCategory>([
  "attraction",
  "food",
  "transport",
  "accommodation",
  "leisure",
  "shopping",
]);

export function localDateKey(date: Date) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateKeyFromValue(value: string | null | undefined) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : localDateKey(date);
}

function categoryForPreview(value: string): ActivityCategory {
  const normalized = value.trim().toLowerCase();
  if (ACTIVITY_CATEGORIES.has(normalized as ActivityCategory)) {
    return normalized as ActivityCategory;
  }
  if (["restaurant", "meal", "cafe", "coffee"].includes(normalized)) return "food";
  if (["transit", "transportation"].includes(normalized)) return "transport";
  if (["hotel", "stay", "lodging"].includes(normalized)) return "accommodation";
  if (normalized.includes("shop")) return "shopping";
  return "leisure";
}

function scheduleStatusLabel(status: string) {
  switch (status) {
    case "done": return "Completed";
    case "cancelled": return "Cancelled";
    case "rejected": return "Not approved";
    case "pending_review": return "Pending host review";
    default: return "";
  }
}

function toPreviewActivity(activity: TripActivity, currency: string): Activity {
  const scheduledAt = activity.scheduledAt ? new Date(activity.scheduledAt) : null;
  const validDate = scheduledAt && !Number.isNaN(scheduledAt.getTime()) ? scheduledAt : null;
  const mapQuery = [activity.title, activity.locationName, activity.address]
    .filter(Boolean)
    .join(" ");
  const locationDetails = [activity.locationName, activity.address].filter(Boolean).join(" · ");
  const description = [scheduleStatusLabel(activity.status), locationDetails]
    .filter(Boolean)
    .join(" · ");

  return {
    time: validDate
      ? validDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
      : "Time not set",
    name: activity.title,
    description,
    duration: "",
    cost: activity.estimatedCost,
    currency: activity.currency || currency,
    category: categoryForPreview(activity.category),
    maps_link: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`,
  };
}

function groupScheduleActivities(activities: TripActivity[]) {
  const groups = new Map<string, DayGroup>();
  const orderedActivities = [...activities].sort((left, right) => {
    if (!left.scheduledAt) return right.scheduledAt ? 1 : left.createdAt.localeCompare(right.createdAt);
    if (!right.scheduledAt) return -1;
    return left.scheduledAt.localeCompare(right.scheduledAt);
  });

  for (const activity of orderedActivities) {
    const scheduledAt = activity.scheduledAt ? new Date(activity.scheduledAt) : null;
    const key = scheduledAt && !Number.isNaN(scheduledAt.getTime())
      ? localDateKey(scheduledAt)
      : "unscheduled";
    const group = groups.get(key) ?? { key, activities: [] };
    group.activities.push(activity);
    groups.set(key, group);
  }

  return [...groups.values()].sort((left, right) => {
    if (left.key === "unscheduled") return 1;
    if (right.key === "unscheduled") return -1;
    return left.key.localeCompare(right.key);
  });
}

export function buildEditedScheduleDays(plan: Itinerary, activities: TripActivity[]): ItineraryDay[] {
  return groupScheduleActivities(activities).map((group, index) => {
    const sourceDay = group.key === "unscheduled"
      ? undefined
      : plan.days.find((day) => dateKeyFromValue(day.date) === group.key);
    const groupCost = group.activities.reduce(
      (total, activity) => total + (activity.estimatedCost ?? 0),
      0,
    );

    return {
      day_number: index + 1,
      date: group.key === "unscheduled" ? "" : `${group.key}T12:00:00`,
      city: sourceDay?.city || plan.days[0]?.city || group.activities[0]?.locationName || "Trip schedule",
      title: sourceDay?.title || (group.key === "unscheduled" ? "Unscheduled activities" : "Updated schedule"),
      transport: sourceDay?.transport,
      activities: group.activities.map((activity) => toPreviewActivity(activity, plan.currency)),
      daily_cost_estimate: groupCost,
    };
  });
}

export function withEditedSchedule(plan: Itinerary, days: ItineraryDay[]): Itinerary {
  return { ...plan, days, num_days: days.length };
}
