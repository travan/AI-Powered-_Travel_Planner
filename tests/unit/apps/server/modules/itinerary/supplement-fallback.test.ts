import { describe, expect, it, vi } from "vitest";
import { PlanningGenerationError, type SupplementProvider } from "../../../../../../packages/ai/src";
import { fallbackSources, supplementWithFallback } from "../../../../../../apps/server/src/modules/itinerary/generation/supplement-fallback";

const quota = (provider: string) => new PlanningGenerationError("AI_QUOTA_EXHAUSTED", undefined, undefined, provider);
function provider(name: string, outcome: unknown): SupplementProvider {
  return {
    supplementRaw: vi.fn(async () => { if (outcome instanceof Error) throw outcome; return { response: outcome as object }; }),
    getUsage: () => [{ operation: "detail", provider: name, model: "test", input_tokens: null, output_tokens: null, total_tokens: null, outcome: outcome instanceof Error ? "quota_rejected" : "received" }],
  };
}
describe("configurable AI fallback", () => {
  it("validates bounded safe references and supports multiple accounts", () => {
    const entries = [{ id: "gemini-1", provider: "gemini", model: "gemini-2.5-flash", key_env: "GEMINI_API_KEY" }, { id: "gemini-2", provider: "gemini", model: "gemini-2.5-flash", key_env: "GEMINI_API_KEY_2" }];
    expect(fallbackSources(JSON.stringify(entries))).toEqual(entries);
    expect(() => fallbackSources(JSON.stringify([{ ...entries[0], key_env: "JWT_SECRET" }]))).toThrow();
    expect(() => fallbackSources(JSON.stringify([entries[0], entries[0]]))).toThrow();
  });
  it("advances only after explicit quota failures, preserving all usage", async () => {
    const first = provider("cloudflare", quota("cloudflare"));
    const second = provider("gemini", quota("gemini"));
    const third = provider("gemini", { ok: true });
    const onUsage = vi.fn(async () => {});
    const result = await supplementWithFallback({ primary: first, fallbacks: [{ id: "g1", create: () => second }, { id: "g2", create: () => third }], signal: new AbortController().signal, prompt: "", locale: "vi", schema: {}, onUsage });
    expect(result.response).toEqual({ ok: true });
    expect(onUsage.mock.lastCall?.[0].map((u) => u.source_id)).toEqual(["primary", "g1", "g2"]);
  });
  it("does not use another provider on an unknown result or after timeout", async () => {
    const create = vi.fn(() => provider("gemini", {}));
    const controller = new AbortController();
    for (const [error, signal] of [[new PlanningGenerationError("AI_RESULT_UNKNOWN"), controller.signal], [quota("cloudflare"), AbortSignal.abort()]] as const) {
      await expect(supplementWithFallback({ primary: provider("cloudflare", error), fallbacks: [{ id: "g", create }], signal, prompt: "", locale: "vi", schema: {}, onUsage: async () => {} })).rejects.toBe(error);
    }
    expect(create).not.toHaveBeenCalled();
  });
});
