import {
  isWorkersAiQuota,
  PlanningGenerationError,
} from "./planning-generation-error.js";
import { generateDailyPlan } from "./daily-plan.js";
import { normalizeItinerary } from "../normalize-itinerary.js";
import * as travelTypes from "@travel/types";
const { tripDayCount, countryDestinationReference } =
  (travelTypes as unknown as { default?: typeof travelTypes }).default ??
  travelTypes;
import {
  translationPrompt,
  TRANSLATION_SYSTEM,
} from "../prompts/translation.js";
import type {
  AiTokenUsage,
  Itinerary,
  ItineraryInput,
  ItineraryOverview,
} from "@travel/types";
import type { AIProvider, PreFetchedCityData } from "../provider.js";
import {
  buildDetailPrompt,
  buildNLPPrompt,
  buildOverviewPrompt,
  SYSTEM_PROMPT,
} from "../prompts/itinerary.js";

export type WorkersAIBinding = {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
};

export class CloudflareAIProvider implements AIProvider {
  private readonly usage: AiTokenUsage[] = [];
  constructor(
    private readonly ai: WorkersAIBinding,
    private readonly model = "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  ) {}

  translateTexts(texts: Record<string, string>, target: "en" | "vi") {
    return this.generate<Record<string, string>>(
      translationPrompt(texts, target),
      target,
      "translate",
      6000,
      TRANSLATION_SYSTEM,
    );
  }
  getUsage() {
    return [...this.usage];
  }

  generateOverview(input: ItineraryInput, cities: PreFetchedCityData[]) {
    // The daily planner generates its own outline. Structured requests already
    // specify the duration and route, so a separate model overview adds no input.
    const days = tripDayCount(input);
    if (input.planning && days >= 3 && !input.prompt_text?.trim()) {
      const names = cities.length
        ? cities.map((city) => city.city)
        : input.cities.map(
            (slug) =>
              countryDestinationReference(slug)?.names[
                input.locale === "vi" ? "vi" : "en"
              ] ?? slug,
          );
      return Promise.resolve<ItineraryOverview>({
        title: names.join(" → "),
        overview: "",
        cities: names,
        total_days: days,
        day_plan: [],
        estimated_budget: {
          min: 0,
          max: input.budget ?? 0,
          currency: input.currency,
        },
      });
    }
    return this.generate<ItineraryOverview>(
      buildOverviewPrompt(input, cities),
      input.locale,
      "overview",
      2500,
    );
  }

  generateDetail(
    input: ItineraryInput,
    overview: ItineraryOverview,
    cities: PreFetchedCityData[],
  ) {
    if (overview.total_days >= 3)
      return generateDailyPlan(
        input,
        overview,
        cities,
        (prompt, tokens, schema, system) =>
          this.generate<Record<string, unknown>>(
            prompt,
            input.locale,
            "detail",
            tokens,
            system,
            schema,
          ),
        normalizeItinerary,
      );
    return this.generate<Itinerary>(
      buildDetailPrompt(input, overview, cities),
      input.locale,
      "detail",
      7000,
    );
  }

  parseNaturalInput(text: string, locale: string) {
    return this.generate<Partial<ItineraryInput>>(buildNLPPrompt(text), locale);
  }

  async transcribeVideo(_videoUrl: string): Promise<string> {
    throw new Error(
      "Video transcription is not available with the Cloudflare text model",
    );
  }

  fillDay<T>(
    prompt: string,
    locale: string,
    maxTokens: number,
    schema: Record<string, unknown>,
  ) {
    return this.generate<T>(
      prompt,
      locale,
      "detail",
      maxTokens,
      undefined,
      schema,
    );
  }

  // The generation ledger must persist the provider response before JSON validation.
  supplementRaw(
    prompt: string,
    locale: string,
    schema: Record<string, unknown>,
  ) {
    return this.generate<{ response?: string | object }>(
      prompt,
      locale,
      "detail",
      6000,
      "Supply compact missing travel data. Follow the user's locale and constraints.",
      schema,
      true,
    );
  }

  private async generate<T>(
    prompt: string,
    locale: string,
    operation?: AiTokenUsage["operation"],
    maxTokens = 2000,
    system?: string,
    schema?: Record<string, unknown>,
    rawResponse = false,
  ): Promise<T> {
    const started = Date.now();
    const day = prompt.match(
      /^Write ONLY the detailed timeline for day (\d+)\//,
    )?.[1];
    const phase = day
      ? prompt.includes("Repair ONLY this day")
        ? "day_repair"
        : "day"
      : prompt.startsWith("Plan a geographically clustered")
        ? prompt.includes("Fix these outline problems")
          ? "outline_repair"
          : "outline"
        : operation;
    if (phase === "outline_repair" || phase === "day_repair") {
      const previous = this.usage.at(-1);
      if (previous?.outcome === "received") previous.outcome = "invalid_output";
    }
    const fullRepair = prompt.includes(
      "\nRepair the following quality issues once;",
    );
    const context = {
      phase: fullRepair ? "full_repair" : phase,
      day: day ? Number(day) : undefined,
    } as Pick<AiTokenUsage, "phase" | "day">;
    const output = (await this.ai
      .run(this.model, {
        messages: [
          {
            role: "system",
            content: `${system ?? SYSTEM_PROMPT(locale)}\nReturn only a valid JSON object, without markdown.`,
          },
          { role: "user", content: prompt },
        ],
        response_format: schema
          ? { type: "json_schema", json_schema: schema }
          : { type: "json_object" },
        max_tokens: maxTokens,
        temperature: 0.2,
      })
      .catch((error: unknown) => {
        if (operation)
          this.usage.push({
            operation,
            ...context,
            provider: "cloudflare",
            model: this.model,
            input_tokens: null,
            output_tokens: null,
            total_tokens: null,
            duration_ms: Date.now() - started,
            outcome: isWorkersAiQuota(error)
              ? "quota_rejected"
              : "provider_error",
          });
        if (isWorkersAiQuota(error))
          throw new PlanningGenerationError("AI_QUOTA_EXHAUSTED");
        throw error;
      })) as {
      response?: string | object;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };
    if (operation)
      this.usage.push({
        operation,
        ...context,
        provider: "cloudflare",
        model: this.model,
        input_tokens: output?.usage?.prompt_tokens ?? null,
        output_tokens: output?.usage?.completion_tokens ?? null,
        total_tokens: output?.usage?.total_tokens ?? null,
        duration_ms: Date.now() - started,
        outcome: "received",
      });
    if (rawResponse) return output as T;
    try {
      if (!output?.response)
        throw new Error("Workers AI returned an empty response");
      const result =
        typeof output.response === "string"
          ? JSON.parse(output.response)
          : output.response;
      if (!result || typeof result !== "object" || Array.isArray(result))
        throw new Error("Workers AI returned invalid JSON");
      return result as T;
    } catch (error) {
      const usage = operation && this.usage.at(-1);
      if (usage) usage.outcome = "invalid_output";
      throw error;
    }
  }
}
