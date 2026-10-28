// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  generate: vi.fn(),
  validate: vi.fn(),
  signOut: vi.fn().mockResolvedValue({}),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mock.push, replace: mock.replace }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@travel/hooks", () => ({
  usePopularCities: () => ({ cities: [] }),
  useCitySearch: () => ({ suggestions: [] }),
}));
vi.mock("../../../../../../apps/web/components/layout/SiteHeader", () => ({
  SiteHeader: () => null,
}));
vi.mock("../../../../../../apps/web/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signOut: mock.signOut,
      getSession: async () => ({
        data: { session: { access_token: "test-token" } },
      }),
    },
  }),
}));
vi.mock("../../../../../../apps/web/lib/api", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../../../../../apps/web/lib/api")
  >()),
  generateItinerary: mock.generate,
  createSearchDraft: vi.fn(),
  claimSearchDraft: vi.fn(),
}));
vi.mock("../../../../../../apps/web/lib/journey-api", () => ({
  validateJourney: mock.validate,
  resolveJourneyLocation: vi.fn().mockResolvedValue({ candidates: [] }),
}));
import { LanguageProvider } from "../../../../../../apps/web/components/i18n/LanguageProvider";
import { emptyPlanner } from "../../../../../../apps/web/lib/planner-model";
import { ApiRequestError } from "../../../../../../apps/web/lib/api";
import { JourneyWizard } from "../../../../../../apps/web/components/plan/JourneyWizard";

