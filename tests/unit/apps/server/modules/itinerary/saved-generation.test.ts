import { describe, expect, it, vi } from "vitest";
import {
  recoverableSavedGeneration,
  storedSupplementResponse,
} from "../../../../../../apps/server/src/modules/itinerary/generation/saved-generation";
import { GenerationStore } from "../../../../../../apps/server/src/modules/itinerary/generation/generation.store";

const snapshot = () => ({
  version: 2,
  input: { locale: "vi" },
  destinations: [],
  schedule: [],
  days: [{ day_number: 1 }],
  needs: [{ key: "meal/1" }],
  items: {},
});
const response = { response: { items: [{ key: "meal/1", name: "Lunch" }] } };

describe("saved itinerary responses", () => {
  it("decodes stored JSON including provider code fences", () => {
    expect(
      storedSupplementResponse({ response: '```json\n{"items":[]}\n```' }),
    ).toEqual({ items: [] });
    expect(storedSupplementResponse(response)).toEqual(response.response);
    expect(storedSupplementResponse(response.response)).toEqual(
      response.response,
    );
    expect(() => storedSupplementResponse({ response: "invalid" })).toThrow();
  });
  it("requires a usable response or retained data rather than declaring empty data successful", () => {
    expect(recoverableSavedGeneration(snapshot(), response)).toBe(true);
    expect(
      recoverableSavedGeneration(
        { ...snapshot(), items: { saved: { name: "Known venue" } } },
        { response: "bad" },
      ),
    ).toBe(true);
    for (const checkpoint of [
      null,
      {},
      { ...snapshot(), version: 1 },
      { ...snapshot(), needs: null },
      { ...snapshot(), display_recovery_version: 1 },
    ])
      expect(recoverableSavedGeneration(checkpoint, response)).toBe(false);
    for (const raw of [
      null,
      { response: "bad" },
      { response: { items: [{ key: "unrelated", name: "Venue" }] } },
      { response: { items: [null, { key: "meal/1", name: " " }] } },
    ])
      expect(recoverableSavedGeneration(snapshot(), raw)).toBe(false);
  });
  it("requeues an expired received response once, clears stale assembled days, and never edits the AI ledger", async () => {
    const query = vi.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes("returning j.id::text")) return { rows: [] };
      if (sql.startsWith("select count")) return { rows: [{ count: 0 }] };
      if (sql.includes("select j.id::text"))
        return {
          rows: [
            {
              id: "job",
              generation_id: "gen",
              checkpoint: snapshot(),
              response,
            },
          ],
        };
      return { rows: [] };
    });
    const release = vi.fn();
    const store = new GenerationStore(
      { connect: async () => ({ query, release }) } as never,
      {} as never,
    );
    expect(await store.recoverReceived("owner", ["job"])).toEqual(["job"]);
    const checkpoint = query.mock.calls.find(([sql]) =>
      sql.startsWith("update planning_generations"),
    );
    expect(checkpoint?.[1]?.[1]).toMatchObject({
      days: [],
      display_recovery_version: 1,
      warnings: [{ code: "SAVED_AI_RESPONSE_RECOVERED", severity: "warning" }],
    });
    expect(
      query.mock.calls.some(([sql]) =>
        /(?:insert into|update|delete from) planning_generation_ai/.test(sql),
      ),
    ).toBe(false);
    expect(query.mock.calls.at(-1)?.[0]).toBe("commit");
    expect(release).toHaveBeenCalledOnce();
  });
  it("respects admission capacity and rolls back failures", async () => {
    for (const fail of [false, true]) {
      const query = vi.fn(async (sql: string) => {
        if (sql.startsWith("select count")) {
          if (fail) throw new Error("database unavailable");
          return { rows: [{ count: 5 }] };
        }
        return { rows: [] };
      });
      const release = vi.fn();
      const store = new GenerationStore(
        { connect: async () => ({ query, release }) } as never,
        {} as never,
      );
      if (fail)
        await expect(store.recoverReceived("owner")).rejects.toThrow(
          "database unavailable",
        );
      else expect(await store.recoverReceived("owner")).toEqual([]);
      expect(query.mock.calls.at(-1)?.[0]).toBe(fail ? "rollback" : "commit");
      expect(release).toHaveBeenCalledOnce();
    }
  });
});
