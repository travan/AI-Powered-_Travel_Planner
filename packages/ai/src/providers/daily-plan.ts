import { destinationContext } from "../destination-context.js";
import { PlanningGenerationError } from "./planning-generation-error.js";
import { dayActivityRows, validateDayOutput } from "./daily-plan-validation.js";
import { duplicateOutlinePlaces } from "./outline-place-repair.js";
import * as types from "@travel/types";
const { referencePlaces, countryDestinationReference } =
  (types as unknown as { default?: typeof types }).default ?? types;
import type {
  Activity,
  Itinerary,
  ItineraryDay,
  ItineraryInput,
  ItineraryOverview,
} from "@travel/types";
import type { PreFetchedCityData } from "../provider.js";

type Json = Record<string, any>;
type Generate = (
  prompt: string,
  tokens: number,
  schema?: Json,
  system?: string,
) => Promise<Json>;
type DayOutline = {
  destination_slug?: string;
  day_number: number;
  city: string;
  title: string;
  places: string[];
  all_day: boolean;
};
const key = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const language = (input: ItineraryInput) =>
  input.locale === "vi" ? "Vietnamese" : "English";
const priceRule = (currency: string) =>
  `Every expense needs price={amount:number,currency:"${currency}",scope:"person"|"group",status:"estimated",basis:"planning_estimate",assumption:"specific budgeting assumption, not a live quote"}. Planning estimates ARE required, even with no verified catalog prices. Use realistic rounded allowances appropriate to the style, not exact live prices. Use amount=0 only for a proposed free outdoor stop or a cost already included elsewhere; explain that in assumption. Never claim a model estimate is verified or user-confirmed. Do not invent addresses, service operators, opening hours, availability or booking URLs.`;

const visitsPerDay = (input: ItineraryInput) =>
  input.planning?.experience_preferences.pace === "packed"
    ? 6
    : input.planning?.experience_preferences.pace === "relaxed" ||
        input.trip_style === "relax"
      ? 3
      : 4;
const stringSchema = { type: "string" };
const numberSchema = { type: "number", minimum: 0 };
const objectSchema = (properties: Json) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const allowanceSchema = (currency: string) =>
  objectSchema({
    amount: numberSchema,
    currency: { const: currency },
    scope: { enum: ["person", "group"] },
    status: { const: "estimated" },
    basis: { const: "planning_estimate" },
    assumption: stringSchema,
  });
const outlineSchema = (input: ItineraryInput, count: number) =>
  objectSchema({
    title: stringSchema,
    overview: stringSchema,
    days: {
      type: "array",
      minItems: count,
      maxItems: count,
      items: objectSchema({
        ...(input.cities.some((slug) => countryDestinationReference(slug))
          ? { destination_slug: { type: "string", enum: input.cities } }
          : {}),
        day_number: { type: "integer", minimum: 1, maximum: count },
        city: stringSchema,
        title: stringSchema,
        places: {
          type: "array",
          minItems: 3,
          maxItems: visitsPerDay(input),
          items: stringSchema,
        },
        all_day: { type: "boolean" },
      }),
    },
    hotels: {
      type: "array",
      items: objectSchema({
        name: stringSchema,
        city: stringSchema,
        stars: { const: 0 },
        rooms: { type: "integer", minimum: 1 },
        nights: { type: "integer", minimum: 0 },
        nightly_estimate: numberSchema,
        estimate_basis: { const: "planning_estimate" },
        estimate_assumption: stringSchema,
        price_per_night: stringSchema,
        price_range: stringSchema,
        booking_url: { const: "" },
        airbnb_url: { const: "" },
        address: { const: "" },
        maps_link: { const: "" },
        note: stringSchema,
      }),
    },
    transport_summary: {
      type: "array",
      items: objectSchema({
        segment: stringSchema,
        from: stringSchema,
        to: stringSchema,
        recommended_mode: {
          enum: ["flight", "train", "bus", "taxi", "walk", "other"],
        },
        transport_kind: { enum: ["flight", "airport_transfer", "intercity"] },
        price: allowanceSchema(input.currency),
        options: { type: "array", maxItems: 0, items: {} },
      }),
    },
  });
