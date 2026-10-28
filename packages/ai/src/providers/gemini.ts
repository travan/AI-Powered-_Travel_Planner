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
import { GoogleGenerativeAI } from "@google/generative-ai";

export class GeminiProvider implements AIProvider {
  private client: GoogleGenerativeAI;
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

  constructor(apiKey: string, model = "gemini-1.5-pro") {
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = model;
  }

  private async callModel(
    systemPrompt: string,
    userPrompt: string,
    operation?: AiTokenUsage["operation"],
  ): Promise<string> {
    const genModel = this.client.getGenerativeModel({
      model: this.model,
      systemInstruction: systemPrompt,
      generationConfig: { responseMimeType: "application/json" },
    });

    const result = await genModel.generateContent(userPrompt);
    if (operation) {
      const input = result.response.usageMetadata?.promptTokenCount ?? null;
      const output =
        result.response.usageMetadata?.candidatesTokenCount ?? null;
      this.usage.push({
        operation,
        provider: "gemini",
        model: this.model,
        input_tokens: input,
        output_tokens: output,
        total_tokens:
          result.response.usageMetadata?.totalTokenCount ??
          (input !== null && output !== null ? input + output : null),
      });
    }
    const text = result.response.text();
    if (!text) throw new Error("Gemini returned empty response");
    return text;
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
    return JSON.parse(text) as ItineraryOverview;
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
    return JSON.parse(text) as Itinerary;
  }

  async transcribeVideo(videoUrl: string): Promise<string> {
    const text = await this.callModel(
      "You are a travel content extractor.",
      `Extract travel information from: ${videoUrl}`,
    );
    return text;
  }

  async parseNaturalInput(
    text: string,
    locale: string,
  ): Promise<Partial<ItineraryInput>> {
    const result = await this.callModel(
      SYSTEM_PROMPT(locale),
      buildNLPPrompt(text),
    );
    return JSON.parse(result) as Partial<ItineraryInput>;
  }
}
