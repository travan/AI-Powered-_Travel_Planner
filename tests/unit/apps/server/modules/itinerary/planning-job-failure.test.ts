import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import { CitiesService } from "../../../../../../apps/server/src/modules/cities/application/cities.service";
import { JourneyService } from "../../../../../../apps/server/src/modules/itinerary/journey/journey.service";
import { PlanningGenerationError } from "../../../../../../packages/ai/src/providers/planning-generation-error";

const { BadRequestException, HttpException, ServiceUnavailableException } =
  createRequire(
    new URL("../../../../../../apps/server/package.json", import.meta.url),
  )("@nestjs/common");

function worker(generate: ReturnType<typeof vi.fn>, attempts = 1) {
  const job = {
    id: "job-id",
    user_id: "user-id",
    kind: "generate",
    payload: { dto: {} },
    claim_token: "claim",
    attempts,
  };
  const query = vi
    .fn()
    .mockResolvedValueOnce({ rows: [job] })
    .mockResolvedValue({ rows: [] });
  const service = new JourneyService(
    { query },
    { generate } as never,
    {} as never,
  );
  return { service, query };
}

function jobUpdate(query: ReturnType<typeof vi.fn>) {
  return query.mock.calls.findLast(
    ([sql]) =>
      typeof sql === "string" &&
      sql.includes("update itinerary_jobs set status="),
  );
}

describe("generation job failures", () => {
  it("keeps resolver failures explicit during the one-call supplement stage", async () => {
    const { service, query } = worker(
      vi.fn(async ({ onStage }) => {
        await onStage("supplement");
        throw new ServiceUnavailableException({
          code: "LOCATION_LOOKUP_UNAVAILABLE",
        });
      }),
    );
    await service.processNextJob("job-id");
    expect(jobUpdate(query)?.[1]?.[4]).toBe("LOCATION_LOOKUP_UNAVAILABLE");
    expect(jobUpdate(query)?.[1]?.[2]).toBe(false);
  });
  it("logs safe day validation diagnostics without exposing raw model output", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new PlanningGenerationError(
      "AI_DAY_INVALID",
      "private model content",
      {
        day: 4,
        issues: [{ code: "DAY_PRICE_INVALID", slot: "lunch" }],
      },
    );
    try {
      const { service, query } = worker(vi.fn().mockRejectedValue(failure));
      await service.processNextJob("job-id");
      const records = log.mock.calls.map(([line]) => JSON.parse(line));
      expect(records).toContainEqual(
        expect.objectContaining({
          event: "journey.ai_validation_failed",
          jobId: "job-id",
          day: 4,
          code: "DAY_PRICE_INVALID",
          slot: "lunch",
        }),
      );
      expect(JSON.stringify(records)).not.toContain("private model content");
      expect(jobUpdate(query)?.[1]).toEqual([
        "job-id",
        "claim",
        true,
        null,
        "AI_DAY_INVALID",
        {},
        15,
      ]);
    } finally {
      log.mockRestore();
    }
  });

  it.each([
    ["CITY_AMBIGUOUS", "journey.destinations", "catalog"],
    ["MONTH_UNAVAILABLE", "flexible_month", "criteria"],
  ])(
    "finishes %s with a safe field and reason",
    async (reason, field, stage) => {
      const { service, query } = worker(
        vi.fn(async ({ onStage }) => {
          await onStage(stage);
          throw new BadRequestException({
            code: reason,
            candidates: ["private"],
          });
        }),
      );
      await service.processNextJob("job-id");
      expect(jobUpdate(query)?.[1]).toEqual([
        "job-id",
        "claim",
        true,
        null,
        "PLANNING_INVALID",
        { reason, field },
        15,
      ]);

      query.mockResolvedValueOnce({
        rows: [
          {
            id: "job-id",
            kind: "generate",
            status: "failed",
            error_code: "PLANNING_INVALID",
            error_params: { reason, field: "tampered", private: "not public" },
          },
        ],
      });
      await expect(service.getJob("user-id", "job-id")).resolves.toMatchObject({
        error_code: "PLANNING_INVALID",
        error_params: { reason, field },
      });
    },
  );

  it("does not tell users to edit the form for an unclassified 400", async () => {
    const { service, query } = worker(
      vi.fn().mockRejectedValue(new BadRequestException("private")),
    );
    await service.processNextJob("job-id");
    expect(jobUpdate(query)?.[1]).toEqual([
      "job-id",
      "claim",
      true,
      null,
      "PLANNING_FAILED",
      {},
      15,
    ]);
  });

  it.each([1, 3])(
    "allows the SQL attempt limit to govern lookup failures (attempt %s)",
    async (attempt) => {
      const unavailable = Object.assign(new ServiceUnavailableException(), {
        headers: new Headers({ "Retry-After": "45" }),
      });
      const { service, query } = worker(
        vi.fn().mockRejectedValue(unavailable),
        attempt,
      );
      await service.processNextJob("job-id");
      expect(jobUpdate(query)?.[0]).toContain("attempts>=3 or $3");
      expect(jobUpdate(query)?.[1]).toEqual([
        "job-id",
        "claim",
        false,
        null,
        "LOCATION_LOOKUP_UNAVAILABLE",
        {},
        45,
      ]);
    },
  );

  it.each([
    ["AI_UNAVAILABLE", false],
    ["NO_ITINERARY", true],
  ])("preserves the %s result", async (code, terminal) => {
    const { service, query } = worker(
      vi.fn().mockResolvedValue({ status: "unsupported", code }),
    );
    await service.processNextJob("job-id");
    expect(jobUpdate(query)?.[1]).toEqual([
      "job-id",
      "claim",
      terminal,
      null,
      code,
      {},
      15,
    ]);
  });

  it("stores the itinerary ID on success", async () => {
    const { service, query } = worker(
      vi.fn().mockResolvedValue({
        status: "cached",
        itinerary_id: "itinerary-id",
      }),
    );
    await service.processNextJob("job-id");
    expect(jobUpdate(query)?.[0]).toContain("status='complete'");
    expect(jobUpdate(query)?.[1]?.slice(0, 3)).toEqual([
      "job-id",
      "claim",
      "itinerary-id",
    ]);
  });
});

describe("destination lookup", () => {
  it.each([false, true])(
    "preserves a lookup 503 (initial 429: %s)",
    async (rateLimited) => {
      vi.useFakeTimers();
      try {
        const unavailable = new ServiceUnavailableException();
        const cityCandidates = vi.fn().mockRejectedValue(unavailable);
        if (rateLimited)
          cityCandidates.mockRejectedValueOnce(new HttpException("busy", 429));
        const cities = new CitiesService(
          {
            remember: vi
              .fn()
              .mockRejectedValue(
                new BadRequestException({ code: "CITY_UNRESOLVED" }),
              ),
          } as never,
          { cityCandidates } as never,
        );
        const check = expect(cities.remember("Test city")).rejects.toBe(
          unavailable,
        );
        await vi.advanceTimersByTimeAsync(1100);
        await check;
        expect(cityCandidates).toHaveBeenCalledTimes(rateLimited ? 2 : 1);
      } finally {
        vi.useRealTimers();
      }
    },
  );
});