export const daySchema = (input: ItineraryInput, slots: Slot[]) =>
  objectSchema({
    activities: objectSchema(
      Object.fromEntries(
        slots.map((slot) => {
          const price = allowanceSchema(input.currency);
          if (
            ["check_in", "check_out", "return"].includes(slot.slot_id) ||
            slot.included_admission
          )
            price.properties.amount = { const: 0 };
          if (slot.included_admission)
            price.properties.assumption = {
              const:
                input.locale === "vi"
                  ? "Đã tính quỹ dự toán vé chung ở buổi sáng. Cần xác nhận điều kiện và khung giờ vào từng khu; không bảo đảm quyền vào khu."
                  : "Included in the morning admission allowance. Confirm timed-entry conditions separately; area access is not guaranteed.",
            };
          return [
            slot.slot_id,
            objectSchema({
              name: slot.place_name ? { const: slot.place_name } : stringSchema,
              description: stringSchema,
              reason: stringSchema,
              alternative: stringSchema,
              travel_minutes: { type: "null" },
              price,
            }),
          ];
        }),
      ),
    ),
  });
const taskSystem = (input: ItineraryInput, outline = false) =>
  `Return only JSON matching the supplied schema. All prose must be ${language(input)}. ${outline ? "This is only a compact route outline: places MUST be strings, NEVER objects. Do not write activity descriptions, timelines or nested place details." : "Write exactly one day with every supplied slot and useful descriptions; do not produce an entire trip."} Costs are labelled planning allowances, never verified quotes.`;

export function dailyOutlinePrompt(
  input: ItineraryInput,
  overview: ItineraryOverview,
  cities: PreFetchedCityData[],
): string {
  const journey = input.planning?.journey;
  const route = journey
    ? {
        origin: journey.origin.label,
        destinations: cities.map(({ city }) => city),
        endpoint: (journey.return_to_origin ? journey.origin : journey.endpoint)
          ?.label,
      }
    : undefined;
  const countryRoute = input.cities.some((slug) =>
    countryDestinationReference(slug),
  )
    ? `\nCOUNTRY DESTINATIONS: ${JSON.stringify(
        destinationContext(
          input,
          input.cities.map((id, i) => ({
            id,
            city: countryDestinationReference(id) ? undefined : cities[i]?.city,
            country: cities[i]?.country,
          })),
        ),
      )}. For EVERY day include destination_slug from this list, covering all selected destinations in order. For a country destination choose a concrete city within that country; city must name the city, not the country. Transport legs must connect those concrete cities and the origin/endpoint.`
    : "";
  return `Plan a geographically clustered, varied ${overview.total_days}-day trip OUTLINE, not the detailed timeline yet. Write all prose in ${language(input)}.\nROUTE (ordered, origin and endpoint are separate from sightseeing destinations): ${JSON.stringify(route ?? null)}${countryRoute}\nTRAVELER: ${JSON.stringify(input)}\nCATALOG: ${JSON.stringify(cities.map((c) => ({ city: c.city, places: c.places, hotels: c.hotels, restaurants: c.restaurants })))}\nGive each day a DIFFERENT named area/theme and ${visitsPerDay(input)} DISTINCT real sightseeing places. Do not reuse a place or an evening venue across days. Use general knowledge for proposed named public places when the catalog is empty; keep them as unverified suggestions. For a full-day theme park use all_day=true and 3 specific areas/experiences within that park, with a lunch break between morning and afternoon. Follow requested destinations and exact days. No side trips to other cities unless requested.\n${priceRule(input.currency)}\nIf staying type=none, return hotels=[]; if already_booked, retain the supplied hotel name and room count as the route anchor. Suggest one lodging AREA per overnight city if no verified hotel exists; stars=0, city, rooms, nights, nightly_estimate (per room/night), estimate_basis="planning_estimate", estimate_assumption (room standard, taxes uncertainty, total rooms x nights). Include estimated outbound/return main travel and airport transfers in transport_summary, with price, transport_kind and options=[]; do not include local day passes here (they are budgeted in each day). Unknown departure/arrival times must stay unknown; do not invent flight times.\nReturn JSON: {"title":"trip title","overview":"2 sentences; include conditional arrival/departure assumptions if times unknown","days":[{"day_number":1,"city":"city","title":"unique area/theme","places":["specific morning place","different morning place","afternoon place","evening place"],"all_day":false}],"hotels":[{"name":"suggested lodging area","city":"city","stars":0,"rooms":1,"nights":${Math.max(0, overview.total_days - 1)},"nightly_estimate":number,"estimate_basis":"planning_estimate","estimate_assumption":"room/night budgeting assumptions","price_per_night":"labelled planning estimate","price_range":"","booking_url":"","airbnb_url":"","address":"","maps_link":"","note":"why this area suits the route"}],"transport_summary":[{"segment":"label","from":"origin","to":"destination","recommended_mode":"flight|train|bus|taxi|walk|other","transport_kind":"flight|airport_transfer|intercity","price":{"amount":number,"currency":"${input.currency}","scope":"person","status":"estimated","basis":"planning_estimate","assumption":"route and budgeting assumptions; not a quote"},"options":[]}]}.`;
}

