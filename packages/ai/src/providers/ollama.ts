import { normalizeItinerary as normalizeOllamaItinerary } from "../normalize-itinerary.js";
export { normalizeItinerary as normalizeOllamaItinerary } from "../normalize-itinerary.js";
import type { AIProvider, PreFetchedCityData } from "../provider.js";
import type {
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
import { generateDailyPlan } from "./daily-plan.js";

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
    if (overview.total_days >= 3)
      return generateDailyPlan(
        input,
        overview,
        cityData,
        async (prompt, tokens, schema, system) =>
          parseJsonRecord(
            await generateJson(
              this.chatEndpoint,
              this.detailModel,
              system ?? SYSTEM_PROMPT(input.locale),
              prompt,
              tokens,
              300_000,
              (payload) =>
                this.usage.push(toUsage(payload, this.detailModel, "detail")),
              schema,
            ),
          ),
        normalizeOllamaItinerary,
      );
    const content = await generateJson(
      this.chatEndpoint,
      this.detailModel,
      SYSTEM_PROMPT(input.locale),
      buildDetailPrompt(input, overview, cityData),
      Math.min(32768, Math.max(8192, 4096 + overview.total_days * 2500)),
      Math.min(1_800_000, Math.max(180_000, overview.total_days * 120_000)),
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
  schema?: Record<string, unknown>,
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
      format: schema ?? "json",
      think: false,
      stream: true,
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

  // Streaming keeps long local generations below the HTTP client's idle/header limits.
  // Accept ordinary JSON too for compatible local servers.
  let result: Record<string, unknown>;
  if (response.headers.get("content-type")?.includes("ndjson")) {
    if (!response.body) throw new Error("Ollama returned no response body");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let terminal: Record<string, unknown> | undefined;
    const consume = (line: string) => {
      if (!line.trim()) return;
      const chunk = record(JSON.parse(line));
      if (chunk["error"])
        throw new Error(`Ollama generation failed: ${chunk["error"]}`);
      const delta = record(chunk["message"])["content"];
      if (typeof delta === "string") content += delta;
      if (chunk["done"] === true) terminal = chunk;
    };
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          consume(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
        }
      }
      buffer += decoder.decode();
      consume(buffer);
    } finally {
      reader.releaseLock();
    }
    if (!terminal)
      throw new Error("Ollama response stream ended before completion");
    result = { ...terminal, message: { content } };
  } else {
    result = record(await response.json());
  }
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
