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
const mock = vi.hoisted(() => ({ list: vi.fn(), session: vi.fn() }));
vi.mock("../../../../../../apps/web/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getSession: mock.session } }),
}));
vi.mock("../../../../../../apps/web/lib/journey-api", () => ({
  getPlanningRequests: mock.list,
}));
import { RecentPlanningRequests } from "../../../../../../apps/web/components/plan/RecentPlanningRequests";
import { LanguageProvider } from "../../../../../../apps/web/components/i18n/LanguageProvider";

const request = {
  id: "job-old",
  status: "queued",
  stage: "queued",
  attempts: 0,
  city_names: ["Đà Nẵng"],
  num_days: 3,
  created_at: "2026-10-29T03:00:00Z",
};
const show = () =>
  render(
    <LanguageProvider initialLocale="vi">
      <RecentPlanningRequests />
    </LanguageProvider>,
  );
beforeEach(() => {
  mock.list.mockReset().mockResolvedValue([]);
  mock.session.mockReset().mockResolvedValue({
    data: { session: { access_token: "account-token" } },
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe("reopening planning requests", () => {
  it("loads existing server requests after returning and opens each status or result", async () => {
    mock.list.mockResolvedValue([
      request,
      {
        ...request,
        id: "finished",
        status: "complete",
        itinerary_id: "saved-result",
      },
      { ...request, id: "failed", status: "failed" },
    ]);
    const view = show();
    await screen.findByText("Yêu cầu gần đây");
    expect(mock.list.mock.calls[0][0]).toBe("account-token");
    expect(
      screen
        .getAllByRole("link", { name: "Xem trạng thái" })
        .map((a) => a.getAttribute("href")),
    ).toEqual(["/plan/jobs/job-old", "/plan/jobs/failed"]);
    expect(
      screen.getByRole("link", { name: "Xem kết quả" }).getAttribute("href"),
    ).toBe("/itinerary/saved-result");
    view.unmount();
    show();
    await screen.findByText("Yêu cầu gần đây");
    expect(mock.list).toHaveBeenCalledTimes(2);
  });
  it("refreshes queued requests until the result becomes available", async () => {
    vi.useFakeTimers();
    mock.list
      .mockResolvedValueOnce([request])
      .mockResolvedValue([
        { ...request, status: "complete", itinerary_id: "ready" },
      ]);
    show();
    await act(async () => {});
    expect(screen.getByText(/Đang chờ xử lý/)).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(
      screen.getByRole("link", { name: "Xem kết quả" }).getAttribute("href"),
    ).toBe("/itinerary/ready");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(mock.list).toHaveBeenCalledTimes(2);
  });
  it("allows retrying a history load failure", async () => {
    mock.list
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue([request]);
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getByRole("link", { name: "Xem trạng thái" })).toBeTruthy();
  });
  it("does not fetch account history while signed out", async () => {
    mock.session.mockResolvedValue({ data: { session: null } });
    show();
    await act(async () => {});
    expect(mock.list).not.toHaveBeenCalled();
    expect(screen.queryByText("Yêu cầu gần đây")).toBeNull();
  });
});
