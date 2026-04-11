import type { ItineraryInput, ItineraryOverview, Itinerary } from "@travel/types";
import type { AIProvider, PreFetchedCityData } from "../provider";
import {
  buildOverviewPrompt,
  buildDetailPrompt,
  buildNLPPrompt,
  SYSTEM_PROMPT,
} from "../prompts/itinerary";
import { GoogleGenerativeAI } from "@google/generative-ai";

export class GeminiProvider implements AIProvider {
  private client: GoogleGenerativeAI;
  private model: string;

  constructor(apiKey: string, model = "gemini-1.5-pro") {
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = model;
  }

  private async callModel(systemPrompt: string, userPrompt: string): Promise<string> {
    const genModel = this.client.getGenerativeModel({
      model: this.model,
      systemInstruction: systemPrompt,
      generationConfig: { responseMimeType: "application/json" },
    });

    const result = await genModel.generateContent(userPrompt);
    const text = result.response.text();
    if (!text) throw new Error("Gemini returned empty response");
    return text;
  }

  async generateOverview(
    input: ItineraryInput,
    cityData: PreFetchedCityData[]
  ): Promise<ItineraryOverview> {
    const text = await this.callModel(
      SYSTEM_PROMPT(input.locale),
      buildOverviewPrompt(input, cityData)
    );
    return JSON.parse(text) as ItineraryOverview;
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
    return JSON.parse(text) as Itinerary;
  }

  async transcribeVideo(videoUrl: string): Promise<string> {
    const text = await this.callModel(
      "You are a travel content extractor.",
      `Extract travel information from: ${videoUrl}`
    );
    return text;
  }

  async parseNaturalInput(text: string, locale: string): Promise<Partial<ItineraryInput>> {
    const result = await this.callModel(
      SYSTEM_PROMPT(locale),
      buildNLPPrompt(text)
    );
    return JSON.parse(result) as Partial<ItineraryInput>;
  }
}
