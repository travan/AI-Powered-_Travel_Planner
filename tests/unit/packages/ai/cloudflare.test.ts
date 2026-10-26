import { describe, expect, it, vi } from "vitest";
import { CloudflareAIProvider } from "../../../../packages/ai/src/providers/cloudflare";
import { createAIProvider } from "../../../../packages/ai/src/index";

describe("Cloudflare AI provider", () => {
  it("requires the binding instead of returning mock output", () => {
    expect(() => createAIProvider("cloudflare")).toThrow("binding is required");
  });
  it("parses real binding output and requests JSON mode", async () => {
    const run = vi.fn().mockResolvedValue({ response: '{"cities":["hanoi"]}' });
    const provider = new CloudflareAIProvider({ run });
    expect(await provider.parseNaturalInput("Hanoi for 2 days", "en")).toEqual({ cities: ["hanoi"] });
    expect(run.mock.calls[0][1]).toMatchObject({ response_format: { type: "json_object" }, temperature: 0.2 });
  });
  it("propagates quota errors and rejects invalid model output", async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error("quota exceeded")).mockResolvedValueOnce({ response: "[]" });
    const provider = new CloudflareAIProvider({ run });
    await expect(provider.parseNaturalInput("Hanoi", "en")).rejects.toThrow("quota exceeded");
    await expect(provider.parseNaturalInput("Hanoi", "en")).rejects.toThrow("invalid JSON");
  });
});