type Slot = {
  slot_id: string;
  place_name?: string;
  included_admission?: boolean;
  time: string;
  duration_minutes: number;
  kind: Activity["kind"];
  meal_slot?: Activity["meal_slot"];
};
export function dailySlots(
  input: ItineraryInput,
  outline: DayOutline,
  date: string,
): Slot[] {
  const visit = (
    slot_id: string,
    time: string,
    duration_minutes = 60,
  ): Slot => ({ slot_id, time, duration_minutes, kind: "visit" });
  const slots: Slot[] = [
    {
      slot_id: "breakfast",
      time: "07:30",
      duration_minutes: 45,
      kind: "meal",
      meal_slot: "breakfast",
    },
    ...(outline.day_number === (input.num_days ?? 1)
      ? [
          {
            slot_id: "check_out",
            time: "08:15",
            duration_minutes: 15,
            kind: "check_out" as const,
          },
        ]
      : []),
    {
      slot_id: "local_transport",
      time: "08:30",
      duration_minutes: 15,
      kind: "transfer",
    },
    visit(
      "morning_1",
      "09:00",
      outline.all_day ? 180 : outline.places.length <= 4 ? 120 : 60,
    ),
    ...(!outline.all_day && outline.places.length > 4
      ? [visit("morning_2", outline.places.length >= 6 ? "10:15" : "10:30")]
      : []),
    {
      slot_id: "lunch",
      time: "12:00",
      duration_minutes: 60,
      kind: "meal",
      meal_slot: "lunch",
    },
    ...(outline.day_number === 1
      ? [
          {
            slot_id: "check_in",
            time: "13:00",
            duration_minutes: 30,
            kind: "check_in" as const,
          },
        ]
      : []),
    visit(
      "afternoon_1",
      outline.all_day || outline.places.length >= 6 ? "13:30" : "14:00",
      outline.all_day ? 180 : outline.places.length === 3 ? 120 : 60,
    ),
    ...(!outline.all_day && outline.places.length > 3
      ? [visit("afternoon_2", outline.places.length >= 6 ? "14:45" : "15:30")]
      : []),
    {
      slot_id: "cafe",
      time: outline.places.length >= 6 && !outline.all_day ? "16:00" : "17:00",
      duration_minutes: 30,
      kind: "cafe",
    },
    ...(!outline.all_day && outline.places.length >= 6
      ? [visit("late_afternoon", "16:30")]
      : []),
    {
      slot_id: "dinner",
      time: "18:00",
      duration_minutes: 60,
      kind: "meal",
      meal_slot: "dinner",
    },
    visit("evening", "19:30"),
    {
      slot_id: "return",
      time: "21:00",
      duration_minutes: 30,
      kind: "transfer",
    },
  ];
  const arrival = input.planning?.transport_preferences.arrival_at;
  const departure = input.planning?.transport_preferences.departure_at;
  const minutes = (s: string) =>
    Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const start =
    date && arrival?.startsWith(date) ? minutes(arrival.slice(11, 16)) + 60 : 0;
  const end =
    date && departure?.startsWith(date)
      ? minutes(departure.slice(11, 16)) -
        (input.planning?.transport_preferences.airport_buffer_minutes ?? 0)
      : 1440;
  return slots.filter(
    (slot) =>
      minutes(slot.time) >= start &&
      minutes(slot.time) + slot.duration_minutes <= end,
  );
}

