import type { AIProvider, PreFetchedCityData } from "../provider.js";
import type {
  ActivityCategory,
  ItineraryInput,
  ItineraryOverview,
  Itinerary,
  AiTokenUsage,
} from "@travel/types";
import {
  buildDetailPrompt,
  buildNLPPrompt,
  SYSTEM_PROMPT,
} from "../prompts/itinerary.js";
import { OpenAIProvider } from "./openai.js";

export interface OllamaProviderOptions {
  baseURL: string;
  overviewModel: string;
  detailModel: string;
}

export class OllamaProvider implements AIProvider {
  private readonly chatEndpoint: string;
  private readonly overviewModel: string;
  private readonly detailModel: string;
  private readonly openAICompatible: OpenAIProvider;
  private readonly usage: AiTokenUsage[] = [];

  translateTexts(texts: Record<string, string>, target: "en" | "vi") {
    return this.openAICompatible.translateTexts(texts, target);
  }
  getUsage(): AiTokenUsage[] {
    return [...this.usage];
  }

  constructor(options: OllamaProviderOptions) {
    this.chatEndpoint = getOllamaChatEndpoint(options.baseURL);
    this.overviewModel = options.overviewModel;
    this.detailModel = options.detailModel;
    this.openAICompatible = new OpenAIProvider("ollama", options.detailModel, {
      baseURL: options.baseURL,
      disableThinking: true,
      timeoutMs: 180_000,
    });
  }

  async generateOverview(
    input: ItineraryInput,
    cityData: PreFetchedCityData[],
  ): Promise<ItineraryOverview> {
    const cities = cityData.map((city) => city.city);
    const totalDays = getTripDays(input);
    const budget = input.budget ?? 0;

    return {
      title: `${cities.join(" & ")} · ${totalDays}-day trip`,
      overview: `A ${input.trip_style.replace(/_/g, " ")} ${totalDays}-day trip for ${input.num_travelers} traveler(s), planned around the requested budget and travel dates.`,
      cities,
      total_days: totalDays,
      estimated_budget: {
        min: budget,
        max: budget,
        currency: input.currency,
      },
      day_plan: Array.from({ length: totalDays }, (_, index) => {
        const cityIndex = Math.min(
          cities.length - 1,
          Math.floor((index * cities.length) / totalDays),
        );
        const city = cities[cityIndex] ?? input.cities[0] ?? "Destination";
        return `Day ${index + 1}: ${city}`;
      }),
    };
  }

  async generateDetail(
    input: ItineraryInput,
    overview: ItineraryOverview,
    cityData: PreFetchedCityData[],
  ): Promise<Itinerary> {
    const content = await generateJson(
      this.chatEndpoint,
      this.detailModel,
      SYSTEM_PROMPT(input.locale),
      buildDetailPrompt(input, overview, cityData),
      Math.min(32768, Math.max(8192, 4096 + overview.total_days * 2500)),
      Math.min(900_000, Math.max(180_000, overview.total_days * 60_000)),
      (payload) =>
        this.usage.push(toUsage(payload, this.detailModel, "detail")),
    );
    return normalizeOllamaItinerary(parseJsonRecord(content));
  }

  transcribeVideo(videoUrl: string): Promise<string> {
    return this.openAICompatible.transcribeVideo(videoUrl);
  }

  async parseNaturalInput(
    text: string,
    locale: string,
  ): Promise<Partial<ItineraryInput>> {
    const content = await generateJson(
      this.chatEndpoint,
      this.overviewModel,
      SYSTEM_PROMPT(locale),
      buildNLPPrompt(text),
      512,
    );
    return parseJsonRecord(content) as Partial<ItineraryInput>;
  }
}

function getOllamaChatEndpoint(baseURL: string): string {
  return `${baseURL.replace(/\/v1\/?$/, "").replace(/\/$/, "")}/api/chat`;
}

