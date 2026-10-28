// @vitest-environment jsdom
import React, { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JourneyPreferences } from "../../../../../../apps/web/components/plan/JourneyPreferences";
import { DEFAULT_PLANNING_PREFERENCES } from "../../../../../../apps/web/lib/planning-preferences";

function Form() {
  const [value, onChange] = useState({ ...DEFAULT_PLANNING_PREFERENCES });
  return <JourneyPreferences value={value} onChange={onChange} />;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("browser origin and journey preferences", () => {
  it("requests location only on click and keeps edits made while locating", () => {
    let success!: PositionCallback;
    const getCurrentPosition = vi.fn((callback: PositionCallback) => {
      success = callback;
    });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });
    render(<Form />);
    expect(getCurrentPosition).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Use browser location" }),
    );
    fireEvent.change(
      screen.getByLabelText("Local restaurants and dietary needs"),
      { target: { value: "Vegetarian" } },
    );
    act(() =>
      success({
        coords: { latitude: 10.762622, longitude: 106.660172, accuracy: 150 },
      } as GeolocationPosition),
    );
    expect(
      (screen.getByLabelText("Starting point") as HTMLInputElement).value,
    ).toContain("10.763, 106.660");
    expect(
      (
        screen.getByLabelText(
          "Local restaurants and dietary needs",
        ) as HTMLInputElement
      ).value,
    ).toBe("Vegetarian");
  });
  it("lets travelers enter origin manually after permission denial", () => {
    const getCurrentPosition = vi.fn((_success, error) => error({ code: 1 }));
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });
    render(<Form />);
    fireEvent.click(
      screen.getByRole("button", { name: "Use browser location" }),
    );
    expect(screen.getByRole("status").textContent).toContain(
      "permission was denied",
    );
    fireEvent.change(screen.getByLabelText("Starting point"), {
      target: { value: "Hanoi" },
    });
    expect(
      (screen.getByLabelText("Starting point") as HTMLInputElement).value,
    ).toBe("Hanoi");
  });
  it("shows a separate endpoint for journeys that do not return home", () => {
    render(<Form />);
    expect(screen.queryByLabelText("Final destination")).toBeNull();
    fireEvent.click(screen.getByLabelText("Return to starting point"));
    expect(screen.getByLabelText("Final destination")).toBeTruthy();
  });
});
