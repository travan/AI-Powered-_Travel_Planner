export interface PlanningPreferences {
  origin: string;
  returnToOrigin: boolean;
  endPoint: string;
  transport: string;
  arrivalTime: string;
  departureTime: string;
  lodging: string;
  rooms: string;
  lodgingBudget: string;
  lodgingCriteria: string;
  diningCriteria: string;
  cafeCriteria: string;
  pace: string;
  otherRequests: string;
}

export const DEFAULT_PLANNING_PREFERENCES: PlanningPreferences = {
  origin: "",
  returnToOrigin: true,
  endPoint: "",
  transport: "suggest",
  arrivalTime: "",
  departureTime: "",
  lodging: "hotel",
  rooms: "1",
  lodgingBudget: "",
  lodgingCriteria: "",
  diningCriteria: "",
  cafeCriteria: "",
  pace: "balanced",
  otherRequests: "",
};

const MARKER = "\nPLANNING_PREFERENCES_JSON: ";

// Use the existing extra-request contract so queued jobs and saved search drafts
// carry the same criteria through every provider without a database migration.
export function appendPlanningPreferences(
  prompt: string,
  preferences: PlanningPreferences,
): string {
  return `${prompt}${MARKER}${JSON.stringify({
    ...preferences,
    endPoint: preferences.returnToOrigin
      ? preferences.origin
      : preferences.endPoint,
  })}`;
}

export function restorePlanningPreferences(
  prompt?: string,
): PlanningPreferences {
  try {
    const encoded = prompt?.split(MARKER)[1];
    if (!encoded) return { ...DEFAULT_PLANNING_PREFERENCES };
    const value = JSON.parse(encoded) as Record<string, unknown>;
    const restored = { ...DEFAULT_PLANNING_PREFERENCES };
    for (const key of Object.keys(restored) as (keyof PlanningPreferences)[]) {
      if (typeof value[key] === typeof restored[key]) {
        Object.assign(restored, { [key]: value[key] });
      }
    }
    return restored;
  } catch {
    return { ...DEFAULT_PLANNING_PREFERENCES };
  }
}
