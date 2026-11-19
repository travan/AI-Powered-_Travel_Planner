import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { prepareSnapshot } from "../apps/server/src/modules/itinerary/generation/planning-data.js";
import { generationInput } from "../apps/server/src/modules/itinerary/generation/generation-input.js";
import originalRequest from "../tests/fixtures/malaysia-singapore-request.json";
import moscow from "../tests/unit/fixtures/beijing-moscow-supplement.json";
import muCangChai from "../tests/unit/fixtures/mu-cang-chai-supplement.json";

const scenarios = [
  {
    name: "Beijing–Moscow",
    selected: ["bac-kinh", "moscow"],
    countries: ["CN", "RU"],
    names: ["Beijing", "Moscow"],
    response: moscow,
    warning: "AI_SUGGESTIONS_UNVERIFIED",
  },
  {
    name: "Mu Cang Chai",
    selected: ["mu-cang-chai"],
    countries: ["VN"],
    names: ["Mu Cang Chai"],
    response: muCangChai,
    warning: "REPEATED_PLACE",
  },
  {
    name: "Mu Cang Chai with an unknown fare",
    selected: ["mu-cang-chai"],
    countries: ["VN"],
    names: ["Mu Cang Chai"],
    response: {
      ...muCangChai,
      items: muCangChai.items.map((item) =>
        item.key === "leg/2" ? { ...item, amount: -1 } : item,
      ),
    },
    warning: "BUDGET_INCOMPLETE",
    incomplete: true,
  },
];
const replays = scenarios.map((scenario) => {
  const dto = structuredClone(originalRequest);
  delete (dto as { flexible_month?: string }).flexible_month;
  Object.assign(dto, {
    start_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    end_date: new Date(Date.now() + 39 * 86400000).toISOString().slice(0, 10),
  });
  const input = generationInput(dto as never);
  input.cities = [...scenario.selected];
  input.planning!.journey.destinations = input.cities;
  const snapshot = prepareSnapshot(
    input,
    scenario.selected.map((selected, index) => ({
      selected,
      country: scenario.countries[index]!,
      city: {
        timezone: "Asia/Ho_Chi_Minh",
        currency: input.currency,
        popular: false,
        slug: selected,
        name: { en: scenario.names[index]! },
        country: scenario.countries[index]!,
        lat: null,
        lon: null,
        places: [],
        activities: [],
      },
    })),
  );
  return { ...scenario, input, snapshot };
});
const directory = fileURLToPath(
  new URL("../test-results/production-validation/", import.meta.url),
);
await fs.mkdir(directory, { recursive: true });
await fs.writeFile(
  path.join(directory, "replays.json"),
  JSON.stringify(replays, null, 2),
);
console.log("Prepared saved-response replays; no model requests were made.");