beforeEach(() => {
  const storage = () => {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => map.set(k, v),
      removeItem: (k: string) => map.delete(k),
      clear: () => map.clear(),
    };
  };
  vi.stubGlobal("localStorage", storage());
  vi.stubGlobal("sessionStorage", storage());
  mock.push.mockReset();
  mock.signOut.mockClear();
  mock.generate
    .mockReset()
    .mockResolvedValue({ status: "queued", job_id: "job-1" });
  mock.validate.mockReset().mockResolvedValue({ valid: true, issues: [] });
});
afterEach(cleanup);
describe("unified bilingual planner", () => {
  it("preserves structured criteria when an expired session requires signing in again", async () => {
    mock.generate.mockRejectedValueOnce(
      new ApiRequestError("Generate failed: 401", 401),
    );
    const draft = emptyPlanner();
    draft.cities = [{ slug: "da-nang", name: "Đà Nẵng" }];
    draft.planning.journey.origin.label = "Hà Nội";
    draft.planning.budget.total = 8000000;
    localStorage.setItem("horizon.planner.draft.v3", JSON.stringify(draft));
    render(
      <LanguageProvider initialLocale="en">
        <JourneyWizard />
      </LanguageProvider>,
    );
    await screen.findByLabelText("Origin");
    fireEvent.click(screen.getByRole("button", { name: "Generate itinerary" }));
    await waitFor(() =>
      expect(mock.push).toHaveBeenCalledWith(
        expect.stringContaining("/login?redirectTo="),
      ),
    );
    expect(mock.signOut).toHaveBeenCalledOnce();
    const intent = JSON.parse(sessionStorage.getItem("horizon.search.intent")!);
    expect(intent.request).toMatchObject({
      cities: ["da-nang"],
      budget: 8000000,
      planning: { journey: { origin: { label: "Hà Nội" } } },
    });
    expect(screen.queryByText("Generate failed: 401")).toBeNull();
  });
  it("generates with unbooked conflicting draft times and optional accommodation", async () => {
    const draft = emptyPlanner();
    draft.cities = [{ slug: "taiwan", name: "Taiwan" }];
    draft.planning.journey.origin.label = "Hà Nội";
    draft.planning.transport_preferences.arrival_at = "2026-11-03T15:07";
    draft.planning.transport_preferences.departure_at = "2026-11-01T15:07";
    localStorage.setItem("horizon.planner.draft.v3", JSON.stringify(draft));
    mock.validate.mockResolvedValue({
      valid: true,
      issues: [
        {
          code: "STAY_NOT_SELECTED",
          severity: "warning",
          message: "",
          params: {},
        },
      ],
    });
    render(
      <LanguageProvider initialLocale="en">
        <JourneyWizard />
      </LanguageProvider>,
    );
    await screen.findByText(/Your unbooked travel times conflict/);
    fireEvent.click(screen.getByRole("button", { name: "Generate itinerary" }));
    await waitFor(() => expect(mock.generate).toHaveBeenCalledTimes(1));
    expect(
      mock.generate.mock.calls[0]![0].planning.transport_preferences.arrival_at,
    ).toBeUndefined();
    expect(
      screen.getByText("For your information — no extra input needed"),
    ).toBeTruthy();
    expect(screen.queryByText("Please fix before generating")).toBeNull();
  });
  it("needs only origin and destinations with valid defaults and collapsed optional settings", async () => {
    render(
      <LanguageProvider initialLocale="en">
        <JourneyWizard />
      </LanguageProvider>,
    );
    const origin = (await screen.findByLabelText("Origin")) as HTMLInputElement;
    const optional = screen.getByTestId(
      "planner-optional-settings",
    ) as HTMLDetailsElement;
    expect(optional.open).toBe(false);
    expect(screen.getByTestId("planner-primary-time")).toBeTruthy();
    expect(origin.required).toBe(true);
    expect(
      (screen.getByLabelText("Destinations") as HTMLInputElement).required,
    ).toBe(true);
    fireEvent.change(origin, { target: { value: "Hà Nội" } });
    fireEvent.change(screen.getByLabelText("Destinations"), {
      target: { value: "Đà Nẵng" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add “\s*Đà Nẵng”/ }));
    fireEvent.click(screen.getByRole("button", { name: "Generate itinerary" }));
    await waitFor(() => expect(mock.generate).toHaveBeenCalledTimes(1));
    const request = mock.generate.mock.calls[0]![0];
    expect(request).toMatchObject({
      num_days: 3,
      num_travelers: 2,
      currency: "VND",
      trip_style: "mixed",
      planning: {
        journey: { return_to_origin: true },
        stay_preferences: { rooms: 1 },
        transport_preferences: { mode: "suggest" },
        experience_preferences: { pace: "balanced" },
      },
    });
    expect(request.budget).toBeUndefined();
    expect(optional.open).toBe(false);
  });
  it("keeps group budget prominent and submits currency, style and traveler choices", async () => {
    render(
      <LanguageProvider initialLocale="en">
        <JourneyWizard />
      </LanguageProvider>,
    );
    fireEvent.change(await screen.findByLabelText("Origin"), {
      target: { value: "Hà Nội" },
    });
    fireEvent.change(screen.getByLabelText("Destinations"), {
      target: { value: "Đà Nẵng" },
    });
    fireEvent.keyDown(screen.getByLabelText("Destinations"), { key: "Enter" });
    fireEvent.change(screen.getByLabelText("Total group budget (VND)"), {
      target: { value: "10000000" },
    });
    fireEvent.change(screen.getByLabelText("Currency"), {
      target: { value: "USD" },
    });
    expect(
      (screen.getByLabelText("Total group budget (USD)") as HTMLInputElement)
        .value,
    ).toBe("10000000");
    fireEvent.change(screen.getByLabelText("Total group budget (USD)"), {
      target: { value: "2000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Mid-range/ }));
    fireEvent.click(screen.getByRole("button", { name: "More adults" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate itinerary" }));
    await waitFor(() => expect(mock.generate).toHaveBeenCalledTimes(1));
    expect(mock.generate.mock.calls[0]![0]).toMatchObject({
      budget: 2000,
      currency: "USD",
      trip_style: "mid_range",
      num_travelers: 3,
      planning: { budget: { total: 2000, currency: "USD" } },
    });
  });
  it("clears outdated destination errors after selecting a place and submits it", async () => {
    render(
      <LanguageProvider initialLocale="en">
        <JourneyWizard />
      </LanguageProvider>,
    );
    fireEvent.change(await screen.findByLabelText("Origin"), {
      target: { value: "Hà Nội" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate itinerary" }));
    expect(
      await screen.findByText("Choose at least one destination."),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Destinations"), {
      target: { value: "Taiwan" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add “\s*Taiwan”/ }));
    await waitFor(() =>
      expect(screen.queryByText("Choose at least one destination.")).toBeNull(),
    );
    expect(screen.getByText("1 destination selected")).toBeTruthy();
    expect(
      (screen.getByLabelText("Destinations") as HTMLInputElement).required,
    ).toBe(false);
    expect(
      screen.getByPlaceholderText("Add another destination (optional)"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Generate itinerary" }));
    await waitFor(() => expect(mock.generate).toHaveBeenCalledTimes(1));
    const request = mock.generate.mock.calls[0]![0];
    expect(request.cities).toHaveLength(1);
    expect(request.city_names).toEqual(["Taiwan"]);
    expect(request.planning.journey.destinations).toEqual(request.cities);
  });
  it("marks conditional dates/endpoints and expands hidden fields with validation errors", async () => {
    render(
      <LanguageProvider initialLocale="en">
        <JourneyWizard />
      </LanguageProvider>,
    );
    await screen.findByLabelText("Origin");
    fireEvent.click(screen.getByRole("checkbox", { name: "Return to origin" }));
    expect(
      (screen.getByLabelText("Final destination") as HTMLInputElement).required,
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Choose exact dates" }),
    );
    expect(
      (screen.getByLabelText("Departure date") as HTMLInputElement).required,
    ).toBe(true);
    expect(
      (screen.getByLabelText("Return date") as HTMLInputElement).required,
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Choose exact dates" }),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Return to origin" }));
    fireEvent.change(screen.getByLabelText("Origin"), {
      target: { value: "Hà Nội" },
    });
    fireEvent.change(screen.getByLabelText("Destinations"), {
      target: { value: "Huế" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add “\s*Huế”/ }));
    fireEvent.click(
      screen.getByText("Customize more (optional)", { exact: true }),
    );
    const optional = screen.getByTestId(
      "planner-optional-settings",
    ) as HTMLDetailsElement;
    optional.open = true;
    fireEvent.change(screen.getByLabelText("Accommodation type"), {
      target: { value: "already_booked" },
    });
    expect(
      (screen.getByLabelText("Booked accommodation name") as HTMLInputElement)
        .required,
    ).toBe(true);
    optional.open = false;
    fireEvent.click(screen.getByRole("button", { name: "Generate itinerary" }));
    await waitFor(() => expect(optional.open).toBe(true));
    expect(
      (
        screen
          .getByLabelText("Booked accommodation name")
          .closest("details") as HTMLDetailsElement
      ).open,
    ).toBe(true);
    expect(mock.generate).not.toHaveBeenCalled();
  });
  it.each(["horizon.journey.draft.v2", "horizon.planner.draft.v3"])(
    "migrates the old café default in %s and preserves typed preferences across language changes",
    async (key) => {
      const draft = emptyPlanner();
      draft.planning.dining_preferences.cafe = "Để hệ thống đề xuất";
      localStorage.setItem(key, JSON.stringify(draft));
      render(
        <LanguageProvider initialLocale="en">
          <JourneyWizard />
        </LanguageProvider>,
      );
      const cafe = (await screen.findByLabelText(
        "Café preferences",
      )) as HTMLInputElement;
      expect(cafe.value).toBe("");
      expect(cafe.placeholder).toBe("Let the system suggest");
      expect(
        JSON.parse(localStorage.getItem("horizon.planner.draft.v3")!).planning
          .dining_preferences.cafe,
      ).toBe("");
      fireEvent.click(screen.getByRole("button", { name: "VI", exact: true }));
      expect(
        (screen.getByLabelText("Café bạn thích") as HTMLInputElement)
          .placeholder,
      ).toBe("Để hệ thống đề xuất");
      fireEvent.change(screen.getByLabelText("Café bạn thích"), {
        target: { value: "Quán yên tĩnh ở Đà Nẵng" },
      });
      fireEvent.click(screen.getByRole("button", { name: "EN", exact: true }));
      expect(
        (screen.getByLabelText("Café preferences") as HTMLInputElement).value,
      ).toBe("Quán yên tĩnh ở Đà Nẵng");
      expect(mock.generate).not.toHaveBeenCalled();
    },
  );
  it("captures structured criteria and opens the durable job screen", async () => {
    render(
      <LanguageProvider initialLocale="vi">
        <JourneyWizard />
      </LanguageProvider>,
    );
    fireEvent.change(await screen.findByLabelText("Điểm xuất phát"), {
      target: { value: "Hà Nội" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("Bạn muốn đi đâu? Ví dụ: Đà Nẵng"),
      { target: { value: "Đà Nẵng" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /Thêm “\s*Đà Nẵng”/ }));
    expect(await screen.findByLabelText("Số người lớn")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Ngân sách tổng cả nhóm (VND)"), {
      target: { value: "8000000" },
    });
    fireEvent.change(await screen.findByLabelText("Số phòng/căn"), {
      target: { value: "2" },
    });
    fireEvent.change(
      await screen.findByLabelText("Dị ứng thực phẩm — bắt buộc"),
      { target: { value: "Đậu phộng, tôm" } },
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Tạo hành trình" }),
    );
    await waitFor(() => expect(mock.generate).toHaveBeenCalled());
    const payload = mock.generate.mock.calls[0]![0];
    expect(payload.planning.journey.origin.label).toBe("Hà Nội");
    expect(payload.planning.stay_preferences.rooms).toBe(2);
    expect(payload.planning.dining_preferences.allergies).toEqual([
      "Đậu phộng",
      "tôm",
    ]);
    expect(payload.currency).toBe("VND");
    expect(payload.prompt_text).toBeUndefined();
    expect(mock.push).toHaveBeenCalledWith("/plan/jobs/job-1");
  });
  it("blocks a missing origin and keeps the form editable", async () => {
    render(
      <LanguageProvider initialLocale="vi">
        <JourneyWizard />
      </LanguageProvider>,
    );
    await screen.findByLabelText("Điểm xuất phát");
    fireEvent.click(screen.getByRole("button", { name: "Tạo hành trình" }));
    expect(
      await screen.findByText("Chọn điểm xuất phát để lập chặng đi và về."),
    ).toBeTruthy();
    expect(mock.generate).not.toHaveBeenCalled();
  });
  it("keeps browser coordinates out of automatic drafts and allows explicit removal", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({
            coords: {
              latitude: 10.762622,
              longitude: 106.660172,
              accuracy: 100,
            },
          } as GeolocationPosition),
      },
    });
    render(
      <LanguageProvider initialLocale="vi">
        <JourneyWizard />
      </LanguageProvider>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Dùng vị trí hiện tại" }),
    );
    await screen.findByRole("button", { name: "Bỏ tọa độ" });
    const automatic = JSON.parse(
      localStorage.getItem("horizon.planner.draft.v3")!,
    );
    expect(automatic.planning.journey.origin.latitude).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "Lưu nháp" }));
    const explicit = JSON.parse(
      localStorage.getItem("horizon.planner.draft.v3")!,
    );
    expect(explicit.planning.journey.origin.latitude).toBe(10.763);
    fireEvent.click(screen.getByRole("button", { name: "Bỏ tọa độ" }));
    expect(screen.queryByRole("button", { name: "Bỏ tọa độ" })).toBeNull();
    expect(
      JSON.parse(localStorage.getItem("horizon.planner.draft.v3")!).planning
        .journey.origin.latitude,
    ).toBeUndefined();
  });
  it("switches languages without losing inputs or changing currency", async () => {
    render(
      <LanguageProvider initialLocale="en">
        <JourneyWizard />
      </LanguageProvider>,
    );
    fireEvent.change(await screen.findByLabelText("Origin"), {
      target: { value: "Hà Nội" },
    });
    fireEvent.change(screen.getByLabelText("Currency"), {
      target: { value: "USD" },
    });
    fireEvent.click(screen.getByRole("button", { name: "VI" }));
    expect(
      (screen.getByLabelText("Điểm xuất phát") as HTMLInputElement).value,
    ).toBe("Hà Nội");
    expect((screen.getByLabelText("Tiền tệ") as HTMLSelectElement).value).toBe(
      "USD",
    );
    expect(document.cookie).toContain("locale=vi");
    expect(document.documentElement.lang).toBe("vi");
    expect(mock.generate).not.toHaveBeenCalled();
  });
  it("recovers safely from an incomplete v2 draft", async () => {
    localStorage.setItem(
      "horizon.planner.draft.v3",
      JSON.stringify({ planning: { schema_version: 2 } }),
    );
    render(
      <LanguageProvider initialLocale="vi">
        <JourneyWizard />
      </LanguageProvider>,
    );
    expect(await screen.findByLabelText("Điểm xuất phát")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tạo hành trình" })).toBeTruthy();
  });
});
