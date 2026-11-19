// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  generate: vi.fn(),
  validate: vi.fn(),
  session: vi.fn(),
  push: vi.fn(),
  createDraft: vi.fn(),
  quote: vi.fn(),
  lookup: vi.fn(),
  claimDraft: vi.fn(),
  params: { query: "" },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mock.push }),
  useSearchParams: () => new URLSearchParams(mock.params.query),
}));
vi.mock("@travel/hooks", () => ({
  useCitySearch: () => ({ suggestions: [] }),
  usePopularCities: () => ({
    cities: [{ slug: "ha-noi", name: { en: "Hanoi", vi: "Hà Nội" } }],
  }),
}));
vi.mock("../../../../../../apps/web/components/layout/SiteHeader", () => ({
  SiteHeader: () => null,
}));
vi.mock(
  "../../../../../../apps/web/components/plan/RecentPlanningRequests",
  () => ({ RecentPlanningRequests: () => null }),
);
vi.mock("../../../../../../apps/web/components/plan/ResolveCitySearch", () => ({
  ResolveCitySearch: () => null,
}));
vi.mock("../../../../../../apps/web/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getSession: mock.session, signOut: vi.fn() },
  }),
}));
vi.mock("../../../../../../apps/web/lib/api", async (original) => ({
  ...(await original<typeof import("../../../../../../apps/web/lib/api")>()),
  generateItinerary: mock.generate,
  createSearchDraft: mock.createDraft,
  claimSearchDraft: mock.claimDraft,
}));
vi.mock("../../../../../../apps/web/lib/journey-api", () => ({
  validateJourney: mock.validate,
  journeyRequest: mock.lookup,
  resolveJourneyLocation: vi.fn(),
}));
vi.mock(
  "../../../../../../apps/web/lib/planner-currency",
  async (original) => ({
    ...(await original<
      typeof import("../../../../../../apps/web/lib/planner-currency")
    >()),
    getCurrencyQuote: mock.quote,
  }),
);
import { UnifiedPlanner } from "../../../../../../apps/web/components/plan/UnifiedPlanner";
import { LanguageProvider } from "../../../../../../apps/web/components/i18n/LanguageProvider";
import { emptyPlanner } from "../../../../../../apps/web/lib/planner-model";
const key = "horizon.planner.draft.v3";
const show = () =>
  render(
    <LanguageProvider initialLocale="vi">
      <UnifiedPlanner />
    </LanguageProvider>,
  );
