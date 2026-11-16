import fs from "node:fs/promises";

export async function planningCanaryCases() {
  const original = JSON.parse(
    await fs.readFile(
      new URL(
        "../tests/fixtures/malaysia-singapore-request.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const wide = structuredClone(original);
  wide.budget = wide.planning.budget.total = 200_000_000;
  const short = structuredClone(original);
  short.cities = short.planning.journey.destinations = ["da-nang"];
  short.num_days = 3;
  short.budget = short.planning.budget.total = 30_000_000;
  short.planning.dining_preferences.independent_only = false;
  return [
    { id: "original-my-sg", request: original, allowConstraintFailure: true },
    { id: "wide-my-sg", request: wide, allowConstraintFailure: false },
    { id: "short-da-nang", request: short, allowConstraintFailure: false },
  ];
}
