import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyCanaryResult,
  runProductionCanary,
  validateCanaryPlan,
} from "../../scripts/check-production-generation.mjs";
import { canarySession } from "../../scripts/production-canary-auth.mjs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

afterEach(() => vi.unstubAllEnvs());
describe("production generation gate", () => {
  it.each([undefined, { amount: 1, currency: "VND" }, { amount: 100, currency: "USD" }])("rejects an over-budget success without an accurate warning (%j)", (params) => {
    expect(() => validateCanaryPlan({
      days: [], currency: "VND", total_cost: 200,
      issues: params ? [{ code: "OVER_BUDGET", severity: "warning", params }] : [],
    }, { num_days: 0, currency: "VND", budget: 100 })).toThrow("Over-budget plan is missing an accurate warning");
  });

  it.each([false, true])("runs exactly six fresh jobs and accepts complete results with accurate budget warnings (overBudget=%s)", async (overBudget) => {
    vi.stubEnv("PLANNING_CANARY_EMAIL", "ci@example.test");
    vi.stubEnv("PLANNING_CANARY_PASSWORD", "test-password");
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "planning-canary-test-"),
    );
    const jobs = new Map();
    const submitted = [];
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const request = vi.fn(async (url, init = {}) => {
      const pathname = new URL(url).pathname;
      let result;
      if (pathname === "/health")
        result = {
          deploy_commit: "candidate",
          planning_pipeline: { v2_percent: 0, queue_bound: true },
        };
      else if (pathname === "/api/auth/session")
        result = {
          user: { id: "ci-user" },
          session: { access_token: "never-report-this-token" },
        };
      else if (pathname === "/api/itinerary/generate") {
        const pipeline = Number(init.headers["X-Planning-Pipeline"].slice(1));
        const input = JSON.parse(init.body);
        expect(input.force_refresh).toBe(true);
        const id = `job-${submitted.length}`;
        jobs.set(id, { pipeline, input });
        submitted.push({ pipeline, key: init.headers["Idempotency-Key"] });
        result = { job_id: id };
      } else if (pathname.startsWith("/api/itinerary/jobs/")) {
        const id = pathname.split("/").at(-1);
        const { pipeline } = jobs.get(id);
        result = {
          id,
          status: pipeline === 2 ? "complete" : "failed",
          error_code: pipeline === 1 ? "AI_DAY_INVALID" : null,
          itinerary_id: id,
          pipeline_version: pipeline,
          usage_recorded: true,
          provider: "cloudflare",
          model: "test",
          ai_usage: [
            {
              provider: "cloudflare",
              model: "test",
              input_tokens: 10,
              output_tokens: 20,
            },
          ],
        };
      } else {
        const { input } = jobs.get(pathname.split("/").at(-1));
        const catalog = {
          kl: { country: "MY" },
          sg: { country: "SG" },
          dn: { country: "VN" },
        };
        const days = Array.from({ length: input.num_days }, (_, index) => {
          const stop =
            input.cities[
              Math.floor((index * input.cities.length) / input.num_days)
            ];
          const slug =
            stop === "country-my" ? "kl" : stop === "country-sg" ? "sg" : "dn";
          return {
            day_number: index + 1,
            date: `2027-01-${String(index + 1).padStart(2, "0")}`,
            destination_slug: stop,
            city_slug: slug,
            city: slug,
            activities: [
              {
                kind: "meal",
                meal_slot: "breakfast",
                name: "Breakfast",
                description: "A proposed meal",
                time: "08:00",
                duration_minutes: 30,
                price: { amount: 10000 },
              },
              {
                kind: "visit",
                name: `Venue ${index}`,
                description: "A proposed visit",
                time: "10:00",
                duration_minutes: 60,
                price: { amount: 10000 },
              },
              {
                kind: "meal",
                meal_slot: "lunch",
                name: "Lunch",
                description: "A proposed meal",
                time: "12:00",
                duration_minutes: 30,
                price: { amount: 10000 },
              },
              {
                kind: "meal",
                meal_slot: "dinner",
                name: "Dinner",
                description: "A proposed meal",
                time: "18:00",
                duration_minutes: 30,
                price: { amount: 10000 },
              },
            ],
          };
        });
        const stops = [
          "Hà Nội",
          ...input.cities.map(
            (stop) => days.find((day) => day.destination_slug === stop).city,
          ),
          "Hà Nội",
        ];
        const total = overBudget ? input.budget + 1000000 : 1000000;
        result = {
          itineraries: [
            {
              days,
              city_catalog: catalog,
              currency: "VND",
              total_cost: total,
              issues: overBudget ? [{ code: "OVER_BUDGET", severity: "warning", params: { amount: 1000000, currency: "VND" } }] : [],
              budget_breakdown: {
                complete: true,
                total,
                accommodation: total - 500000,
                food: 300000,
                activities: 100000,
                transport: 100000,
                contingency: 0,
              },
              transport_summary: stops.slice(1).map((to, index) => ({
                from: stops[index],
                to,
                price: { amount: 50000 },
              })),
            },
          ],
        };
      }
      return new Response(JSON.stringify(result));
    });
    try {
      const rows = await runProductionCanary({
        base: "https://example.test",
        commit: "candidate",
        runId: "unit-run",
        request,
        output: directory,
        sleep: async () => {},
      });
      expect(submitted.map(({ pipeline }) => pipeline)).toEqual([
        2, 2, 2, 1, 1, 1,
      ]);
      expect(new Set(submitted.map(({ key }) => key)).size).toBe(6);
      expect(
        rows
          .filter((row) => row.pipeline === 2)
          .every((row) => row.status === "complete"),
      ).toBe(true);
      expect(
        rows
          .filter((row) => row.pipeline === 1)
          .every((row) => row.status === "failed"),
      ).toBe(true);
      expect(
        await fs.readFile(path.join(directory, "compare.json"), "utf8"),
      ).not.toContain("never-report-this-token");
    } finally {
      log.mockRestore();
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
  it("stops a failed V2 gate before spending calls on remaining cases", async () => {
    vi.stubEnv("PLANNING_CANARY_EMAIL", "ci@example.test");
    vi.stubEnv("PLANNING_CANARY_PASSWORD", "test-password");
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "planning-stop-"),
    );
    let submitted = 0;
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const request = async (url) => {
      const pathname = new URL(url).pathname;
      const result =
        pathname === "/health"
          ? {
              deploy_commit: "candidate",
              planning_pipeline: { v2_percent: 0, queue_bound: true },
            }
          : pathname === "/api/auth/session"
            ? {
                user: { id: "ci" },
                session: { access_token: "private" },
              }
            : pathname === "/api/itinerary/generate"
              ? (++submitted, { job_id: "failed-job" })
              : {
                  status: "failed",
                  error_code: "LOCATION_LOOKUP_UNAVAILABLE",
                  pipeline_version: 2,
                  usage_recorded: true,
                  ai_usage: [{ provider: "cloudflare", model: "test" }],
                };
      return new Response(JSON.stringify(result));
    };
    try {
      await expect(
        runProductionCanary({
          base: "https://example.test",
          commit: "candidate",
          runId: "stop-run",
          request,
          output: directory,
        }),
      ).rejects.toThrow("stop before spending");
      expect(submitted).toBe(1);
      const report = JSON.parse(
        await fs.readFile(path.join(directory, "compare.json"), "utf8"),
      );
      expect(report.cases[0]).toMatchObject({
        job_id: "failed-job",
        status: "failed",
        error_code: "LOCATION_LOOKUP_UNAVAILABLE",
      });
    } finally {
      log.mockRestore();
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
  it("never accepts AI/system failure or malformed success as business rejection", () => {
    const test = { allowConstraintFailure: true };
    expect(
      classifyCanaryResult(test, {
        status: "failed",
        error_code: "AI_DAY_INVALID",
      }),
    ).toBe("failed");
    expect(
      classifyCanaryResult(test, { status: "complete" }, "wrong country"),
    ).toBe("invalid_success");
    expect(
      classifyCanaryResult(test, {
        status: "failed",
        error_code: "PLANNING_BUDGET_UNSATISFIABLE",
        error_params: { reason: "group_total_exceeds_budget" },
      }),
    ).toBe("constraint_rejected");
    expect(
      classifyCanaryResult(
        { allowConstraintFailure: false },
        {
          status: "failed",
          error_code: "PLANNING_BUDGET_UNSATISFIABLE",
          error_params: { reason: "group_total_exceeds_budget" },
        },
      ),
    ).toBe("failed");
    expect(() => validateCanaryPlan({ days: [] }, { num_days: 10 })).toThrow();
  });
  it("uses the actual nested native session contract without leaking the token", async () => {
    vi.stubEnv("PLANNING_CANARY_EMAIL", "ci@example.test");
    vi.stubEnv("PLANNING_CANARY_PASSWORD", "test-password");
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user: { id: "ci-user" },
            session: {
              access_token: "private-token",
              refresh_token: "private-refresh",
            },
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "job" })));
    const session = await canarySession("https://example.test", { request });
    expect(session.userId).toBe("ci-user");
    expect(await session.json("/api/itinerary/jobs/job")).toEqual({
      id: "job",
    });
    expect(request.mock.calls[1][1].headers.Authorization).toBe(
      "Bearer private-token",
    );
    expect(JSON.stringify(session)).not.toContain("private-token");
  });
});
