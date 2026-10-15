import { describe, expect, it, vi } from "vitest";
import type { Itinerary } from "../../../../../packages/types/src/itinerary.js";
import {
  normalizeOllamaItinerary,
  OllamaProvider,
} from "../../../../../packages/ai/src/providers/ollama.js";
import { buildDetailPrompt } from "../../../../../packages/ai/src/prompts/itinerary.js";
import type { PreFetchedCityData } from "../../../../../packages/ai/src/provider.js";

const emptyCityData = (city: string): PreFetchedCityData => ({
  city,
  country: "Unknown",
  timezone: "Unknown",
  currency: "USD",
  lat: null,
  lon: null,
  places: [],
  restaurants: [],
  hotels: [],
  sunrise: "Unknown",
  sunset: "Unknown",
  daylight_hours: "Unknown",
  weather_note: "No verified data",
  weather_highlights: [],
  weather_warnings: [],
  transport_options: [],
  ticket_options: {},
});

describe("normalizeOllamaItinerary", () => {
  it("maps local model budget aliases to the app itinerary shape", () => {
    const itinerary = {
      title: "Da Lat trip",
      overview: "A short trip.",
      total_cost: 1200000,
      currency: "VND",
      num_days: 2,
      num_travelers: 2,
      seasonal_notes: {
        travel_month: "November",
        daylight_hours: "12 hours",
        sunrise_time: "05:45",
        sunset_time: "17:30",
        weather_note: "Check the forecast.",
        highlights: [],
        warnings: [],
      },
      transport_summary: [],
      days: [],
      hotels: [],
      restaurants: [],
      suggestions: [],
      budget_breakdown: {
        accommodation_estimate: 400000,
        food_dining_estimate: 300000,
        activities_estimate: 250000,
        transport_estimate: 150000,
        miscellaneous_buffer: 100000,
        total_calculated: 1200000,
      },
    } as unknown as Itinerary;

    expect(normalizeOllamaItinerary(itinerary).budget_breakdown).toEqual({
      accommodation: 400000,
      food: 300000,
      activities: 250000,
      transport: 150000,
      contingency: 100000,
      total: 1200000,
      currency: "VND",
      per_person: 600000,
      per_day: 600000,
    });
  });

  it("normalizes model aliases in stored days and seasonal notes", () => {
    const itinerary = {
      title: "Da Lat trip",
      overview: "A short trip.",
      total_cost: 1200000,
      currency: "VND",
      num_days: 1,
      num_travelers: 1,
      seasonal_notes: {
        weather_advice: "Pack a light jacket.",
      },
      days: [
        {
          day_number: 1,
          theme: "Highland morning",
          schedule: [
            {
              time_slot: "08:00",
              activity: "Visit the flower garden",
              cost_estimate_usd: 50000,
              golden_moment: { best_time: "sunset" },
              ticket_activities: [
                null,
                {},
                { platform: "Official", url: "https://example.com" },
              ],
            },
          ],
        },
      ],
      budget_breakdown: {},
    } as unknown as Itinerary;

    const normalized = normalizeOllamaItinerary(itinerary);

    expect(normalized.days[0]).toMatchObject({
      day_number: 1,
      title: "Highland morning",
      activities: [
        {
          time: "08:00",
          name: "Visit the flower garden",
          cost: 50000,
          currency: "VND",
          ticket_activities: [
            { platform: "Official", url: "https://example.com" },
          ],
        },
      ],
      daily_cost_estimate: 50000,
    });
    expect(normalized.days[0]?.activities[0]?.golden_moment).toBeUndefined();
    expect(normalized.seasonal_notes).toMatchObject({
      weather_note: "Pack a light jacket.",
      highlights: [],
      warnings: [],
    });
    expect(
      normalizeOllamaItinerary({
        ...itinerary,
        num_days: 2,
        days: [{ day_number: 1, schedule: [] }],
      } as unknown as Itinerary).days[0]?.daily_cost_estimate,
    ).toBe(600000);
  });

  it("builds the overview locally with the exact date-range duration", async () => {
    const provider = new OllamaProvider({
      baseURL: "http://127.0.0.1:11434/v1",
      overviewModel: "gemma4:latest",
      detailModel: "qwen3.5:9b",
    });

    await expect(
      provider.generateOverview(
        {
          cities: ["paris"],
          start_date: "2026-10-10",
          end_date: "2026-10-16",
          currency: "USD",
          trip_style: "mid_range",
          locale: "en",
          num_travelers: 2,
        },
        [emptyCityData("Paris")],
      ),
    ).resolves.toMatchObject({
      total_days: 7,
      cities: ["Paris"],
      day_plan: [
        "Day 1: Paris",
        "Day 2: Paris",
        "Day 3: Paris",
        "Day 4: Paris",
        "Day 5: Paris",
        "Day 6: Paris",
        "Day 7: Paris",
      ],
    });
  });

  it("disables Qwen reasoning through Ollama's native API for itinerary generation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify({
              title: "Tokyo day",
              days: [
                {
                  day_number: 1,
                  activities: [{ name: "Visit Senso-ji" }],
                },
              ],
            }),
          },
          done_reason: "stop",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      const provider = new OllamaProvider({
        baseURL: "http://127.0.0.1:11434/v1",
        overviewModel: "gemma4:latest",
        detailModel: "qwen3.5:9b",
      });
      const overview = {
        title: "Tokyo day",
        overview: "One day in Tokyo.",
        cities: ["Tokyo"],
        total_days: 1,
        estimated_budget: { min: 100, max: 100, currency: "USD" },
        day_plan: ["Day 1: Tokyo"],
      };

      const result = await provider.generateDetail(
        {
          cities: ["tokyo"],
          num_days: 1,
          currency: "USD",
          trip_style: "mid_range",
          locale: "en",
          num_travelers: 2,
        },
        overview,
        [emptyCityData("Tokyo")],
      );

      expect(result.days[0]?.activities[0]?.name).toBe("Visit Senso-ji");
      expect(fetchMock).toHaveBeenCalledWith(
        "http://127.0.0.1:11434/api/chat",
        expect.objectContaining({ method: "POST" }),
      );
      const request = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
      expect(request).toMatchObject({
        model: "qwen3.5:9b",
        think: false,
        format: "json",
        stream: false,
        options: { num_predict: 8192 },
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("surfaces an explicit error when Ollama stops before producing JSON content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: { content: "", thinking: "reasoning was not disabled" },
            done_reason: "length",
          }),
          { status: 200 },
        ),
      ),
    );

    try {
      const provider = new OllamaProvider({
        baseURL: "http://127.0.0.1:11434/v1",
        overviewModel: "gemma4:latest",
        detailModel: "qwen3.5:9b",
      });
      await expect(
        provider.generateDetail(
          {
            cities: ["tokyo"],
            num_days: 1,
            currency: "USD",
            trip_style: "mid_range",
            locale: "en",
            num_travelers: 2,
          },
          {
            title: "Tokyo day",
            overview: "One day in Tokyo.",
            cities: ["Tokyo"],
            total_days: 1,
            estimated_budget: { min: 100, max: 100, currency: "USD" },
            day_plan: ["Day 1: Tokyo"],
          },
          [emptyCityData("Tokyo")],
        ),
      ).rejects.toThrow(
        "Ollama model qwen3.5:9b returned no response content (done_reason: length)",
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("includes budget meaning, style guidance, and a bounded complete itinerary schema", () => {
    const input = {
      cities: ["paris"],
      prompt_text:
        "Plan a trip to Paris, for 7 days, with budget 3500 USD, style mid_range, 2 travelers",
      num_days: 7,
      budget: 3500,
      currency: "USD",
      trip_style: "mid_range",
      locale: "en",
      num_travelers: 2,
    };
    const overview = {
      title: "Paris · 7-day trip",
      overview: "A seven-day trip.",
      cities: ["Paris"],
      total_days: 7,
      estimated_budget: { min: 3500, max: 3500, currency: "USD" },
      day_plan: Array.from(
        { length: 7 },
        (_, index) => `Day ${index + 1}: Paris`,
      ),
    };
    const prompt = buildDetailPrompt(input, overview, [emptyCityData("Paris")]);

    expect(prompt).toContain("3500 USD total for the entire group of 2");
    expect(prompt).toContain('Preserve style "mid_range"');
    expect(prompt).toContain("6-8 distinct non-meal activities");
    expect(prompt).toContain("Meals do not count toward this minimum");
    expect(prompt).toContain(
      "Every activity name must identify a specific real venue or named area",
    );
    expect(prompt).toContain("3 concise but informative sentences");
    expect(prompt).toContain("45-65 words total");
    expect(prompt).toContain('"daily_cost_estimate":number');
    expect(prompt).toContain('"budget_breakdown"');
  });
});

