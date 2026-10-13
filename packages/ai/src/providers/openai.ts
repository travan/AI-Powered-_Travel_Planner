import type { ItineraryInput, ItineraryOverview, Itinerary } from "@travel/types";
import type { AIProvider, PreFetchedCityData } from "../provider.js";
import {
  buildOverviewPrompt,
  buildDetailPrompt,
  buildNLPPrompt,
  SYSTEM_PROMPT,
} from "../prompts/itinerary.js";
import OpenAI from "openai";

type ChatCompletionRequest = OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & {
  think?: boolean;
};

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private model: string;
  private naturalInputModel: string;
  private maxTokens?: number;
  private disableThinking: boolean;

  constructor(
    apiKey: string,
    model = "gpt-4o",
    options: {
      baseURL?: string;
      naturalInputModel?: string;
      maxTokens?: number;
      disableThinking?: boolean;
      timeoutMs?: number;
    } = {}
  ) {
    this.client = new OpenAI({
      apiKey,
      ...(options.baseURL ? { baseURL: options.baseURL } : {}),
      ...(options.timeoutMs ? { timeout: options.timeoutMs } : {}),
      ...(options.baseURL ? { maxRetries: 0 } : {}),
    });
    this.model = model;
    this.naturalInputModel = options.naturalInputModel ?? "gpt-4o-mini";
    this.maxTokens = options.maxTokens;
    this.disableThinking = options.disableThinking ?? false;
  }

  async generateOverview(
    input: ItineraryInput,
    cityData: PreFetchedCityData[]
  ): Promise<ItineraryOverview> {
    const request: ChatCompletionRequest = {
      model: this.model,
      temperature: this.disableThinking ? 0.2 : 0.7,
      response_format: { type: "json_object" },
      stream: false,
      ...(this.maxTokens ? { max_tokens: this.maxTokens } : {}),
      ...(this.disableThinking ? { think: false } : {}),
      messages: [
        { role: "system", content: SYSTEM_PROMPT(input.locale) },
        { role: "user", content: buildOverviewPrompt(input, cityData) },
      ],
    };
    const response = await this.client.chat.completions.create(request);

    const content = response.choices[0]?.message.content;
    if (!content) throw new Error("OpenAI returned empty overview response");
    return JSON.parse(content) as ItineraryOverview;
  }

  async generateDetail(
    input: ItineraryInput,
    overview: ItineraryOverview,
    cityData: PreFetchedCityData[]
  ): Promise<Itinerary> {
    const request: ChatCompletionRequest = {
      model: this.model,
      temperature: this.disableThinking ? 0.2 : 0.7,
      response_format: { type: "json_object" },
      stream: false,
      ...(this.maxTokens ? { max_tokens: this.maxTokens } : {}),
      ...(this.disableThinking ? { think: false } : {}),
      messages: [
        { role: "system", content: SYSTEM_PROMPT(input.locale) },
        { role: "user", content: buildDetailPrompt(input, overview, cityData) },
      ],
    };
    const response = await this.client.chat.completions.create(request);

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
      model: this.naturalInputModel,
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
