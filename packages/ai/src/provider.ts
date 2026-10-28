import type {
  ItineraryInput,
  ItineraryOverview,
  Itinerary,
  AiTokenUsage,
} from "@travel/types";

export interface PreFetchedCityData {
  city: string;
  country: string;
  timezone: string;
  currency: string;
  lat: number | null;
  lon: number | null;
  places: unknown[];
  restaurants: unknown[];
  hotels: unknown[];
  sunrise: string;
  sunset: string;
  daylight_hours: string;
  weather_note: string;
  weather_highlights: string[];
  weather_warnings: string[];
  transport_options: unknown[];
  ticket_options: Record<string, unknown[]>;
}

export interface AIProvider {
  translateTexts?(
    texts: Record<string, string>,
    target: "en" | "vi",
  ): Promise<Record<string, string>>;
  getUsage?(): AiTokenUsage[];
  /**
   * Phase 1: Generate a lightweight overview (~1,500 tokens output).
   * Called immediately after data fetch to give the first visible render.
   */
  generateOverview(
    input: ItineraryInput,
    cityData: PreFetchedCityData[],
  ): Promise<ItineraryOverview>;

  /**
   * Phase 2: Generate full itinerary detail using pre-fetched data.
   * Pre-fetching data is passed as structured context to minimize hallucination.
   */
  generateDetail(
    input: ItineraryInput,
    overview: ItineraryOverview,
    cityData: PreFetchedCityData[],
  ): Promise<Itinerary>;

  /**
   * Transcribe a video (TikTok / IG Reel) to text for content extraction.
   * Only called when a video URL is found — never for text pages.
   */
  transcribeVideo(videoUrl: string): Promise<string>;

  /**
   * Parse a natural-language travel query into structured ItineraryInput.
   * e.g. "5 days Da Lat in June, 5 million budget" → ItineraryInput
   */
  parseNaturalInput(
    text: string,
    locale: string,
  ): Promise<Partial<ItineraryInput>>;
}
