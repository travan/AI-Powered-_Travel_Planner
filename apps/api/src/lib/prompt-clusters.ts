import crypto from "node:crypto";
import type { ItineraryInput } from "@travel/types";

export interface PromptCluster {
  cluster_key: string;
  signature: string;
  city_slugs: string[];
  city_names: string[];
  country_codes: string[];
  trip_style: string;
  intent_tags: string[];
  duration_bucket: string;
  budget_bucket: string;
  traveler_bucket: string;
  season_bucket: string | null;
  locale: string;
}

export function buildPromptCluster(params: {
  cities: string[];
  cityNames: string[];
  input: Pick<
    ItineraryInput,
    "start_date" | "num_days" | "budget" | "currency" | "trip_style" | "locale" | "num_travelers"
  >;
}): PromptCluster {
  const cityNames = dedupe(params.cityNames.map((name) => name.trim()).filter(Boolean));
  const citySlugs = dedupe(
    params.cities
      .map((city) => slugify(city))
      .filter(Boolean)
  ).sort();
  const countryCodes = ["VN"];
  const tripStyle = params.input.trip_style ?? "mixed";
  const intentTags = buildIntentTags(tripStyle, [...cityNames, ...citySlugs]);
  const durationBucket = bucketDuration(params.input.num_days);
  const budgetBucket = bucketBudget(params.input.budget, params.input.currency);
  const travelerBucket = bucketTravelers(params.input.num_travelers);
  const seasonBucket = bucketSeason(params.input.start_date);
  const locale = (params.input.locale ?? "en").toLowerCase();

  const signatureParts = [
    countryCodes.join("+"),
    citySlugs.join("+") || cityNames.map(slugify).join("+"),
    tripStyle,
    durationBucket,
    budgetBucket,
    travelerBucket,
    seasonBucket ?? "any-season",
    locale,
  ];
  const signature = signatureParts.join("|");
  const clusterKey = crypto
    .createHash("sha256")
    .update(signature)
    .digest("hex")
    .slice(0, 20);

  return {
    cluster_key: clusterKey,
    signature,
    city_slugs: citySlugs,
    city_names: cityNames,
    country_codes: countryCodes,
    trip_style: tripStyle,
    intent_tags: intentTags,
    duration_bucket: durationBucket,
    budget_bucket: budgetBucket,
    traveler_bucket: travelerBucket,
    season_bucket: seasonBucket,
    locale,
  };
}

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildIntentTags(tripStyle: string, tokens: string[]): string[] {
  const normalizedTokens = tokens.map((token) => normalizeForMatch(token));
  const tags = new Set<string>(["travel"]);

  const styleTags: Record<string, string[]> = {
    adventure: ["adventure", "nature", "active"],
    relax: ["relax", "wellness", "slow-travel"],
    culture: ["culture", "heritage", "history"],
    food: ["food", "local-cuisine"],
    mixed: ["balanced"],
  };

  for (const tag of styleTags[tripStyle] ?? styleTags.mixed ?? []) {
    tags.add(tag);
  }

  const destinationTags: Array<[RegExp, string[]]> = [
    [/(nha-trang|phu-quoc|con-dao|quy-nhon|da-nang|mui-ne|phan-thiet|vung-tau|cat-ba|ha-long|cam-ranh)/, ["beach", "island-or-coast"]],
    [/(sa-pa|sapa|ha-giang|moc-chau|mai-chau|tam-dao|cao-bang|kon-tum|pleiku|da-lat)/, ["mountain", "nature"]],
    [/(hoi-an|hue|ha-noi|ninh-binh|dien-bien|my-son)/, ["heritage", "culture"]],
    [/(can-tho|ben-tre|my-tho|chau-doc|ca-mau|soc-trang|bac-lieu|long-xuyen)/, ["mekong", "river"]],
    [/(ho-chi-minh|ha-noi|hai-phong|da-nang|can-tho)/, ["city-break"]],
  ];

  for (const token of normalizedTokens) {
    for (const [pattern, matchedTags] of destinationTags) {
      if (pattern.test(token)) {
        for (const tag of matchedTags) tags.add(tag);
      }
    }
  }

  return [...tags].sort();
}

function normalizeForMatch(value: string): string {
  return slugify(value).replace(/-/g, "-");
}

function bucketDuration(numDays?: number): string {
  if (!numDays) return "duration-flexible";
  if (numDays <= 1) return "day-trip";
  if (numDays <= 3) return "short-escape";
  if (numDays <= 7) return "standard-week";
  if (numDays <= 14) return "long-trip";
  return "extended-trip";
}

function bucketBudget(budget?: number, currency = "USD"): string {
  if (!budget) return "budget-flexible";

  const normalizedCurrency = currency.toUpperCase();
  if (normalizedCurrency === "VND") {
    if (budget < 2_000_000) return "budget-vnd-under-2m";
    if (budget < 5_000_000) return "budget-vnd-2m-5m";
    if (budget < 10_000_000) return "budget-vnd-5m-10m";
    if (budget < 20_000_000) return "budget-vnd-10m-20m";
    return "budget-vnd-20m-plus";
  }

  if (budget < 100) return `budget-${normalizedCurrency.toLowerCase()}-under-100`;
  if (budget < 300) return `budget-${normalizedCurrency.toLowerCase()}-100-300`;
  if (budget < 1_000) return `budget-${normalizedCurrency.toLowerCase()}-300-1000`;
  if (budget < 3_000) return `budget-${normalizedCurrency.toLowerCase()}-1000-3000`;
  return `budget-${normalizedCurrency.toLowerCase()}-3000-plus`;
}

function bucketTravelers(numTravelers?: number): string {
  if (!numTravelers || numTravelers <= 1) return "solo";
  if (numTravelers === 2) return "couple";
  if (numTravelers <= 5) return "small-group";
  return "group";
}

function bucketSeason(startDate?: string): string | null {
  if (!startDate) return null;
  const month = Number.parseInt(startDate.slice(5, 7), 10);
  if (!Number.isFinite(month)) return null;
  return `month-${String(month).padStart(2, "0")}`;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