export function prepareDailySlots(
  input: ItineraryInput,
  dayOutline: DayOutline,
  date: string,
): Slot[] {
  const slots = dailySlots(input, dayOutline, date);
  let assignedVisit = 0;
  for (const slot of slots) {
    if (slot.kind === "visit")
      slot.place_name = dayOutline.places[assignedVisit++];
    if (dayOutline.all_day && ["afternoon_1", "evening"].includes(slot.slot_id))
      slot.included_admission = true;
    if (dayOutline.all_day && slot.slot_id === "dinner")
      slot.place_name =
        (input.locale === "vi" ? "Ăn tối gần " : "Dinner near ") +
        dayOutline.places[0];
    if (dayOutline.all_day && slot.slot_id === "cafe")
      slot.place_name =
        (input.locale === "vi" ? "Café gần " : "Café near ") +
        dayOutline.places[0];
    if (dayOutline.all_day && slot.slot_id === "return")
      slot.duration_minutes = 60;
  }

  for (const slot of slots) {
    if (slot.slot_id === "return" && dayOutline.day_number === input.num_days) {
      slot.place_name =
        input.planning?.transport_preferences.mode === "flight"
          ? (input.locale === "vi"
              ? "Di chuyển ra sân bay để về "
              : "Airport transfer for return to ") +
            (input.planning?.journey.origin.label ?? "home")
          : input.locale === "vi"
            ? "Di chuyển tới điểm kết thúc hành trình"
            : "Transfer to the final journey endpoint";
      slot.duration_minutes = 60;
    }
  }
  return slots;
}

