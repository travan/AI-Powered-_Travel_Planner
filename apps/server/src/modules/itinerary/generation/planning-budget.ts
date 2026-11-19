import type { Need, Snapshot } from "./planning-data.js";

/** Count charges, not unique keys: meals and local allowances recur each day. */
export function budgetUnits(snapshot: Snapshot, need: Need): number {
  if (need.kind === "stay")
    return (
      snapshot.input.planning!.stay_preferences.rooms *
      snapshot.schedule
        .slice(0, -1)
        .filter((day) => day.destination === need.destination).length
    );
  const occurrences =
    need.kind === "leg"
      ? 1
      : snapshot.schedule.reduce(
          (sum, day) =>
            sum + day.slots.filter((slot) => slot.itemKey === need.key).length,
          0,
        );
  const scope =
    snapshot.items[need.key]?.scope ??
    (need.kind === "local" ? "group" : "person");
  return occurrences * (scope === "person" ? snapshot.input.num_travelers : 1);
}

/** Guidance for selecting affordable options, never evidence of an actual price. */
export function supplementBudget(snapshot: Snapshot) {
  const total = snapshot.input.budget;
  if (total === undefined) return undefined;
  const needs = new Map(snapshot.needs.map((need) => [need.key, need]));
  for (const day of snapshot.schedule)
    for (const slot of day.slots)
      if (slot.itemKey && !needs.has(slot.itemKey))
        needs.set(slot.itemKey, {
          key: slot.itemKey,
          destination: day.destination,
          kind:
            slot.kind === "visit"
              ? "visit"
              : slot.kind === "meal"
                ? "meal"
                : slot.kind === "cafe"
                  ? "cafe"
                  : "local",
        });
  for (const leg of snapshot.legs) needs.set(leg.key, leg);
  for (const destination of snapshot.destinations) {
    const key = `${destination.selected}/stay`;
    if (snapshot.items[key])
      needs.set(key, { key, destination: destination.selected, kind: "stay" });
  }
  let retained = 0;
  for (const need of needs.values()) {
    const amount = snapshot.items[need.key]?.amount;
    if (amount != null) retained += amount * budgetUnits(snapshot, need);
  }
  // Reserve contingency before allocating any of the missing data.
  const available = Math.max(0, Math.floor(total / 1.1) - retained);
  const weights = { leg: 35, stay: 30, meal: 20, local: 8, visit: 5, cafe: 2 };
  const missing = snapshot.needs.filter(
    (need) => snapshot.items[need.key]?.amount == null,
  );
  const categories = new Set(missing.map((need) => need.kind));
  const weight = [...categories].reduce((sum, kind) => sum + weights[kind], 0);
  const groupedTargets = new Map<
    string,
    { keys: string[]; target_amount: number; group_units: number }
  >();
  for (const need of missing) {
    const units = missing
      .filter((other) => other.kind === need.kind)
      .reduce((sum, other) => sum + budgetUnits(snapshot, other), 0);
    let target = Math.floor(
      (available * weights[need.kind]) /
        Math.max(1, weight) /
        Math.max(1, units),
    );
    const cap =
      need.kind === "stay"
        ? snapshot.input.planning!.stay_preferences.nightly_budget
        : need.kind === "meal"
          ? snapshot.input.planning!.dining_preferences.per_person_budget
          : undefined;
    if (cap !== undefined) target = Math.min(target, cap);
    const groupUnits = budgetUnits(snapshot, need);
    const key = `${target}:${groupUnits}`;
    const group = groupedTargets.get(key) ?? {
      keys: [],
      target_amount: target,
      group_units: groupUnits,
    };
    group.keys.push(need.key);
    groupedTargets.set(key, group);
  }
  const targets = [...groupedTargets.values()];
  return {
    retained_group_cost: retained,
    remaining_before_contingency: available,
    targets,
  };
}