describe("Ollama response failures", () => {
  it.each([
    [404, '{"error":"model not found"}', "HTTP 404"],
    [500, "backend failed", "HTTP 500"],
    [
      200,
      JSON.stringify({ message: { content: '{"cities":' } }),
      "malformed JSON",
    ],
    [200, JSON.stringify({ message: { content: "[]" } }), "not an object"],
    [200, JSON.stringify({ message: { content: "null" } }), "not an object"],
  ])(
    "rejects status %s with invalid content %s",
    async (status, body, error) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(body, { status })),
      );
      try {
        const provider = new OllamaProvider({
          baseURL: "http://localhost:11434/v1/",
          overviewModel: "qwen3.5:9b",
          detailModel: "qwen3.5:9b",
        });
        await expect(
          provider.parseNaturalInput("Tokyo for 2 days", "en"),
        ).rejects.toThrow(error);
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );

  it("propagates a timeout instead of saving fabricated output", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValue(
          new DOMException("Inference timed out", "TimeoutError"),
        ),
    );
    try {
      const provider = new OllamaProvider({
        baseURL: "http://localhost:11434",
        overviewModel: "qwen3.5:9b",
        detailModel: "qwen3.5:9b",
      });
      await expect(provider.parseNaturalInput("Tokyo", "en")).rejects.toThrow(
        "Inference timed out",
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

it("allows larger output for a detailed seven-day local itinerary", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: { content: JSON.stringify({ days: [] }) } }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  try {
    const provider = new OllamaProvider({ baseURL: "http://localhost:11434/v1", overviewModel: "gemma4:latest", detailModel: "qwen3.5:9b" });
    await provider.generateDetail(
      { cities: ["hanoi"], num_days: 7, currency: "USD", trip_style: "budget", locale: "en", num_travelers: 3 },
      { title: "Hanoi", overview: "Hanoi", cities: ["Hanoi"], total_days: 7, estimated_budget: { min: 500, max: 500, currency: "USD" }, day_plan: ["Hanoi"] },
      [emptyCityData("Hanoi")],
    );
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.options.num_predict).toBe(21596);
    expect(body.messages[1].content).toContain("6-8 distinct non-meal activities");
    expect(body.messages[1].content).toContain("Never return empty objects, placeholder routes");
  } finally { vi.unstubAllGlobals(); }
});