export async function generateDailyPlan(
  input: ItineraryInput,
  overview: ItineraryOverview,
  cities: PreFetchedCityData[],
  generate: Generate,
  normalize: (raw: Json) => Itinerary,
): Promise<Itinerary> {
  cities = cities.map((city) => ({
    ...city,
    places: [
      ...city.places,
      ...referencePlaces(city.city).filter(
        (ref) =>
          !city.places.some((p: any) => key(p.name ?? "") === key(ref.name)),
      ),
    ],
  }));
  const catalogNames = [
    ...new Set(
      cities.flatMap((city) =>
        city.places
          .filter(
            (p: any) =>
              p.last_verified_at &&
              !["ai_generated", "user_submission", "user_added"].includes(
                p.source,
              ),
          )
          .map((p: any) => p.name as string),
      ),
    ),
  ];
  // A hard enum is useful only when a single destination can supply the whole trip.
  // Otherwise the model may propose unverified places in the correct city.
  const restrictCatalog =
    cities.length === 1 &&
    catalogNames.length >= overview.total_days * visitsPerDay(input);
  let outline = await generate(
    dailyOutlinePrompt(input, overview, cities),
    5000,
    (() => {
      const schema = outlineSchema(input, overview.total_days);
      if (restrictCatalog)
        schema.properties.days.items.properties.places.items = {
          type: "string",
          enum: catalogNames,
        };
      return schema;
    })(),
    taskSystem(input, true),
  );
  const allocateCatalogPlaces = (candidate: Json) => {
    if (!Array.isArray(candidate.days)) return;
    if (!restrictCatalog) {
      for (const day of candidate.days)
        if (Array.isArray(day?.places))
          day.places = day.places.slice(
            0,
            day.all_day ? 3 : visitsPerDay(input),
          );
      return;
    }
    const used = new Set<string>();
    const parkNames = new Set(
      cities.flatMap((city) =>
        referencePlaces(city.city)
          .filter((p) => p.area === "USJ")
          .map((p) => p.name),
      ),
    );
    for (const day of candidate.days as DayOutline[]) {
      const target = day.all_day ? 3 : visitsPerDay(input);
      const picks: string[] = [];
      const take = (name: string) => {
        if (
          typeof name === "string" &&
          catalogNames.includes(name) &&
          (day.all_day
            ? parkNames.has(name) || parkNames.size === 0
            : !parkNames.has(name)) &&
          !used.has(key(name))
        ) {
          picks.push(name);
          used.add(key(name));
        }
      };
      const refs = referencePlaces(day.city);
      const area = refs.find(
        (p) =>
          day.places?.includes(p.name) &&
          !used.has(key(p.name)) &&
          (day.all_day ? p.area === "USJ" : p.area !== "USJ"),
      )?.area;
      for (const name of day.places ?? [])
        if (
          picks.length < target &&
          (!area || refs.find((p) => p.name === name)?.area === area)
        )
          take(name);
      const ordered = [
        ...referencePlaces(day.city)
          .filter((p) => p.area === area)
          .map((p) => p.name),
        ...catalogNames,
      ];
      for (const name of ordered) {
        if (picks.length < target) take(name);
      }
      day.places = picks;
    }
  };
  allocateCatalogPlaces(outline);
  const outlineErrors = (candidate: Json) => {
    const days = candidate.days as DayOutline[];
    if (!Array.isArray(days) || days.length !== overview.total_days)
      return ["Return exactly the requested number of day outlines."];
    const seen = new Set<string>(),
      errors: string[] = [];
    for (const [i, day] of days.entries()) {
      if (
        day.day_number !== i + 1 ||
        !day.city ||
        !day.title ||
        !Array.isArray(day.places) ||
        day.places.length < (day.all_day ? 3 : visitsPerDay(input))
      )
        errors.push(`Day ${i + 1}: missing specific places or day number.`);
      if (
        input.cities.some((slug) => countryDestinationReference(slug)) &&
        (!day.destination_slug || !input.cities.includes(day.destination_slug))
      )
        errors.push(
          `Day ${i + 1}: include destination_slug from the requested destination IDs.`,
        );
      for (const name of day.places ?? []) {
        if (typeof name !== "string") {
          errors.push("Place names must be strings, not objects.");
          continue;
        }
        const k = key(name);
        if (seen.has(k))
          errors.push(
            `Repeated place: ${name}; replace with a different real place.`,
          );
        seen.add(k);
      }
    }
    if (input.cities.some((slug) => countryDestinationReference(slug))) {
      const stops = days
        .map((day) => day.destination_slug)
        .filter((slug, i, values) => slug !== values[i - 1]);
      if (
        stops.length !== input.cities.length ||
        stops.some((slug, i) => slug !== input.cities[i])
      )
        errors.push(
          "Cover every requested destination_slug in the selected order.",
        );
    }
    return errors;
  };
  let problems = outlineErrors(outline);
  if (
    problems.length &&
    problems.every((problem) => problem.startsWith("Repeated place:"))
  ) {
    const duplicates = duplicateOutlinePlaces(outline.days);
    const replacement = await generate(
      `Plan a geographically clustered route: repair ONLY duplicate outline places, in ${language(input)}. Fix these outline problems by returning a replacement name for each requested key. Every replacement must be a DIFFERENT real sightseeing place in that entry's city, never a generic restaurant. Do not repeat any existing name or another replacement. Return only {"replacements":{key:"specific place name"}}.\nDUPLICATE POSITIONS: ${JSON.stringify(duplicates)}\nEXCLUDED NAMES: ${JSON.stringify(outline.days.flatMap((day: DayOutline) => day.places))}`,
      Math.min(5000, 150 * duplicates.length + 300),
      objectSchema({
        replacements: objectSchema(
          Object.fromEntries(duplicates.map(({ id }) => [id, stringSchema])),
        ),
      }),
      taskSystem(input, true),
    );
    for (const entry of duplicates) {
      const name = replacement.replacements?.[entry.id];
      if (typeof name === "string" && name.trim())
        outline.days[entry.dayIndex].places[entry.placeIndex] = name.trim();
    }
  } else if (problems.length)
    outline = await generate(
      `${dailyOutlinePrompt(input, overview, cities)}\nFix these outline problems: ${JSON.stringify(problems)}\nPrevious outline: ${JSON.stringify(outline)}`,
      5000,
      (() => {
        const schema = outlineSchema(input, overview.total_days);
        if (restrictCatalog)
          schema.properties.days.items.properties.places.items = {
            type: "string",
            enum: catalogNames,
          };
        return schema;
      })(),
      taskSystem(input, true),
    );
  allocateCatalogPlaces(outline);
  problems = outlineErrors(outline);
  if (problems.length) throw new PlanningGenerationError("AI_OUTLINE_INVALID");
  const days: ItineraryDay[] = [],
    used: string[] = [];
  for (const dayOutline of outline.days as DayOutline[]) {
    const date = input.start_date
      ? new Date(
          Date.parse(`${input.start_date}T00:00:00Z`) +
            (dayOutline.day_number - 1) * 86400000,
        )
          .toISOString()
          .slice(0, 10)
      : "";
    const slots = prepareDailySlots(
      { ...input, num_days: overview.total_days },
      dayOutline,
      date,
    );
    const prompt = `Write ONLY the detailed timeline for day ${dayOutline.day_number}/${overview.total_days}, in ${language(input)}. Never drop a requested slot.\nTRAVELER: ${JSON.stringify(input)}\nDESTINATION CONTEXT: ${JSON.stringify(destinationContext(input, [{ id: dayOutline.destination_slug ?? input.cities[0]!, city: dayOutline.city }]))}\nDINING POLICY: independent_only is a preference; do not claim unverified venues meet it. Allergies and explicit required restrictions remain mandatory.\nTODAY'S ROUTE (use these places; do not substitute previously used places): ${JSON.stringify(dayOutline)}\nPREVIOUS DAYS' VISITS (do not repeat): ${JSON.stringify(used)}\nLODGING: ${JSON.stringify(outline.hotels)}\nREQUIRED SLOTS: ${JSON.stringify(slots)}\n${priceRule(input.currency)}\nFor each slot return a specific name and 3 useful sentences: concrete on-site plan (or dish/drink for meals), why it fits this route, and a practical tip. Visit and meal descriptions must be about 35-55 words; logistics may be shorter but must be useful and non-empty. Avoid generic praise. Each visit slot has an explicit place_name: its name and description MUST refer to that exact venue. Never move or substitute places between slots. In a full-day park, morning and afternoon are different parts of the same visit separated by lunch, not overlapping events. For a full-day park, budget admission ONLY in morning_1; afternoon_1 has amount=0 with assumption that the same admission is already counted in morning_1. Respect all supplied dietary restrictions, allergies and confirmed bookings. Never guarantee allergen safety; ask for direct confirmation. Cafe is not a meal replacement. Breakfast/lunch/dinner each need an actual local dish and a nearby venue or named dining area. For Japan trips with local-food preferences, propose Japanese dishes (for example onigiri, tamago sando, miso soup, udon, okonomiyaki), not Vietnamese pho or com tam unless explicitly requested. Use price scope=person for meals/tickets. local_transport price is an allowance for ALL local rides that day, excluding airport transfers; return costs 0 with assumption that the day's local allowance already covers it. Check-in/out cost 0 because room costs are in hotels, not charged again. Return means back to lodging, except last day it means the final departure point. Do not invent a flight departure time. If arrival/departure is unknown, explicitly describe the first/last day as conditional, not a confirmed travel schedule.\nReturn JSON {"activities":{"breakfast":{"name":"specific meal","description":"3 useful sentences","reason":"one short reason","alternative":"nearby fallback or empty","travel_minutes":null,"price":{"amount":number,"currency":"${input.currency}","scope":"person|group","status":"estimated","basis":"planning_estimate","assumption":"specific allowance assumption, not a quote"}},"other_slot_id":{"name":"use the exact place_name when provided","description":"3 useful sentences","reason":"one short reason","alternative":"","travel_minutes":null,"price":{"amount":number,"currency":"${input.currency}","scope":"person","status":"estimated","basis":"planning_estimate","assumption":"what this allowance covers"}}}}. Return EVERY required slot as an object key.`;
    let response = await generate(
      prompt,
      6500,
      daySchema(input, slots),
      taskSystem(input),
    );
    const validate = (candidate: Json) =>
      validateDayOutput(candidate, slots, input, dayOutline.all_day, (name) =>
        used.some((previous) => key(previous) === key(name)),
      );
    let errors = validate(response);
    if (errors.length) {
      const repairIds = new Set(errors.map((error) => error.slot));
      const repairSlots = slots.filter((slot) => repairIds.has(slot.slot_id));
      const originalRows = dayActivityRows(response);
      const repairPrompt = prompt.replace(
        `REQUIRED SLOTS: ${JSON.stringify(slots)}`,
        `REQUIRED SLOTS: ${JSON.stringify(repairSlots)}`,
      );
      const repaired = await generate(
        `${repairPrompt}\nRepair ONLY this day's invalid slots; return only the required keys. Valid entries are retained by the server. Problems: ${JSON.stringify(errors.map((error) => error.message))}\nPrevious invalid entries: ${JSON.stringify(originalRows.filter((row) => repairIds.has(row.slot_id)))}`,
        Math.min(6500, 700 * repairSlots.length + 300),
        daySchema(input, repairSlots),
        taskSystem(input),
      );
      response = {
        activities: [
          ...originalRows.filter((row) => !repairIds.has(row.slot_id)),
          ...dayActivityRows(repaired).filter((row) =>
            repairIds.has(row.slot_id),
          ),
        ],
      };
    }
    errors = validate(response);
    if (errors.length)
      throw new PlanningGenerationError(
        "AI_DAY_INVALID",
        `AI model returned incomplete day ${dayOutline.day_number}`,
        {
          day: dayOutline.day_number,
          issues: errors.map(({ code, slot }) => ({ code, slot })),
        },
      );
    const activities: Activity[] = slots.map((slot) => {
      const row = Array.isArray(response.activities)
        ? response.activities.find((a: Json) => a.slot_id === slot.slot_id)
        : response.activities[slot.slot_id];
      const { slot_id, place_name, included_admission, ...schedule } = slot;
      return {
        ...row,
        ...schedule,
        name: row.name,
        city: dayOutline.city,
        cost: row.price.amount,
        currency: input.currency,
        category:
          slot.kind === "meal" || slot.kind === "cafe"
            ? "food"
            : slot.kind === "transfer"
              ? "transport"
              : slot.kind === "check_in" || slot.kind === "check_out"
                ? "accommodation"
                : "attraction",
        duration: `${slot.duration_minutes} min`,
        maps_link: "",
        evidence: { source: "ai_suggestion" },
        ticket_activities: [],
        price: { ...row.price, status: "estimated" },
      };
    });
    used.push(
      ...activities.filter((a) => a.kind === "visit").map((a) => a.name),
    );
    days.push({
      ...(dayOutline.destination_slug
        ? { destination_slug: dayOutline.destination_slug }
        : {}),
      day_number: dayOutline.day_number,
      date,
      city: dayOutline.city,
      title: dayOutline.title,
      activities,
      daily_cost_estimate: 0,
    });
  }
  return normalize({
    ...outline,
    days,
    hotels: outline.hotels ?? [],
    restaurants: [],
    suggestions: [],
    total_cost: 0,
    currency: input.currency,
    num_days: overview.total_days,
    num_travelers: input.num_travelers,
    locale: input.locale,
    seasonal_notes: {
      travel_month: "",
      daylight_hours: "",
      sunrise_time: "",
      sunset_time: "",
      weather_note: "",
      highlights: [],
      warnings: [
        input.locale === "vi"
          ? "Giờ ngày đến/đi là khung dự kiến, cần điều chỉnh theo giờ bay. Chi phí là dự toán lập ngân sách, chưa phải báo giá."
          : "Arrival/departure day times are provisional until travel times are known. Costs are planning allowances, not quotes.",
      ],
    },
    budget_breakdown: {
      accommodation: 0,
      food: 0,
      activities: 0,
      transport: 0,
      contingency: 0,
      total: 0,
      currency: input.currency,
      per_person: 0,
      per_day: 0,
    },
  });
}