const fillRoute = () => {
  fireEvent.change(screen.getByLabelText("Đi từ đâu?"), {
    target: { value: "Hà Nội" },
  });
  fireEvent.change(screen.getByTestId("web-plan-city-input"), {
    target: { value: "Tây An" },
  });
};
beforeEach(() => {
  const storage = () => {
    const values = new Map<string, string>();
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
      clear: () => values.clear(),
    };
  };
  vi.stubGlobal("localStorage", storage());
  vi.stubGlobal("sessionStorage", storage());
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  mock.params.query = "";
  mock.quote
    .mockReset()
    .mockImplementation(async (from: string, to: string) => ({
      from,
      to,
      rate: from === "USD" ? 25000 : 1 / 25000,
      updated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      source_url: "https://www.exchangerate-api.com",
    }));
  mock.session.mockResolvedValue({
    data: { session: { access_token: "test-token" } },
  });
  mock.validate.mockResolvedValue({ valid: true, issues: [] });
  mock.lookup.mockResolvedValue({ suggestion: null });
  mock.generate.mockResolvedValue({ status: "queued", job_id: "job-1" });
});
afterEach(cleanup);
describe("compact planner submission", () => {
  it("keeps country city suggestions optional and replaces a selected city in place", async () => {
    const draft = emptyPlanner();
    draft.planning.journey.origin.label = "Hanoi";
    draft.cities = [
      {
        slug: "beijing",
        name: "Beijing",
        names: { en: "Beijing", vi: "Bắc Kinh" },
      },
    ];
    localStorage.setItem(key, JSON.stringify(draft));
    mock.lookup.mockResolvedValue({
      suggestion: {
        country: "RU",
        names: { en: "Russia", vi: "Nga" },
        cities: [
          { slug: "moscow", name: { en: "Moscow", vi: "Moskva" } },
          { slug: "kazan", name: { en: "Kazan", vi: "Kazan" } },
        ],
      },
    });
    show();
    const destination = screen.getByTestId("web-plan-city-input");
    fireEvent.change(destination, { target: { value: "Russia" } });
    fireEvent.click(await screen.findByRole("button", { name: "Moskva (Nga)" }));
    await waitFor(() =>
      expect(screen.getByTestId("web-plan-route").textContent).toBe(
        "Hà Nội → Bắc Kinh → Moskva → Hà Nội",
      ),
    );
    expect(mock.generate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(screen.getByTestId("web-plan-route").textContent).toBe(
      "Hanoi → Beijing → Moscow → Hanoi",
    );
    fireEvent.click(screen.getByRole("button", { name: "Change city" }));
    fireEvent.click(screen.getByRole("button", { name: "Kazan (Russia)" }));
    expect(screen.getByTestId("web-plan-route").textContent).toBe(
      "Hanoi → Beijing → Kazan → Hanoi",
    );
    fireEvent.click(screen.getByTestId("web-plan-generate"));
    await waitFor(() => expect(mock.generate).toHaveBeenCalledOnce());
    expect(mock.generate.mock.calls[0]![0]).toMatchObject({
      cities: ["beijing", "kazan"],
      locale: "en",
    });
  });

  it.each(["submit", "choose", "enter"])(
    "uses Singapore without city suggestions via %s",
    async (action) => {
      show();
      fireEvent.change(screen.getByLabelText("Đi từ đâu?"), {
        target: { value: "Hà Nội" },
      });
      const destination = screen.getByTestId("web-plan-city-input");
      fireEvent.change(destination, { target: { value: "Singapore" } });
      const choose = screen.getByRole("button", {
        name: "Chọn Singapore làm điểm đến",
      });
      if (action === "choose") fireEvent.click(choose);
      if (action === "enter") fireEvent.keyDown(destination, { key: "Enter" });
      fireEvent.click(screen.getByTestId("web-plan-generate"));
      await waitFor(() => expect(mock.generate).toHaveBeenCalledOnce());
      expect(mock.generate.mock.calls[0]![0]).toMatchObject({
        cities: ["country-sg"],
        city_names: ["Singapore"],
        destination_refs: [
          { id: "country-sg", name: "Singapore", country: "SG", kind: "country" },
        ],
        planning: { journey: { destinations: ["country-sg"] } },
      });
    },
  );

  it("initially shows two text fields with all options collapsed and no cache control", () => {
    show();
    expect(
      within(screen.getByTestId("planner-essential-panel")).getAllByRole(
        "textbox",
      ),
    ).toHaveLength(2);
    expect(
      (screen.getByTestId("planner-optional-settings") as HTMLDetailsElement)
        .open,
    ).toBe(false);
    expect(screen.getByTestId("planner-settings-summary").textContent).toBe(
      "3 ngày · 2 người · Chi phí tự đề xuất",
    );
    expect(screen.queryByText(/bỏ qua cache/i)).toBeNull();
    expect(
      (screen.getByTestId("planner-recent-requests") as HTMLDetailsElement)
        .open,
    ).toBe(true);
  });
  it("uses VND for Vietnamese and USD for English before money is entered", () => {
    show();
    expect((screen.getByLabelText("Tiền tệ") as HTMLSelectElement).value).toBe(
      "VND",
    );
    fireEvent.click(screen.getByRole("button", { name: "EN", exact: true }));
    expect((screen.getByLabelText("Currency") as HTMLSelectElement).value).toBe(
      "USD",
    );
    fireEvent.click(screen.getByRole("button", { name: "VI", exact: true }));
    expect((screen.getByLabelText("Tiền tệ") as HTMLSelectElement).value).toBe(
      "VND",
    );
  });
  it("converts all prices on language changes and avoids round-trip drift", async () => {
    const draft = emptyPlanner("vi");
    draft.planning.budget.total = 1000;
    draft.planning.stay_preferences.nightly_budget = 500;
    draft.planning.dining_preferences.per_person_budget = 100;
    draft.planning.transport_preferences.total_price = 200;
    localStorage.setItem(key, JSON.stringify(draft));
    show();
    fireEvent.click(screen.getByRole("button", { name: "EN", exact: true }));
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Currency") as HTMLSelectElement).value,
      ).toBe("USD"),
    );
    // React renders the new currency before the separate draft-persistence
    // effect necessarily runs, especially on a slower coverage runner.
    await waitFor(() => {
      const converted = JSON.parse(localStorage.getItem(key)!);
      expect(converted.planning.budget).toMatchObject({
        currency: "USD",
        total: 0.04,
      });
      expect(converted.planning.stay_preferences.nightly_budget).toBe(0.02);
      expect(converted.planning.dining_preferences.per_person_budget).toBe(0);
      expect(converted.planning.transport_preferences.total_price).toBe(0.01);
    });
    fireEvent.click(screen.getByRole("button", { name: "VI", exact: true }));
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Ngân sách cả nhóm (VND)") as HTMLInputElement)
          .value,
      ).toBe("1000"),
    );
    await waitFor(() => {
      const restored = JSON.parse(localStorage.getItem(key)!);
      expect(restored.planning.budget).toMatchObject({
        currency: "VND",
        total: 1000,
      });
      expect(restored.planning.stay_preferences.nightly_budget).toBe(500);
      expect(restored.planning.dining_preferences.per_person_budget).toBe(100);
      expect(restored.planning.transport_preferences.total_price).toBe(200);
    });
  });
  it("keeps original money and blocks sending when conversion fails, then allows retry", async () => {
    const draft = emptyPlanner("en");
    draft.planning.budget.total = 1000;
    draft.planning.journey.origin.label = "Hà Nội";
    draft.destinationQuery = "Tây An";
    localStorage.setItem(key, JSON.stringify(draft));
    mock.quote.mockRejectedValueOnce(new Error("offline"));
    show();
    await screen.findByText(/Chưa lấy được tỷ giá/);
    expect(
      (screen.getByLabelText("Ngân sách cả nhóm (USD)") as HTMLInputElement)
        .value,
    ).toBe("1000");
    expect(
      (screen.getByTestId("web-plan-generate") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(mock.generate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Thử quy đổi lại" }));
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Ngân sách cả nhóm (VND)") as HTMLInputElement)
          .value,
      ).toBe("25000000"),
    );
    expect(
      (screen.getByTestId("web-plan-generate") as HTMLButtonElement).disabled,
    ).toBe(false);
  });
  it("submits the visible destination without Enter using the same validated snapshot", async () => {
    show();
    fillRoute();
    fireEvent.click(screen.getByTestId("web-plan-generate"));
    await waitFor(() => expect(mock.generate).toHaveBeenCalledOnce());
    const sent = mock.generate.mock.calls[0]![0];
    expect(sent).toMatchObject({
      cities: ["tay-an"],
      city_names: ["Tây An"],
      num_days: 3,
      num_travelers: 2,
      force_refresh: false,
      planning: {
        journey: { origin: { label: "Hà Nội" }, destinations: ["tay-an"] },
      },
    });
    expect(mock.validate).not.toHaveBeenCalled();
    expect(mock.generate.mock.calls[0]![2]).toMatch(/^[a-f0-9-]{36}$/);
    expect(mock.push).toHaveBeenCalledWith("/plan/jobs/job-1");
    expect(screen.getAllByTestId("web-plan-selected-city")).toHaveLength(1);
  });
  it("captures visible native field values even if an input event was missed", async () => {
    show();
    (screen.getByLabelText("Đi từ đâu?") as HTMLInputElement).value = "Hà Nội";
    (screen.getByTestId("web-plan-city-input") as HTMLInputElement).value =
      "Tây An";
    fireEvent.click(screen.getByTestId("web-plan-generate"));
    await waitFor(() => expect(mock.generate).toHaveBeenCalledOnce());
    expect(mock.generate.mock.calls[0]![0]).toMatchObject({
      city_names: ["Tây An"],
      planning: { journey: { origin: { label: "Hà Nội", city_slug: "ha-noi" } } },
    });
  });
  it("opens the optional group containing invalid hidden settings", () => {
    const draft = emptyPlanner();
    draft.planning.journey.origin.label = "Hà Nội";
    draft.destinationQuery = "Tây An";
    draft.planning.stay_preferences.rooms = 0;
    localStorage.setItem(key, JSON.stringify(draft));
    show();
    fireEvent.click(screen.getByTestId("web-plan-generate"));
    expect(
      (screen.getByTestId("planner-optional-settings") as HTMLDetailsElement)
        .open,
    ).toBe(true);
    expect(
      (screen.getByText("Lưu trú").closest("details") as HTMLDetailsElement)
        .open,
    ).toBe(true);
    expect(mock.generate).not.toHaveBeenCalled();
  });
  it("does not submit empty routes and displays errors at the fields", () => {
    show();
    fireEvent.click(screen.getByTestId("web-plan-generate"));
    expect(screen.getAllByRole("alert").length).toBeGreaterThanOrEqual(2);
    expect(mock.validate).not.toHaveBeenCalled();
    expect(mock.generate).not.toHaveBeenCalled();
    expect(
      (screen.getByTestId("planner-optional-settings") as HTMLDetailsElement)
        .open,
    ).toBe(false);
  });
  it("saves a pending destination and preserves hidden values after restoring a draft", async () => {
    const draft = emptyPlanner();
    draft.planning.journey.origin.label = "Hà Nội";
    draft.destinationQuery = "Tây An";
    draft.days = 6;
    draft.flexible = true;
    draft.month = "2090-03";
    draft.planning.budget = { total: 1000, currency: "USD" };
    localStorage.setItem(key, JSON.stringify(draft));
    show();
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Ngân sách cả nhóm (VND)") as HTMLInputElement)
          .value,
      ).toBe("25000000"),
    );
    expect(
      (screen.getByTestId("web-plan-city-input") as HTMLInputElement).value,
    ).toBe("Tây An");
    fireEvent.click(
      screen.getByTestId("planner-optional-settings").querySelector("summary")!,
    );
    fireEvent.click(screen.getByText("Lưu nháp"));
    const saved = JSON.parse(localStorage.getItem(key)!);
    expect(saved.cities).toEqual([{ slug: "tay-an", name: "Tây An" }]);
    expect(saved.destinationQuery).toBe("");
    fireEvent.click(
      screen.getByTestId("planner-optional-settings").querySelector("summary")!,
    );
    fireEvent.click(screen.getByTestId("web-plan-generate"));
    await waitFor(() => expect(mock.generate).toHaveBeenCalledOnce());
    expect(mock.generate.mock.calls[0]![0]).toMatchObject({
      flexible_month: "2090-03",
      num_days: 6,
      budget: 25000000,
      currency: "VND",
      city_names: ["Tây An"],
    });
  });
  it("preserves the same prepared payload when redirecting through login", async () => {
    mock.session.mockResolvedValue({ data: { session: null } });
    mock.createDraft.mockResolvedValue({ id: "draft-1" });
    show();
    fillRoute();
    fireEvent.click(screen.getByTestId("web-plan-generate"));
    await waitFor(() => expect(mock.push).toHaveBeenCalledOnce());
    expect(mock.generate).not.toHaveBeenCalled();
    const intent = JSON.parse(sessionStorage.getItem("horizon.search.intent")!);
    expect(mock.validate).not.toHaveBeenCalled();
    expect(intent.request.city_names).toEqual(["Tây An"]);
    expect(mock.createDraft.mock.calls[0]![0].search_payload).toEqual(
      intent.request,
    );
    expect(mock.push.mock.calls[0]![0]).toContain("resumeGenerate");
  });
  it("uses the saved journey and incoming destination in the first Generate request", async () => {
    const draft = emptyPlanner();
    draft.planning.journey.origin.label = "Hà Nội";
    draft.planning.journey.destinations = ["tokyo"];
    localStorage.setItem(key, JSON.stringify({ ...draft, cities: undefined }));
    mock.params.query = "city=country-sg";
    show();
    expect(screen.getAllByTestId("web-plan-selected-city")).toHaveLength(2);
    fireEvent.click(screen.getByTestId("web-plan-generate"));
    await waitFor(() => expect(mock.generate).toHaveBeenCalledOnce());
    expect(mock.generate.mock.calls[0]![0]).toMatchObject({
      cities: ["tokyo", "country-sg"],
      city_names: ["tokyo", "Singapore"],
      destination_refs: [
        { id: "tokyo", name: "tokyo", kind: "city" },
        { id: "country-sg", name: "Singapore", country: "SG", kind: "country" },
      ],
      planning: { journey: { destinations: ["tokyo", "country-sg"] } },
    });
  });

  it("resumes the exact submitted route and key even if the claimed draft is stale", async () => {
    mock.session.mockResolvedValueOnce({ data: { session: null } });
    mock.createDraft.mockResolvedValue({ id: "draft-1" });
    show();
    fillRoute();
    fireEvent.change(screen.getByTestId("web-plan-city-input"), {
      target: { value: "Singapore" },
    });
    fireEvent.click(screen.getByTestId("web-plan-generate"));
    await waitFor(() => expect(mock.push).toHaveBeenCalledOnce());
    const intent = JSON.parse(sessionStorage.getItem("horizon.search.intent")!);
    cleanup();
    mock.params.query = "resumeGenerate=1&draftId=draft-1";
    mock.claimDraft.mockResolvedValue({
      search_payload: { ...intent.request, cities: ["tokyo"], city_names: ["Tokyo"] },
    });
    show();
    await waitFor(() => expect(mock.generate).toHaveBeenCalledOnce());
    expect(mock.generate).toHaveBeenCalledWith(intent.request, "test-token", intent.submissionKey);
    expect(intent.request.cities).toEqual(["country-sg"]);
  });

  it("restores the selected route and reuses the admission key after a reload with an unknown response", async () => {
    show();
    fillRoute();
    const destination = screen.getByTestId("web-plan-city-input");
    fireEvent.change(destination, { target: { value: "Singapore" } });
    fireEvent.click(screen.getByRole("button", { name: "Chọn Singapore làm điểm đến" }));
    fireEvent.change(destination, { target: { value: "Tây An" } });
    fireEvent.keyDown(destination, { key: "Enter" });
    mock.generate.mockRejectedValueOnce(new Error("Connection lost"));
    fireEvent.click(screen.getByTestId("web-plan-generate"));
    await waitFor(() => expect(screen.getByTestId("web-plan-error")).toBeTruthy());
    const [firstRequest, , firstKey] = mock.generate.mock.calls[0]!;
    expect(firstRequest).toMatchObject({
      cities: ["country-sg", "tay-an"],
      city_names: ["Singapore", "Tây An"],
      planning: { journey: { destinations: ["country-sg", "tay-an"] } },
    });
    cleanup();
    show();
    expect(screen.getByTestId("web-plan-route").textContent).toBe(
      "Hà Nội → Singapore → Tây An → Hà Nội",
    );
    fireEvent.click(screen.getByTestId("web-plan-generate"));
    await waitFor(() => expect(mock.generate).toHaveBeenCalledTimes(2));
    expect(mock.generate.mock.calls[1]![0]).toEqual(firstRequest);
    expect(mock.generate.mock.calls[1]![2]).toBe(firstKey);
  });

  it("keeps the prepared route and idempotency key when generation service fails", async () => {
    mock.generate.mockRejectedValueOnce(new Error("Service unavailable"));
    show();
    fillRoute();
    fireEvent.click(screen.getByTestId("web-plan-generate"));
    await screen.findByTestId("web-plan-error");
    expect(mock.generate).toHaveBeenCalledOnce();
    const firstKey = mock.generate.mock.calls[0]![2];
    fireEvent.click(screen.getByTestId("web-plan-generate"));
    await waitFor(() => expect(mock.generate).toHaveBeenCalledTimes(2));
    expect(mock.generate.mock.calls[1]![2]).toBe(firstKey);
    expect(
      (screen.getByLabelText("Đi từ đâu?") as HTMLInputElement).value,
    ).toBe("Hà Nội");
    expect(screen.getByTestId("web-plan-selected-city").textContent).toContain(
      "Tây An",
    );
  });
});
