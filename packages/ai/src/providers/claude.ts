import type { ItineraryInput, ItineraryOverview, Itinerary } from "@travel/types";
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

  constructor(apiKey: string, model = "claude-3-5-sonnet-20241022") {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  private async callModel(systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const block = response.content[0];
    if (block?.type !== "text") throw new Error("Claude returned non-text response");
    return block.text;
  }

  async generateOverview(
    input: ItineraryInput,
    cityData: PreFetchedCityData[]
  ): Promise<ItineraryOverview> {
    const text = await this.callModel(
      SYSTEM_PROMPT(input.locale),
      buildOverviewPrompt(input, cityData)
    );
    // Claude may wrap JSON in markdown — strip it
    const json = text.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    return JSON.parse(json) as ItineraryOverview;
  }

  async generateDetail(
    input: ItineraryInput,
    overview: ItineraryOverview,
    cityData: PreFetchedCityData[]
  ): Promise<Itinerary> {
    const text = await this.callModel(
      SYSTEM_PROMPT(input.locale),
      buildDetailPrompt(input, overview, cityData)
    );
    const json = text.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    return JSON.parse(json) as Itinerary;
  }

  async transcribeVideo(videoUrl: string): Promise<string> {
    return this.callModel(
      "You are a travel content extractor.",
      `Extract travel-related information from this video URL: ${videoUrl}`
    );
  }

  async parseNaturalInput(text: string, locale: string): Promise<Partial<ItineraryInput>> {
    const result = await this.callModel(
      SYSTEM_PROMPT(locale),
      buildNLPPrompt(text)
    );
    const json = result.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    return JSON.parse(json) as Partial<ItineraryInput>;
  }
}
