import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { JourneyService } from "../../../../../../apps/server/src/modules/itinerary/journey/journey.service";
import { LockPlanDto } from "../../../../../../apps/server/src/modules/itinerary/journey/journey.dto";
const require = createRequire(
  new URL("../../../../../../apps/server/package.json", import.meta.url),
);
const { plainToInstance } = require("class-transformer");
const { validate } = require("class-validator");
const changes = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    status: "done",
    expected_status: "todo",
  },
];
const client = { query: vi.fn(), release: vi.fn() };
const sql = { query: vi.fn() };
const pool = { connect: vi.fn() };
function service() {
  const journey = new JourneyService(sql as never, {} as never, pool as never);
  vi.spyOn(journey, "getPlan").mockResolvedValue({ version: 4 } as never);
  return journey;
}
beforeEach(() => {
  sql.query.mockReset().mockResolvedValue({ rows: [{ role: "host" }] });
  client.query
    .mockReset()
    .mockImplementation(async (query: string) => ({
      rows: query.includes("returning") ? [{}] : [],
    }));
  client.release.mockReset();
  pool.connect.mockReset().mockResolvedValue(client);
});
describe("atomic planning checkbox saves", () => {
  it("commits checklist and keep selections together and releases the connection before loading presentation", async () => {
    const journey = service();
    await expect(
      journey.lockPlan("trip", "owner", 3, ["park"], changes),
    ).resolves.toEqual({ version: 4 });
    expect(client.query.mock.calls.map(([query]) => query)).toEqual([
      "begin",
      expect.stringContaining("update trips"),
      expect.stringContaining("update trip_checklist_items"),
      "commit",
    ]);
    expect(client.query.mock.calls[1]![0]).toContain("m.status='active'");
    expect(client.query.mock.calls[1]![1]).toEqual([
      "trip",
      3,
      ["park"],
      "owner",
    ]);
    expect(client.query.mock.calls[2]![1]).toEqual([
      "trip",
      "owner",
      JSON.stringify(changes),
    ]);
    expect(client.release).toHaveBeenCalledOnce();
    expect(journey.getPlan).toHaveBeenCalledAfter(client.release);
  });
  it("rolls back every selection and notification if a checklist item was changed or belongs to another trip", async () => {
    client.query.mockImplementation(async (query: string) => ({
      rows: query.includes("update trips") ? [{}] : [],
    }));
    const journey = service();
    await expect(
      journey.lockPlan("trip", "owner", 3, ["park"], changes),
    ).rejects.toMatchObject({ response: { code: "CHECKLIST_CHANGED" } });
    expect(client.query).toHaveBeenLastCalledWith("rollback");
    expect(client.query).not.toHaveBeenCalledWith("commit");
    expect(journey.getPlan).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledOnce();
  });
  it("rechecks active writable membership and plan version within the transaction", async () => {
    client.query.mockResolvedValue({ rows: [] });
    const journey = service();
    await expect(
      journey.lockPlan("trip", "owner", 3, ["park"], changes),
    ).rejects.toMatchObject({ response: { code: "PLAN_CHANGED" } });
    expect(client.query).toHaveBeenLastCalledWith("rollback");
    expect(
      client.query.mock.calls.some(([query]) =>
        query.includes("update trip_checklist_items"),
      ),
    ).toBe(false);
  });
  it("rejects viewers before opening a write transaction", async () => {
    sql.query.mockResolvedValue({ rows: [{ role: "viewer" }] });
    await expect(
      service().lockPlan("trip", "viewer", 3, ["park"], changes),
    ).rejects.toMatchObject({ response: { code: "READ_ONLY" } });
    expect(pool.connect).not.toHaveBeenCalled();
  });
  it("retains the existing keep-items request contract when no checklist changes are supplied", async () => {
    await service().lockPlan("trip", "owner", 3, ["park"]);
    expect(client.query.mock.calls).toHaveLength(3);
    expect(client.query).toHaveBeenLastCalledWith("commit");
  });
  it("validates nested checklist changes and rejects duplicate IDs", async () => {
    const dto = (checklist_updates?: unknown) =>
      plainToInstance(LockPlanDto, {
        expected_version: 3,
        locked_ids: [],
        ...(checklist_updates === undefined ? {} : { checklist_updates }),
      });
    expect(await validate(dto())).toEqual([]);
    expect(await validate(dto(changes))).toEqual([]);
    expect(
      (await validate(dto([...changes, ...changes]))).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await validate(
          dto([
            { id: "bad", status: "unsupported", expected_status: "unknown" },
          ]),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});
