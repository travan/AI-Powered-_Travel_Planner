import {
  translationPrompt,
  TRANSLATION_SYSTEM,
} from "../prompts/translation.js";
import type {
  ItineraryInput,
  ItineraryOverview,
  Itinerary,
  AiTokenUsage,
} from "@travel/types";
import type { AIProvider, PreFetchedCityData } from "../provider.js";
import {
  buildOverviewPrompt,
  buildDetailPrompt,
  buildNLPPrompt,
  SYSTEM_PROMPT,
} from "../prompts/itinerary.js";
import Anthropic from "@anthropic-ai/sdk";

export class ClaudeProvider implements AIProvider {
  private client: Anthropic;
  private model: string;
  private readonly usage: AiTokenUsage[] = [];

  async translateTexts(texts: Record<string, string>, target: "en" | "vi") {
    const text = await this.callModel(
      TRANSLATION_SYSTEM,
      translationPrompt(texts, target),
      "translate",
    );
    return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")) as Record<
      string,
      string
    >;
  }
  getUsage(): AiTokenUsage[] {
    return [...this.usage];
  }

  constructor(apiKey: string, model?: string) {
    if (!model?.trim()) throw new Error("ANTHROPIC_MODEL is required");
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  private async callModel(
    systemPrompt: string,
    userPrompt: string,
    operation?: AiTokenUsage["operation"],
  ): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    if (operation) {
      const input = response.usage.input_tokens;
      const output = response.usage.output_tokens;
      this.usage.push({
        operation,
        provider: "claude",
        model: response.model,
        input_tokens: input,
        output_tokens: output,
        total_tokens: input + output,
      });
    }

    const block = response.content[0];
    if (block?.type !== "text")
      throw new Error("Claude returned non-text response");
    return block.text;
  }

  async generateOverview(
    input: ItineraryInput,
    cityData: PreFetchedCityData[],
  ): Promise<ItineraryOverview> {
    const text = await this.callModel(
      SYSTEM_PROMPT(input.locale),
      buildOverviewPrompt(input, cityData),
      "overview",
    );
    // Claude may wrap JSON in markdown — strip it
    const json = text.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    return JSON.parse(json) as ItineraryOverview;
  }

  async generateDetail(
    input: ItineraryInput,
    overview: ItineraryOverview,
    cityData: PreFetchedCityData[],
  ): Promise<Itinerary> {
    const text = await this.callModel(
      SYSTEM_PROMPT(input.locale),
      buildDetailPrompt(input, overview, cityData),
      "detail",
    );
    const json = text.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    return JSON.parse(json) as Itinerary;
  }

  async transcribeVideo(videoUrl: string): Promise<string> {
    return this.callModel(
      "You are a travel content extractor.",
      `Extract travel-related information from this video URL: ${videoUrl}`,
    );
  }

  async parseNaturalInput(
    text: string,
    locale: string,
  ): Promise<Partial<ItineraryInput>> {
    const result = await this.callModel(
      SYSTEM_PROMPT(locale),
      buildNLPPrompt(text),
    );
    const json = result.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    return JSON.parse(json) as Partial<ItineraryInput>;
  }
}
