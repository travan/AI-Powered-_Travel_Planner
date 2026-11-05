import { generateDailyPlan } from "./daily-plan.js";
import { normalizeItinerary } from "../normalize-itinerary.js";
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

  private async generate<T>(
    prompt: string,
    locale: string,
    operation?: AiTokenUsage["operation"],
    maxTokens = 2000,
    system?: string,
    schema?: Record<string, unknown>,
  ): Promise<T> {
    const output = (await this.ai.run(this.model, {
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
    })) as {
      response?: string | object;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };
    if (!output?.response)
      throw new Error("Workers AI returned an empty response");
    if (operation)
      this.usage.push({
        operation,
        provider: "cloudflare",
        model: this.model,
        input_tokens: output.usage?.prompt_tokens ?? null,
        output_tokens: output.usage?.completion_tokens ?? null,
        total_tokens: output.usage?.total_tokens ?? null,
      });
    const result =
      typeof output.response === "string"
        ? JSON.parse(output.response)
        : output.response;
    if (!result || typeof result !== "object" || Array.isArray(result))
      throw new Error("Workers AI returned invalid JSON");
    return result as T;
  }
}
