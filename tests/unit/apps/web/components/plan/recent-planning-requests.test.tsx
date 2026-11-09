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
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(mock.list.mock.calls[0][0]).toBe("account-token");
    expect(
      screen
        .getAllByRole("link", { name: "Xem trạng thái" })
        .map((a) => a.getAttribute("href")),
    ).toEqual(["/plan/jobs/job-old"]);
    expect(screen.queryByText("Thất bại")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Xem kết quả" }).getAttribute("href"),
    ).toBe("/itinerary/saved-result");
    view.unmount();
    show();
    await screen.findByText("Yêu cầu gần đây");
    expect(mock.list).toHaveBeenCalledTimes(2);
  });
  it("hides the section when every request failed", async () => {
    mock.list.mockResolvedValue([{ ...request, status: "failed" }]);
    show();
    await act(async () => {});
    expect(mock.list).toHaveBeenCalledOnce();
    expect(screen.queryByRole("region")).toBeNull();
  });
  it("removes requests that fail during polling and recalculates pagination", async () => {
    vi.useFakeTimers();
    const rows = Array.from({ length: 4 }, (_, index) => ({
      ...request,
      id: `job-${index}`,
      city_names: [`City ${index}`],
    }));
    mock.list.mockResolvedValueOnce(rows).mockResolvedValue(
      rows.map((row, index) => ({
        ...row,
        status: index === 0 ? "complete" : "failed",
      })),
    );
    show();
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Trang sau" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("City 0")).toBeTruthy();
    expect(screen.queryByText("City 3")).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(mock.list).toHaveBeenCalledTimes(2);
  });
  it("shows at most three requests per page and supports moving both ways", async () => {
    mock.list.mockResolvedValue(
      Array.from({ length: 7 }, (_, index) => ({
        ...request,
        id: `job-${index}`,
        city_names: [`City ${index}`],
      })),
    );
    show();
    await screen.findByText("City 0");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.queryByText("City 3")).toBeNull();
    expect(screen.getByText("Trang 1/3")).toBeTruthy();
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Trang trước" })
        .disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Trang sau" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("City 3")).toBeTruthy();
    expect(screen.queryByText("City 0")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Trang sau" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("City 6")).toBeTruthy();
    expect(screen.getByText("Trang 3/3")).toBeTruthy();
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Trang sau" })
        .disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Trang trước" }));
    expect(screen.getByText("City 3")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
  it("keeps the selected page during refresh and adjusts it if requests disappear", async () => {
    vi.useFakeTimers();
    const rows = Array.from({ length: 4 }, (_, index) => ({
      ...request,
      id: `job-${index}`,
      city_names: [`City ${index}`],
    }));
    mock.list
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce(rows)
      .mockResolvedValue([request]);
    show();
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Trang sau" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(screen.getByText("Trang 2/2")).toBeTruthy();
    expect(screen.getByText("City 3")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(screen.getByText("Đà Nẵng")).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();
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
