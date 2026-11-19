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
  const haGiang = structuredClone(original);
  haGiang.cities = haGiang.planning.journey.destinations = ["ha-giang"];
  haGiang.num_days = 7;
  haGiang.budget = haGiang.planning.budget.total = 100_000_000;
  haGiang.planning.dining_preferences.independent_only = false;
  const route = (cities, days) => {
    const request = structuredClone(wide);
    request.cities = request.planning.journey.destinations = cities;
    request.num_days = days;
    request.planning.dining_preferences.independent_only = false;
    return request;
  };
  return [
    { id: "original-my-sg", request: original, allowConstraintFailure: true },
    { id: "wide-my-sg", request: wide, allowConstraintFailure: false },
    { id: "short-da-nang", request: short, allowConstraintFailure: false, promoted: true },
    { id: "ha-giang", request: haGiang, allowConstraintFailure: false, promoted: true, compare: false },
    { id: "three-central-cities", request: route(["hue", "da-nang", "hoi-an"], 9), allowConstraintFailure: false, compare: false },
    { id: "four-vietnamese-cities", request: route(["hue", "da-nang", "hoi-an", "nha-trang"], 12), allowConstraintFailure: false, compare: false },
    { id: "china-russia", request: route(["country-cn", "country-ru"], 14), allowConstraintFailure: false, compare: false },
  ];
}
