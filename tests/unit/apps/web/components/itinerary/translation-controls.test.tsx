// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  act,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Itinerary } from "@travel/types";
const api = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../../../../../../apps/web/lib/journey-api", () => ({
  journeyRequest: api.request,
  getJourneyJob: (id: string, token: string) =>
    api.request(`itinerary/jobs/${id}`, token),
  notifyJobStatusChanged: vi.fn(),
}));
import { TranslationControls } from "../../../../../../apps/web/components/itinerary/TranslationControls";
import { LanguageProvider } from "../../../../../../apps/web/components/i18n/LanguageProvider";
const plan = {
  id: "one",
  locale: "en",
  version: 1,
  title: "Đà Nẵng",
  overview: "Original description",
  days: [],
  hotels: [],
  restaurants: [],
  suggestions: [],
  transport_summary: [],
} as unknown as Itinerary;
const translation = {
  id: "translated",
  target_locale: "vi",
  source_version: "hash-one",
  stale: false,
  texts: { overview: "Mô tả tiếng Việt" },
};
const onChange = vi.fn();
function view(source = plan) {
  return (
    <LanguageProvider initialLocale="en">
      <TranslationControls
        plan={source}
        path="itinerary/one/translations"
        token="fixture-token"
        onChange={onChange}
      />
    </LanguageProvider>
  );
}
beforeEach(() => {
  api.request.mockReset();
  onChange.mockReset();
});
afterEach(cleanup);
describe("explicit itinerary translations", () => {
  it("loads cached texts without AI and keeps the selected translation across a UI language change", async () => {
    api.request.mockResolvedValue({
      source: plan,
      source_version: "hash-one",
      translations: [translation],
    });
    render(view());
    await screen.findByRole("option", { name: "Tiếng Việt" });
    fireEvent.change(screen.getByLabelText("Viewing"), {
      target: { value: "vi" },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      ...plan,
      overview: "Mô tả tiếng Việt",
    });
    fireEvent.click(screen.getByRole("button", { name: "VI", exact: true }));
    expect(
      (screen.getByLabelText("Bản đang xem") as HTMLSelectElement).value,
    ).toBe("vi");
    expect(api.request).toHaveBeenCalledTimes(1);
    expect(plan.overview).toBe("Original description");
  });
  it("starts a job only after the user requests a translation", async () => {
    let started = false;
    api.request.mockImplementation(
      async (path: string, _token: string, body?: unknown) => {
        if (body) {
          started = true;
          return { job_id: "job-one" };
        }
        if (path.includes("jobs/")) return { status: "complete" };
        return {
          source: plan,
          source_version: "hash-one",
          translations: started ? [translation] : [],
        };
      },
    );
    render(view());
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Translate itinerary to Tiếng Việt",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    expect(started).toBe(false);
    fireEvent.click(
      screen.getByRole("button", { name: "Translate itinerary to Tiếng Việt" }),
    );
    await screen.findByRole("option", { name: "Tiếng Việt" });
    expect(
      api.request.mock.calls.filter((call) => call[2] !== undefined),
    ).toHaveLength(1);
    expect(api.request).toHaveBeenCalledWith(
      "itinerary/one/translations",
      "fixture-token",
      { target_locale: "vi", source_version: "hash-one" },
    );
  });
  it("ignores a late translation response after the source changes", async () => {
    let resolvePost!: (value: unknown) => void;
    api.request.mockImplementation(
      (_path: string, _token: string, body?: unknown) =>
        body
          ? new Promise((resolve) => {
              resolvePost = resolve;
            })
          : Promise.resolve({
              source: plan,
              source_version: "hash-one",
              translations: [],
            }),
    );
    const rendered = render(view());
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Translate itinerary to Tiếng Việt",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Translate itinerary to Tiếng Việt" }),
    );
    const newer = { ...plan, version: 2, overview: "Changed description" };
    api.request.mockImplementation(async () => ({
      source: newer,
      source_version: "hash-two",
      translations: [],
    }));
    rendered.rerender(view(newer));
    await act(async () => resolvePost({ translation }));
    expect(screen.queryByRole("option", { name: "Tiếng Việt" })).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});

describe("automatic itinerary translations", () => {
  it("automatically enqueues and applies a missing translation after selecting VI", async () => {
    let started = false;
    api.request.mockImplementation(
      async (path: string, _token: string, body?: unknown) => {
        if (body) {
          started = true;
          return { job_id: "auto-job" };
        }
        if (path.includes("jobs/")) return { status: "complete" };
        return {
          source: plan,
          source_version: "hash-one",
          translations: started ? [translation] : [],
        };
      },
    );
    render(view());
    await waitFor(() => expect(api.request).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "VI", exact: true }));
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({
        ...plan,
        overview: "Mô tả tiếng Việt",
      }),
    );
    expect(
      api.request.mock.calls.filter((call) => call[2] !== undefined),
    ).toHaveLength(1);
  });
  it("automatically translates a Vietnamese source when opening it in English", async () => {
    const source = { ...plan, locale: "vi" as const, overview: "Mô tả gốc" };
    api.request.mockImplementation(
      async (_path: string, _token: string, body?: unknown) =>
        body
          ? {
              translation: {
                ...translation,
                target_locale: "en",
                texts: { overview: "English description" },
              },
            }
          : { source, source_version: "hash-one", translations: [] },
    );
    render(view(source));
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({
        ...source,
        overview: "English description",
      }),
    );
    expect(
      api.request.mock.calls.filter((call) => call[2] !== undefined),
    ).toHaveLength(1);
  });
  it("shows the original-language notice on failure and retries only on request", async () => {
    api.request.mockImplementation(
      async (_path: string, _token: string, body?: unknown) => {
        if (body) throw new Error("translation offline");
        return { source: plan, source_version: "hash-one", translations: [] };
      },
    );
    render(view());
    await waitFor(() => expect(api.request).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "VI", exact: true }));
    await screen.findByRole("alert");
    expect(
      screen.getByText(/Nội dung lịch trình đang hiển thị bằng ngôn ngữ gốc/),
    ).toBeTruthy();
    expect(
      api.request.mock.calls.filter((call) => call[2] !== undefined),
    ).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Thử dịch lại" }));
    await waitFor(() =>
      expect(
        api.request.mock.calls.filter((call) => call[2] !== undefined),
      ).toHaveLength(2),
    );
  });
  it("does not show a late translation for the wrong selected language or submit duplicates", async () => {
    let resolve!: (value: unknown) => void;
    api.request.mockImplementation(
      (_path: string, _token: string, body?: unknown) =>
        body
          ? new Promise((r) => {
              resolve = r;
            })
          : Promise.resolve({
              source: plan,
              source_version: "hash-one",
              translations: [],
            }),
    );
    render(view());
    await waitFor(() => expect(api.request).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "VI", exact: true }));
    await waitFor(() => expect(resolve).toBeTypeOf("function"));
    fireEvent.click(screen.getByRole("button", { name: "EN", exact: true }));
    await act(async () => resolve({ translation }));
    expect(onChange).toHaveBeenLastCalledWith(null);
    fireEvent.click(screen.getByRole("button", { name: "VI", exact: true }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...plan,
      overview: "Mô tả tiếng Việt",
    });
    expect(
      api.request.mock.calls.filter((call) => call[2] !== undefined),
    ).toHaveLength(1);
  });
});
