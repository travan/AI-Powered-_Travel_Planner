import type { ItineraryInput, ItineraryOverview, Itinerary } from "@travel/types";
import type { AIProvider, PreFetchedCityData } from "../provider";
import {
  buildOverviewPrompt,
  buildDetailPrompt,
  buildNLPPrompt,
  SYSTEM_PROMPT,
} from "../prompts/itinerary";
import OpenAI from "openai";

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model = "gpt-4o") {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async generateOverview(
    input: ItineraryInput,
    cityData: PreFetchedCityData[]
  ): Promise<ItineraryOverview> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT(input.locale) },
        { role: "user", content: buildOverviewPrompt(input, cityData) },
      ],
    });

    const content = response.choices[0]?.message.content;
    if (!content) throw new Error("OpenAI returned empty overview response");
    return JSON.parse(content) as ItineraryOverview;
  }

  async generateDetail(
    input: ItineraryInput,
    overview: ItineraryOverview,
    cityData: PreFetchedCityData[]
  ): Promise<Itinerary> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT(input.locale) },
        { role: "user", content: buildDetailPrompt(input, overview, cityData) },
      ],
    });

    const content = response.choices[0]?.message.content;
    if (!content) throw new Error("OpenAI returned empty detail response");
    return JSON.parse(content) as Itinerary;
  }

  async transcribeVideo(videoUrl: string): Promise<string> {
    // Use GPT-4o vision/audio for video content extraction
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract all travel-related information (place names, tips, food recommendations, prices) from this video: ${videoUrl}. Return as structured text.`,
            },
          ],
        },
      ],
    });

    return response.choices[0]?.message.content ?? "";
  }

  async parseNaturalInput(text: string, locale: string): Promise<Partial<ItineraryInput>> {
    const response = await this.client.chat.completions.create({
      model: "gpt-4o-mini", // cheaper model for NLP parsing
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT(locale) },
        { role: "user", content: buildNLPPrompt(text) },
      ],
    });

    const content = response.choices[0]?.message.content;
    if (!content) return {};
    return JSON.parse(content) as Partial<ItineraryInput>;
  }
}
