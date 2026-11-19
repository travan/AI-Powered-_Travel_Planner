import { afterEach, describe, expect, it, vi } from "vitest";
import { GenerationStore } from "../../../../../../apps/server/src/modules/itinerary/generation/generation.store";
import { JourneyService } from "../../../../../../apps/server/src/modules/itinerary/journey/journey.service";
import { PlanningGenerationError } from "../../../../../../packages/ai/src/providers/planning-generation-error";
import { supplementWithFallback } from "../../../../../../apps/server/src/modules/itinerary/generation/supplement-fallback";

// A durable ledger and a single global slot across independently constructed workers.
function database() {
  let row:
    | { state: string; response?: unknown; error_code?: string }
    | undefined;
  let occupied = false;
  let failResponseWrite = false;
  const query = vi.fn(async (text: string, params: unknown[] = []) => {
    if (text.startsWith("select state,response"))
      return { rows: row ? [structuredClone(row)] : [] };
    if (text.includes("with free as")) {
      if (occupied) return { rows: [] };
      occupied = true;
      return { rows: [{ id: 1 }] };
    }
    if (text.startsWith("insert into planning_generation_ai")) {
      if (row) return { rows: [] };
      row = { state: "calling" };
      return { rows: [{ generation_id: "g" }] };
    }
    if (text.includes("set token=null")) {
      occupied = false;
      return { rows: [] };
    }
    if (text.includes("set state='received'")) {
      if (failResponseWrite)
        throw Error("DB connection lost after model returned");
      row = { state: "received", response: params[1] };
      return { rows: [] };
    }
    if (text.includes("set state=$2")) {
      row = { state: String(params[1]), error_code: String(params[2]) };
      return { rows: [] };
    }
    throw Error(`Unexpected query: ${text}`);
  });
  return {
    sql: { query },
    get row() {
      return row;
    },
    get occupied() {
      return occupied;
    },
    failWrite() {
      failResponseWrite = true;
    },
  };
}
afterEach(() => vi.useRealTimers());
describe("generation dispatch durability", () => {
  it("replays the stored fallback response without dispatching either provider twice", async () => {
    const db = database();
    const store = new GenerationStore({} as never, db.sql);
    const primary = { supplementRaw: vi.fn(async () => { throw new PlanningGenerationError("AI_QUOTA_EXHAUSTED", undefined, undefined, "cloudflare"); }), getUsage: () => [] };
    const secondary = { supplementRaw: vi.fn(async () => ({ response: { ok: true } })), getUsage: () => [] };
    const work = (signal: AbortSignal) => supplementWithFallback({ primary, fallbacks: [{ id: "gemini", create: () => secondary }], signal, prompt: "", locale: "vi", schema: {}, onUsage: async () => {} });
    expect(await store.once("g", work)).toEqual({ response: { ok: true } });
    expect(await store.once("g", work)).toEqual({ response: { ok: true } });
    expect(primary.supplementRaw).toHaveBeenCalledOnce();
    expect(secondary.supplementRaw).toHaveBeenCalledOnce();
  });
  it("never starts a fallback after a late primary quota rejection", async () => {
    vi.useFakeTimers();
    const db = database();
    const store = new GenerationStore({} as never, db.sql);
    let rejectPrimary!: (error: Error) => void;
    const fallback = vi.fn();
    const primary = { supplementRaw: () => new Promise<never>((_, reject) => { rejectPrimary = reject; }), getUsage: () => [] };
    const result = expect(store.once("g", (signal) => supplementWithFallback({ primary, fallbacks: [{ id: "g1", create: fallback }], signal, prompt: "", locale: "vi", schema: {}, onUsage: async () => {} }))).rejects.toMatchObject({ response: { code: "AI_RESULT_UNKNOWN" } });
    await vi.advanceTimersByTimeAsync(120001);
    await result;
    rejectPrimary(new PlanningGenerationError("AI_QUOTA_EXHAUSTED", undefined, undefined, "cloudflare"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fallback).not.toHaveBeenCalled();
    expect(db.row?.state).toBe("unknown");
  });
  it("does not reserve a ticket or inference slot when provider preflight fails", async () => {
    const db = database();
    const store = new GenerationStore({} as never, db.sql);
    const work = vi.fn();
    await expect(
      store.once("g", work, () => {
        throw new PlanningGenerationError("AI_PROVIDER_CONFIGURATION_INVALID");
      }),
    ).rejects.toMatchObject({ code: "AI_PROVIDER_CONFIGURATION_INVALID" });
    expect(db.row).toBeUndefined();
    expect(db.occupied).toBe(false);
    expect(work).not.toHaveBeenCalled();
  });
  it("retains an explicit quota rejection without dispatching again", async () => {
    const db = database();
    const store = new GenerationStore({} as never, db.sql);
    const work = vi.fn(async () => {
      throw new PlanningGenerationError("AI_QUOTA_EXHAUSTED");
    });
    await expect(store.once("g", work)).rejects.toMatchObject({
      code: "AI_QUOTA_EXHAUSTED",
    });
    await expect(store.once("g", work)).rejects.toMatchObject({
      code: "AI_QUOTA_EXHAUSTED",
    });
    expect(work).toHaveBeenCalledOnce();
    expect(db.row).toEqual({
      state: "failed",
      error_code: "AI_QUOTA_EXHAUSTED",
    });
  });
  it("keeps legacy retries on their original pipeline rather than selecting a new rollout cohort", async () => {
    const client = {
      query: vi.fn(async (sql: string) => ({
        rows: sql.includes("insert into itinerary_jobs")
          ? [{ id: "legacy-retry" }]
          : [],
      })),
      release: vi.fn(),
    };
    const service = new JourneyService(
      {
        query: vi.fn().mockResolvedValue({
          rows: [
            {
              payload: { dto: {} },
              pipeline_version: 1,
              error_code: "PLANNING_FAILED",
            },
          ],
        }),
      },
      {} as never,
      { connect: async () => client } as never,
    );
    const enqueue = vi.spyOn(service, "enqueue");
    await expect(service.retryJob("u", "legacy-job")).resolves.toMatchObject({
      job_id: "legacy-retry",
    });
    expect(enqueue).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledOnce();
  });
  it("persists an unparsed provider response and replays it on another worker", async () => {
    const db = database();
    const first = new GenerationStore({} as never, db.sql);
    const second = new GenerationStore({} as never, db.sql);
    const work = vi.fn(async () => ({
      response: "invalid JSON",
      usage: { total_tokens: 17 },
    }));
    const raw = await first.once("g", work);
    expect(db.row).toMatchObject({ state: "received", response: raw });
    expect(
      await second.once("g", work, () => {
        throw Error("Provider no longer configured");
      }),
    ).toEqual(raw);
    expect(work).toHaveBeenCalledOnce();
  });
  it("consumes the dispatch on timeout and holds capacity until the in-flight call settles", async () => {
    vi.useFakeTimers();
    const db = database();
    const store = new GenerationStore({} as never, db.sql);
    let finish!: (value: unknown) => void;
    const work = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const result = expect(store.once("g", work)).rejects.toMatchObject({
      response: { code: "AI_RESULT_UNKNOWN" },
    });
    await vi.advanceTimersByTimeAsync(120001);
    await result;
    expect(db.row?.state).toBe("unknown");
    expect(db.occupied).toBe(true);
    await expect(
      new GenerationStore({} as never, db.sql).once("g", work),
    ).rejects.toMatchObject({ response: { code: "AI_RESULT_UNKNOWN" } });
    finish({ response: "late response" });
    await vi.advanceTimersByTimeAsync(0);
    expect(db.occupied).toBe(false);
    expect(db.row?.state).toBe("unknown");
    expect(work).toHaveBeenCalledOnce();
  });
  it("never re-dispatches when saving the provider response fails", async () => {
    const db = database();
    db.failWrite();
    const store = new GenerationStore({} as never, db.sql);
    const work = vi.fn(async () => ({ response: { items: [] } }));
    await expect(store.once("g", work)).rejects.toMatchObject({
      response: { code: "AI_RESULT_UNKNOWN" },
    });
    await expect(store.once("g", work)).rejects.toMatchObject({
      response: { code: "AI_RESULT_UNKNOWN" },
    });
    expect(work).toHaveBeenCalledOnce();
  });
});
