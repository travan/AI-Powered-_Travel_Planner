import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSupplementProvider,
  supplementConfig,
} from "../../../../packages/ai/src/supplement";
import { destinationContext } from "../../../../packages/ai/src/destination-context";
import { malaysiaSingaporeRequest } from "../../fixtures/malaysia-singapore-request";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const schema = {
  type: "object",
  properties: { cities: { type: "array" }, items: { type: "array" } },
  required: ["cities", "items"],
};
const content = '{"cities":[],"items":[]}';

describe("single-dispatch supplement adapters", () => {
  it("bounds Gemini schema complexity without mutating the original constraints", async () => {
    const complex = { type: "object", properties: { items: { type: "array", minItems: 80, maxItems: 80, items: { type: "object", properties: { key: { type: "string" }, amount: { type: "number", minimum: 0 } }, anyOf: [{ properties: { key: { enum: ["meal-1", "meal-2"] } } }] } } } };
    const request = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: content }] } }] })));
    const adapter = createSupplementProvider({ config: { provider: "gemini", model: "test" }, apiKey: "test-key", request });
    await adapter.supplementRaw("prompt", "vi", complex);
    const body = JSON.parse((request.mock.calls as unknown as [string, RequestInit][])[0]![1].body as string);
    const itemSchema = body.generationConfig.responseJsonSchema.properties.items;
    expect(itemSchema).not.toHaveProperty("minItems");
    expect(itemSchema).not.toHaveProperty("maxItems");
    expect(itemSchema.items).not.toHaveProperty("anyOf");
    expect(itemSchema.items.properties.amount.minimum).toBe(0);
    expect(complex.properties.items.items.anyOf).toHaveLength(1);
    expect(complex.properties.items.minItems).toBe(80);
  });
  it("does not label every HTTP 404 as a missing model", async () => {
    const request = vi.fn(async () => new Response("<html>Not found</html>", { status: 404 }));
    const adapter = createSupplementProvider({ config: { provider: "gemini", model: "test" }, apiKey: "example-key", request });
    await expect(adapter.supplementRaw("prompt", "vi", schema)).rejects.toMatchObject({ code: "AI_PROVIDER_CONFIGURATION_INVALID" });
    expect(adapter.getUsage()).toMatchObject([{ provider_status: 404, provider_reason: "endpoint_not_found", provider_response_type: "html" }]);
  });
  it("records a safe invalid-key diagnosis without retaining provider response text", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ error: { message: "API key not valid", reason: "API_KEY_INVALID", private: "do-not-record" } }), { status: 400 }));
    const adapter = createSupplementProvider({ config: { provider: "gemini", model: "test" }, apiKey: "example-key", request });
    await expect(adapter.supplementRaw("prompt", "vi", schema)).rejects.toMatchObject({ code: "AI_PROVIDER_CONFIGURATION_INVALID" });
    expect(adapter.getUsage()).toMatchObject([{ provider_status: 400, provider_reason: "invalid_api_key" }]);
    expect(JSON.stringify(adapter.getUsage())).not.toContain("do-not-record");
  });
  it("binds the runtime fetch to the global scope", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const runtimeFetch = vi.fn(function (this: unknown) {
      if (this !== globalThis) throw new TypeError("Illegal invocation");
      return Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: content }] } }] })));
    });
    vi.stubGlobal("fetch", runtimeFetch);
    const adapter = createSupplementProvider({ config: { provider: "gemini", model: "test" } });
    await expect(adapter.supplementRaw("prompt", "vi", schema)).resolves.toEqual({ response: content });
    expect(runtimeFetch).toHaveBeenCalledOnce();
  });
  it("uses the selected account key instead of the provider default", async () => {
    vi.stubEnv("GEMINI_API_KEY", "default-test-key");
    const request = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: content }] } }] })));
    const adapter = createSupplementProvider({ config: { provider: "gemini", model: "test-model" }, apiKey: "second-test-key", request });
    await adapter.supplementRaw("prompt", "vi", schema);
    expect((request.mock.calls[0]![1] as RequestInit).headers).toMatchObject({ "x-goog-api-key": "second-test-key" });
  });
  it.each(["claude", "openai", "gemini"] as const)(
    "%s supplies structured data, preserves raw content and records usage",
    async (provider) => {
      vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic");
      vi.stubEnv("OPENAI_API_KEY", "test-openai");
      vi.stubEnv("GEMINI_API_KEY", "test-gemini");
      const envelope =
        provider === "claude"
          ? {
              content: [
                {
                  type: "tool_use",
                  name: "supply_planning_data",
                  input: JSON.parse(content),
                },
              ],
              usage: { input_tokens: 11, output_tokens: 7 },
            }
          : provider === "openai"
            ? {
                choices: [{ message: { content } }],
                usage: { prompt_tokens: 11, completion_tokens: 7 },
              }
            : {
                candidates: [{ content: { parts: [{ text: content }] } }],
                usageMetadata: {
                  promptTokenCount: 11,
                  candidatesTokenCount: 7,
                },
              };
      const request = vi.fn(async () => new Response(JSON.stringify(envelope)));
      const adapter = createSupplementProvider({
        config: { provider, model: "test-model" },
        request: request as typeof fetch,
      });
      expect(
        await adapter.supplementRaw("Only missing data", "vi", schema),
      ).toEqual({
        response: provider === "claude" ? JSON.parse(content) : content,
      });
      expect(request).toHaveBeenCalledOnce();
      const body = JSON.parse(
        (request.mock.calls as unknown as [string, RequestInit][])[0]![1]
          .body as string,
      );
      expect(JSON.stringify(body)).toContain("cities");
      expect(adapter.getUsage()).toEqual([
        expect.objectContaining({
          provider,
          model: "test-model",
          input_tokens: 11,
          output_tokens: 7,
          total_tokens: 18,
        }),
      ]);
      expect(JSON.stringify(adapter.getUsage())).not.toContain(
        "test-anthropic",
      );
    },
  );

  it("does not parse business JSON before it can be persisted", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const adapter = createSupplementProvider({
      config: { provider: "openai", model: "test" },
      request: vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              choices: [{ message: { content: "invalid json" } }],
            }),
          ),
      ),
    });
    expect(await adapter.supplementRaw("prompt", "vi", schema)).toEqual({
      response: "invalid json",
    });
  });

  it.each([
    [401, "unauthorized", "AI_AUTH_INVALID"],
    [400, "Your credit balance is too low", "AI_QUOTA_EXHAUSTED"],
    [429, "Quota exceeded per minute", "AI_RATE_LIMITED"],
    [429, "rate limit", "AI_RATE_LIMITED"],
    [429, "insufficient_quota", "AI_QUOTA_EXHAUSTED"],
    [500, "upstream", "AI_UNAVAILABLE"],
  ])("does not retry HTTP %s", async (status, message, code) => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const request = vi.fn(
      async () => new Response(String(message), { status: Number(status) }),
    );
    const adapter = createSupplementProvider({
      config: { provider: "claude", model: "test" },
      request,
    });
    await expect(
      adapter.supplementRaw("prompt", "vi", schema),
    ).rejects.toMatchObject({ code });
    expect(request).toHaveBeenCalledOnce();
    expect(adapter.getUsage()).toHaveLength(1);
  });

  it("treats timeout/network failure as unknown without another call", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const request = vi.fn(async () => {
      throw new DOMException("timeout", "TimeoutError");
    });
    const adapter = createSupplementProvider({
      config: { provider: "gemini", model: "test" },
      request,
    });
    await expect(
      adapter.supplementRaw("prompt", "vi", schema),
    ).rejects.toMatchObject({ code: "AI_RESULT_UNKNOWN" });
    expect(request).toHaveBeenCalledOnce();
  });

  it("rejects missing key/model or unsupported provider without silently using Mock", () => {
    expect(() => supplementConfig({ AI_PROVIDER: "claude" })).toThrow();
    expect(() => supplementConfig({ AI_PROVIDER: "ollama" })).toThrow();
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(() =>
      createSupplementProvider({
        config: { provider: "claude", model: "test" },
      }),
    ).toThrow();
  });

  it("continues to support the Workers AI binding", async () => {
    const run = vi.fn(async () => ({ response: JSON.parse(content) }));
    const adapter = createSupplementProvider({
      config: { provider: "cloudflare", model: "test" },
      workersAI: { run },
    });
    expect(await adapter.supplementRaw("prompt", "vi", schema)).toEqual({
      response: JSON.parse(content),
    });
    expect(run).toHaveBeenCalledOnce();
  });

  it("names countries from bare IDs and keeps resolved cities separate", () => {
    const request = malaysiaSingaporeRequest();
    expect(request).not.toHaveProperty("city_names");
    expect(request).not.toHaveProperty("destination_refs");
    expect(
      destinationContext(request, [
        { id: "country-my", city: "Kuala Lumpur", country: "MY" },
      ]),
    ).toEqual([
      expect.objectContaining({
        id: "country-my",
        kind: "country",
        country_code: "MY",
        country_name: "Malaysia",
        city: "Kuala Lumpur",
      }),
      expect.objectContaining({
        id: "country-sg",
        kind: "country",
        country_code: "SG",
        country_name: "Singapore",
      }),
    ]);
  });
});
