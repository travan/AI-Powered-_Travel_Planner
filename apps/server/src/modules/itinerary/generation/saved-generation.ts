import type { Snapshot } from "./planning-data.js";

export function storedSupplementResponse(raw: unknown): unknown {
  const response =
    raw && typeof raw === "object" && "response" in raw ? raw.response : raw;
  if (typeof response !== "string") return response;
  return JSON.parse(
    response
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, ""),
  );
}

export function recoverableSavedGeneration(
  checkpoint: unknown,
  raw: unknown,
): checkpoint is Snapshot {
  if (!checkpoint || typeof checkpoint !== "object") return false;
  const state = checkpoint as Partial<Snapshot>;
  if (
    state.version !== 2 ||
    !state.input ||
    !Array.isArray(state.schedule) ||
    !Array.isArray(state.destinations) ||
    !Array.isArray(state.needs) ||
    !state.items ||
    (checkpoint as { display_recovery_version?: number })
      .display_recovery_version === 1
  )
    return false;
  if (
    Object.values(state.items).some(
      (item) => typeof item?.name === "string" && item.name.trim(),
    )
  )
    return true;
  try {
    const response = storedSupplementResponse(raw) as
      | { items?: unknown[] }
      | undefined;
    return (
      Array.isArray(response?.items) &&
      response.items.some((row) => {
        if (!row || typeof row !== "object") return false;
        const item = row as { key?: string; name?: string };
        return (
          typeof item.name === "string" &&
          !!item.name.trim() &&
          state.needs!.some((need) => need.key === item.key)
        );
      })
    );
  } catch {
    return false;
  }
}
