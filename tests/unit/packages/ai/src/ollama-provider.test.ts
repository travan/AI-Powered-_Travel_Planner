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
          prompt_eval_count: 260,
          eval_count: 140,
          total_duration: 1_750_000_000,
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
      expect(provider.getUsage()).toEqual([
        {
          operation: "detail",
          provider: "ollama",
          model: "qwen3.5:9b",
          input_tokens: 260,
          output_tokens: 140,
          total_tokens: 400,
          duration_ms: 1750,
        },
      ]);
      expect(fetchMock).toHaveBeenCalledWith(
        "http://127.0.0.1:11434/api/chat",
        expect.objectContaining({ method: "POST" }),
      );
      const request = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
      expect(request).toMatchObject({
        model: "qwen3.5:9b",
        think: false,
        format: "json",
        stream: true,
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
    expect(prompt).toContain("4-6 distinct non-meal activities");
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

it("builds a seven-day itinerary through an outline and complete daily contracts", async () => {
  const outlines = Array.from({ length: 7 }, (_, i) => ({
    day_number: i + 1,
    city: "Hanoi",
    title: `Area ${i + 1}`,
    places: Array.from({ length: 5 }, (_, j) => `Place ${i + 1}-${j + 1}`),
    all_day: false,
  }));
  const fetchMock = vi.fn().mockImplementation(async (_url, init) => {
    const body = JSON.parse(init.body),
      prompt = body.messages[1].content;
    let result;
    if (prompt.startsWith("Plan a geographically clustered"))
      result = {
        title: "Hanoi",
        overview: "A varied week.",
        days: outlines,
        hotels: [],
        transport_summary: [],
      };
    else {
      const slots = JSON.parse(prompt.match(/REQUIRED SLOTS: ([^\n]+)/)[1]);
      const outline = JSON.parse(
        prompt.match(/TODAY'S ROUTE[^\n]*: ([^\n]+)/)[1],
      );
      let visit = 0;
      result = {
        activities: slots.map((slot) => ({
          slot_id: slot.slot_id,
          name:
            slot.place_name ??
            (slot.kind === "visit" ? outline.places[visit++] : slot.slot_id),
          description:
            "Explore this named stop at a comfortable pace and focus on the interesting local details along the way. This fits the neighborhood route well and offers a useful break. Bring water and keep enough time for the next stop.",
          price: {
            amount: ["return", "check_in", "check_out"].includes(slot.slot_id)
              ? 0
              : 10,
            currency: "USD",
            scope: "person",
            status: "estimated",
            basis: "planning_estimate",
            assumption:
              "Rounded allowance per person; not a live service quote.",
          },
        })),
      };
    }
    return new Response(
      JSON.stringify({
        message: { content: JSON.stringify(result) },
        done_reason: "stop",
      }),
      { status: 200 },
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  try {
    const provider = new OllamaProvider({
      baseURL: "http://localhost:11434/v1",
      overviewModel: "gemma4:latest",
      detailModel: "qwen3.5:9b",
    });
    const result = await provider.generateDetail(
      {
        cities: ["hanoi"],
        num_days: 7,
        currency: "USD",
        trip_style: "budget",
        locale: "en",
        num_travelers: 3,
      },
      {
        title: "Hanoi",
        overview: "",
        cities: ["Hanoi"],
        total_days: 7,
        estimated_budget: { min: 0, max: 0, currency: "USD" },
        day_plan: [],
      },
      [emptyCityData("Hanoi")],
    );
    expect(fetchMock).toHaveBeenCalledTimes(8);
    expect(result.days).toHaveLength(7);
    expect(
      result.days
        .flatMap((day) => day.activities)
        .filter((a) => a.kind === "meal"),
    ).toHaveLength(21);
    expect(
      new Set(
        result.days
          .flatMap((day) => day.activities)
          .filter((a) => a.kind === "visit")
          .map((a) => a.name),
      ).size,
    ).toBe(28); // Four visits per day for the requested default balanced pace.
    expect(result.days[0]?.activities[0]?.price).toMatchObject({
      basis: "planning_estimate",
      amount: 10,
      scope: "person",
    });
  } finally {
    vi.unstubAllGlobals();
  }
});

describe("Ollama streamed responses", () => {
  const run = () =>
    new OllamaProvider({
      baseURL: "http://127.0.0.1:11434/v1",
      overviewModel: "gemma4:latest",
      detailModel: "qwen3.5:9b",
    }).generateDetail(
      {
        cities: ["osaka"],
        num_days: 1,
        currency: "USD",
        trip_style: "mid_range",
        locale: "vi",
        num_travelers: 2,
      },
      {
        title: "Osaka",
        overview: "",
        cities: ["Osaka"],
        total_days: 1,
        estimated_budget: { min: 0, max: 0, currency: "USD" },
        day_plan: ["Day 1: Osaka"],
      },
      [emptyCityData("Osaka")],
    );
  it("joins streamed deltas without stripping whitespace or corrupting split UTF-8", async () => {
    const lines = [
      { message: { content: '{"title":"Ăn' }, done: false },
      { message: { content: " " }, done: false },
      { message: { content: 'sáng", "days":[]}' }, done: false },
      {
        message: { content: "" },
        done: true,
        done_reason: "stop",
        prompt_eval_count: 12,
        eval_count: 20,
      },
    ]
      .map((value) => JSON.stringify(value))
      .join("\n");
    const bytes = new TextEncoder().encode(lines);
    const stream = new ReadableStream({
      start(controller) {
        for (let index = 0; index < bytes.length; index += 7)
          controller.enqueue(bytes.slice(index, index + 7));
        controller.close();
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(stream, {
          headers: { "content-type": "application/x-ndjson" },
        }),
      ),
    );
    try {
      expect((await run()).title).toBe("Ăn sáng");
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("rejects interrupted streams even if an earlier chunk contains valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: { content: '{"days":[]}' },
            done: false,
          }) + "\n",
          { headers: { "content-type": "application/x-ndjson" } },
        ),
      ),
    );
    try {
      await expect(run()).rejects.toThrow("stream ended before completion");
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("surfaces an Ollama error frame instead of presenting a partial itinerary", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ error: "model ran out of memory" }) + "\n",
            { headers: { "content-type": "application/x-ndjson" } },
          ),
        ),
    );
    try {
      await expect(run()).rejects.toThrow("model ran out of memory");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