async function generateJson(
  endpoint: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  timeoutMs = 180_000,
  onPayload?: (payload: Record<string, unknown>) => void,
): Promise<string> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      format: "json",
      think: false,
      stream: false,
      options: { temperature: 0.2, num_predict: maxTokens },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const details = (await response.text()).slice(0, 500);
    throw new Error(
      `Ollama request for ${model} failed with HTTP ${response.status}: ${details}`,
    );
  }

  const payload: unknown = await response.json();
  const result = record(payload);
  onPayload?.(result);
  const message = record(result["message"]);
  const content = text(message["content"]);
  if (!content) {
    const reason = text(result["done_reason"]) ?? "unknown";
    throw new Error(
      `Ollama model ${model} returned no response content (done_reason: ${reason})`,
    );
  }
  return content;
}

function toUsage(
  payload: Record<string, unknown>,
  model: string,
  operation: AiTokenUsage["operation"],
): AiTokenUsage {
  const input = nonNegativeNumber(payload["prompt_eval_count"]);
  const output = nonNegativeNumber(payload["eval_count"]);
  const total =
    input !== undefined && output !== undefined ? input + output : null;
  const durationNs = nonNegativeNumber(payload["total_duration"]);
  return {
    operation,
    provider: "ollama",
    model,
    input_tokens: input ?? null,
    output_tokens: output ?? null,
    total_tokens: total,
    duration_ms:
      durationNs === undefined ? null : Math.round(durationNs / 1_000_000),
  };
}

function parseJsonRecord(content: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error("Ollama returned malformed JSON", { cause: error });
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Ollama returned JSON that is not an object");
  }
  return parsed as Record<string, unknown>;
}

