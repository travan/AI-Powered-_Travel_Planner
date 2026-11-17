import { afterEach, describe, expect, it, vi } from "vitest";
import { ItineraryService } from "../../../../../../apps/server/src/modules/itinerary/application/itinerary.service";
import { workerRequestContext } from "../../../../../../apps/server/src/cloudflare/request-context";
import { malaysiaSingaporeRequest } from "../../../../fixtures/malaysia-singapore-request";
import { validatePlanning } from "@travel/types";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

function scenario(mode: "healthy" | "repair" | "invalid") {
  vi.stubEnv("AI_PROVIDER", "cloudflare");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-15T00:00:00Z"));
  const request = malaysiaSingaporeRequest();
  const repository = {
    findReusable: vi.fn().mockResolvedValue(null),
    createComplete: vi.fn().mockResolvedValue("generated-itinerary"),
    recordFailure: vi.fn(),
  };
  const cities = {
    remember: vi.fn(async (name: string) => ({
      slug: name.startsWith("Kuala Lumpur") ? "kuala-lumpur" : "singapore",
      name: {
        en: name.startsWith("Kuala Lumpur") ? "Kuala Lumpur" : "Singapore",
      },
      country: name.startsWith("Kuala Lumpur") ? "MY" : "SG",
      timezone: "Asia/Singapore",
      places: [],
      activities: [],
      lat: null,
      lon: null,
      currency: "VND",
      popular: false,
    })),
    findForPlanning: vi.fn().mockResolvedValue(null),
  };
  let firstDay = true;
  const run = vi.fn(async (_model: string, payload: Record<string, any>) => {
    const schema = payload.response_format.json_schema;
    const price = (amount: number) => ({
      amount,
      currency: "VND",
      scope: "person",
      status: "estimated",
      basis: "planning_estimate",
      assumption: "Khoản dự toán để lập ngân sách, cần xác nhận trước khi đặt.",
    });
    if (schema.properties.days) {
      expect(
        schema.properties.days.items.properties.destination_slug.enum,
      ).toEqual(request.cities);
      return {
        response: {
          title: "Malaysia và Singapore",
          overview: "Lịch trình đề xuất theo ngân sách.",
          days: Array.from({ length: 10 }, (_, index) => ({
            day_number: index + 1,
            city: index < 5 ? "Kuala Lumpur" : "Singapore",
            destination_slug: index < 5 ? "country-my" : "country-sg",
            title: `Khu vực ${index + 1}`,
            all_day: false,
            places: Array.from(
              { length: 4 },
              (_, place) => `Địa điểm ${index + 1}-${place + 1}`,
            ),
          })),
          hotels: ["Kuala Lumpur", "Singapore"].map((city, index) => ({
            name: `Khu lưu trú tại ${city}`,
            city,
            rooms: 1,
            nights: index === 0 ? 5 : 4,
            nightly_estimate: 400000,
            estimate_basis: "planning_estimate",
            estimate_assumption:
              "Dự toán mỗi phòng mỗi đêm, cần xác nhận giá khi đặt.",
          })),
          transport_summary: [
            ["Hà Nội", "Kuala Lumpur"],
            ["Kuala Lumpur", "Singapore"],
            ["Singapore", "Hà Nội"],
          ].map(([from, to]) => ({
            from,
            to,
            segment: `${from} → ${to}`,
            recommended_mode: "flight",
            transport_kind: "flight",
            options: [],
            price: price(1000000),
          })),
        },
      };
    }
    const activities = Object.fromEntries(
      Object.entries(schema.properties.activities.properties).map(
        ([id, slot]: [string, any]) => [
          id,
          {
            name: slot.properties.name.const ?? `Bữa ăn hoặc chặng ${id}`,
            description:
              "Dành thời gian khám phá khu vực được đề xuất và tìm hiểu những nét đặc trưng của đời sống địa phương. Hoạt động được sắp xếp theo tuyến để hạn chế đi vòng và có thời gian nghỉ. Hãy kiểm tra thông tin tại điểm đến trước khi tham gia.",
            reason: "Phù hợp tuyến đường.",
            alternative: "",
            travel_minutes: null,
            price: price(
              slot.properties.price.properties.amount.const ?? 20000,
            ),
          },
        ],
      ),
    );
    if (mode === "invalid" || (mode === "repair" && firstDay))
      delete activities.breakfast;
    firstDay = false;
    return { response: { activities } };
  });
  const service = new ItineraryService(repository as never, cities as never);
  const generate = () =>
    workerRequestContext.run({ pool: {} as never, ai: { run } }, () =>
      service.generate({ userId: "test-user", dto: request, onStage: vi.fn() }),
    );
  return { request, repository, cities, run, generate };
}

describe("production Malaysia–Singapore request", () => {
  it.each(["healthy", "repair"] as const)(
    "saves ten days with %s model output and no whole-trip regeneration",
    async (mode) => {
      const { request, repository, cities, run, generate } = scenario(mode);
      expect(validatePlanning(request).valid).toBe(true);
      const response = await generate();
      expect(response).toMatchObject({
        status: "cached",
        itinerary_id: "generated-itinerary",
        cache_hit: false,
      });
      expect(repository.createComplete).toHaveBeenCalledOnce();
      expect(cities.remember).toHaveBeenCalledTimes(2);
      const saved = repository.createComplete.mock.calls[0]![0];
      expect(saved.request.start_date).toMatch(/^2027-01-/);
      expect(saved.request.end_date).toMatch(/^2027-01-/);
      expect(saved.result.days).toHaveLength(10);
      expect(saved.result.days[0]).toMatchObject({
        city: "Kuala Lumpur",
        destination_slug: "country-my",
      });
      expect(saved.result.days[9]).toMatchObject({
        city: "Singapore",
        destination_slug: "country-sg",
      });
      expect(
        saved.result.issues.map((issue: { code: string }) => issue.code),
      ).not.toEqual(expect.arrayContaining(["JOURNEY_DAY_ORDER"]));
      expect(
        saved.result.issues.map((issue: { code: string }) => issue.code),
      ).not.toContain("JOURNEY_LEG_MISSING");
      expect(run).toHaveBeenCalledTimes(mode === "healthy" ? 11 : 12);
      if (mode === "repair") {
        const repair = run.mock.calls[2]![1];
        expect(
          repair.response_format.json_schema.properties.activities.required,
        ).toEqual(["breakfast"]);
        expect(repair.max_tokens).toBe(1000);
      }
    },
  );

  it("retains the exact failed day and slot when the repair is still invalid", async () => {
    const { request, generate, run, repository } = scenario("invalid");
    expect(validatePlanning(request).valid).toBe(true);
    await expect(generate()).rejects.toMatchObject({
      code: "AI_DAY_INVALID",
      details: {
        day: 1,
        issues: [{ code: "DAY_ENTRY_INCOMPLETE", slot: "breakfast" }],
      },
    });
    expect(run).toHaveBeenCalledTimes(3);
    expect(repository.createComplete).not.toHaveBeenCalled();
  });
});
