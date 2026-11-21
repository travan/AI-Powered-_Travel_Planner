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
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Itinerary } from "@travel/types";
const api = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../../../../../../apps/web/lib/journey-api", () => ({
  journeyRequest: api.request,
}));
import { PlanningSelections } from "../../../../../../apps/web/components/trips/PlanningSelections";
import { LanguageProvider } from "../../../../../../apps/web/components/i18n/LanguageProvider";
const plan = {
  version: 3,
  locked_ids: [],
  days: [{ day_number: 1, activities: [{ id: "park", name: "SkyPark" }] }],
} as unknown as Itinerary;
const checklist = [
  { id: "visa", title: "Confirm visa", status: "todo" },
  { id: "tickets", title: "Confirm tickets", status: "todo" },
];
const onSaved = vi.fn();
const onDirtyChange = vi.fn();
function view(source = plan, canEdit = true) {
  return (
    <LanguageProvider initialLocale="en">
      <PlanningSelections
        tripId="trip"
        token="token"
        plan={source}
        checklist={checklist}
        canEdit={canEdit}
        onSaved={onSaved}
        onDirtyChange={onDirtyChange}
      />
    </LanguageProvider>
  );
}
beforeEach(() => {
  api.request.mockReset();
  onSaved.mockReset();
  onDirtyChange.mockReset();
});
afterEach(cleanup);
it("keeps every checkbox local and commits the completed selection in a single request", async () => {
  let resolve!: (value: unknown) => void;
  api.request.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  render(view());
  fireEvent.click(screen.getByLabelText("Confirm visa"));
  fireEvent.click(screen.getByLabelText("Confirm tickets"));
  fireEvent.click(screen.getByLabelText("Day 1: SkyPark"));
  expect(api.request).not.toHaveBeenCalled();
  expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  fireEvent.click(screen.getByRole("button", { name: "Save selections" }));
  expect(api.request).toHaveBeenCalledOnce();
  expect(api.request).toHaveBeenCalledWith(
    "trips/trip/planning",
    "token",
    {
      expected_version: 3,
      locked_ids: ["park"],
      checklist_updates: [
        { id: "visa", status: "done", expected_status: "todo" },
        { id: "tickets", status: "done", expected_status: "todo" },
      ],
    },
    "PATCH",
    expect.any(AbortSignal),
  );
  expect(onSaved).not.toHaveBeenCalled();
  await act(async () => resolve({ ...plan, version: 4, locked_ids: ["park"] }));
  expect(onSaved).toHaveBeenCalledOnce();
  expect(screen.getByText("Selections saved.")).toBeTruthy();
  expect(onDirtyChange).toHaveBeenLastCalledWith(false);
});
it("discards selections and checkbox round trips without sending notifications or writes", () => {
  render(view());
  fireEvent.click(screen.getByLabelText("Confirm visa"));
  fireEvent.click(screen.getByLabelText("Confirm visa"));
  expect(
    (
      screen.getByRole("button", {
        name: "Save selections",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByLabelText("Confirm tickets"));
  fireEvent.click(screen.getByLabelText("Day 1: SkyPark"));
  fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
  expect(
    (screen.getByLabelText("Confirm tickets") as HTMLInputElement).checked,
  ).toBe(false);
  expect(
    (screen.getByLabelText("Day 1: SkyPark") as HTMLInputElement).checked,
  ).toBe(false);
  expect(api.request).not.toHaveBeenCalled();
});
it("keeps failed selections for an explicit retry and freezes the original version during editing", async () => {
  api.request
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({ ...plan, version: 5 });
  const displayed = render(view());
  fireEvent.click(screen.getByLabelText("Confirm visa"));
  displayed.rerender(view({ ...plan, version: 4 }));
  fireEvent.click(screen.getByRole("button", { name: "Save selections" }));
  await screen.findByRole("alert");
  expect(
    (screen.getByLabelText("Confirm visa") as HTMLInputElement).checked,
  ).toBe(true);
  expect(api.request.mock.calls[0]![2].expected_version).toBe(3);
  expect(api.request).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Save selections" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(api.request).toHaveBeenCalledTimes(2);
});
it("does not let viewers save selections", () => {
  render(view(plan, false));
  expect(
    (screen.getByLabelText("Confirm visa") as HTMLInputElement).disabled,
  ).toBe(true);
  expect(screen.queryByRole("button", { name: "Save selections" })).toBeNull();
  expect(api.request).not.toHaveBeenCalled();
});

it("ignores a completed save after leaving the current trip", async () => {
  let resolve!: (value: unknown) => void;
  api.request.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const displayed = render(view());
  fireEvent.click(screen.getByLabelText("Confirm visa"));
  fireEvent.click(screen.getByRole("button", { name: "Save selections" }));
  const signal = api.request.mock.calls[0]![4] as AbortSignal;
  displayed.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => resolve({ ...plan, version: 4 }));
  expect(onSaved).not.toHaveBeenCalled();
});