function getTripDays(input: ItineraryInput): number {
  if (input.num_days) return input.num_days;
  if (!input.start_date || !input.end_date) return 1;

  const start = Date.parse(`${input.start_date}T00:00:00Z`);
  const end = Date.parse(`${input.end_date}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 1;
  return Math.min(30, Math.floor((end - start) / 86_400_000) + 1);
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function nonNegativeNumber(value: unknown): number | undefined {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function normalizeOllamaItinerary(itinerary: Itinerary): Itinerary;
export function normalizeOllamaItinerary(
  itinerary: Record<string, unknown>,
): Itinerary;
export function normalizeOllamaItinerary(
  itinerary: Itinerary | Record<string, unknown>,
): Itinerary {
  const rawItinerary = record(itinerary);
  const rawBudget = record(rawItinerary["budget_breakdown"]);
  const accommodation =
    nonNegativeNumber(rawBudget["accommodation"]) ??
    nonNegativeNumber(rawBudget["accommodation_estimate"]) ??
    0;
  const food =
    nonNegativeNumber(rawBudget["food"]) ??
    nonNegativeNumber(rawBudget["food_dining_estimate"]) ??
    0;
  const activities =
    nonNegativeNumber(rawBudget["activities"]) ??
    nonNegativeNumber(rawBudget["activities_estimate"]) ??
    0;
  const transport =
    nonNegativeNumber(rawBudget["transport"]) ??
    nonNegativeNumber(rawBudget["transport_estimate"]) ??
    0;
  const contingency =
    nonNegativeNumber(rawBudget["contingency"]) ??
    nonNegativeNumber(rawBudget["miscellaneous_buffer"]) ??
    0;
  const totalCost = nonNegativeNumber(rawItinerary["total_cost"]);
  const total =
    nonNegativeNumber(rawBudget["total"]) ??
    nonNegativeNumber(rawBudget["total_calculated"]) ??
    totalCost ??
    accommodation + food + activities + transport + contingency;
  const numDays = nonNegativeNumber(rawItinerary["num_days"]) || 1;
  const numTravelers = nonNegativeNumber(rawItinerary["num_travelers"]) || 1;
  const currency =
    text(rawBudget["currency"]) ?? text(rawItinerary["currency"]) ?? "USD";
  const days = Array.isArray(rawItinerary["days"])
    ? rawItinerary["days"].map((value, index) => {
        const day = record(value);
        const rawActivities = Array.isArray(day["activities"])
          ? day["activities"]
          : Array.isArray(day["schedule"])
            ? day["schedule"]
            : [];
        const normalizedActivities = rawActivities.map((activityValue) => {
          const activity = record(activityValue);
          const cost =
            nonNegativeNumber(activity["cost"]) ??
            nonNegativeNumber(activity["cost_estimate_usd"]);
          const category = text(activity["category"]);
          const categories: ActivityCategory[] = [
            "attraction",
            "food",
            "transport",
            "accommodation",
            "leisure",
            "shopping",
          ];
          const goldenMoment = normalizeGoldenMoment(activity["golden_moment"]);

          return {
            ...activity,
            time: text(activity["time"]) ?? text(activity["time_slot"]) ?? "",
            name:
              text(activity["name"]) ??
              text(activity["activity"]) ??
              "Activity",
            description: text(activity["description"]) ?? "",
            duration: text(activity["duration"]) ?? "",
            cost: cost ?? null,
            currency: text(activity["currency"]) ?? currency,
            category:
              categories.find((value) => value === category) ?? "attraction",
            maps_link: text(activity["maps_link"]) ?? "",
            golden_moment: goldenMoment,
            ticket_activities: Array.isArray(activity["ticket_activities"])
              ? activity["ticket_activities"]
                  .map((ticket) => {
                    const ticketRecord = record(ticket);
                    const platform = text(ticketRecord["platform"]);
                    const url = text(ticketRecord["url"]);
                    if (!platform || !url) return undefined;
                    const priceFrom = text(ticketRecord["price_from"]);
                    const note = text(ticketRecord["note"]);
                    return {
                      ...ticketRecord,
                      platform,
                      url,
                      ...(priceFrom ? { price_from: priceFrom } : {}),
                      ...(note ? { note } : {}),
                    };
                  })
                  .filter((ticket) => ticket !== undefined)
              : [],
          };
        });
        const activityCost = normalizedActivities.reduce(
          (sum, activity) => sum + (activity.cost ?? 0),
          0,
        );

        return {
          ...day,
          day_number: nonNegativeNumber(day["day_number"]) ?? index + 1,
          date: text(day["date"]) ?? "",
          city: text(day["city"]) ?? "",
          title: text(day["title"]) ?? text(day["theme"]) ?? `Day ${index + 1}`,
          activities: normalizedActivities,
          daily_cost_estimate:
            nonNegativeNumber(day["daily_cost_estimate"]) ??
            (activityCost || total / numDays),
        };
      })
    : [];
  const seasonalNotes = record(rawItinerary["seasonal_notes"]);

  return {
    ...itinerary,
    days,
    seasonal_notes: {
      ...seasonalNotes,
      travel_month: text(seasonalNotes["travel_month"]) ?? "",
      daylight_hours: text(seasonalNotes["daylight_hours"]) ?? "",
      sunrise_time: text(seasonalNotes["sunrise_time"]) ?? "",
      sunset_time: text(seasonalNotes["sunset_time"]) ?? "",
      weather_note:
        text(seasonalNotes["weather_note"]) ??
        text(seasonalNotes["weather_advice"]) ??
        "",
      highlights: Array.isArray(seasonalNotes["highlights"])
        ? seasonalNotes["highlights"].filter(
            (value): value is string => typeof value === "string",
          )
        : [],
      warnings: Array.isArray(seasonalNotes["warnings"])
        ? seasonalNotes["warnings"].filter(
            (value): value is string => typeof value === "string",
          )
        : [],
    },
    total_cost: totalCost ?? total,
    budget_breakdown: {
      ...Object.fromEntries(["items", "complete", "missing_items", "transport_details"].filter(key => key in rawBudget).map(key => [key, rawBudget[key]])),
      accommodation,
      food,
      activities,
      transport,
      contingency,
      total,
      currency,
      per_person:
        nonNegativeNumber(rawBudget["per_person"]) ?? total / numTravelers,
      per_day: nonNegativeNumber(rawBudget["per_day"]) ?? total / numDays,
    },
  } as Itinerary;
}

function normalizeGoldenMoment(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const moment = record(value);
  const type = text(moment["type"]);
  const allowedTypes = [
    "sunrise",
    "sunset",
    "golden_hour",
    "blue_hour",
    "night_view",
    "crowd_avoid",
  ] as const;
  if (!type || !allowedTypes.includes(type as (typeof allowedTypes)[number])) {
    return undefined;
  }
  return {
    type,
    best_time: text(moment["best_time"]) ?? "",
    tip: text(moment["tip"]) ?? "",
  };
}
