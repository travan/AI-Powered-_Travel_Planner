// @vitest-environment jsdom
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlannerDatePicker } from "../../../../../../apps/web/components/plan/PlannerDatePicker";
import { LanguageProvider } from "../../../../../../apps/web/components/i18n/LanguageProvider";
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(cleanup);
describe("custom planner calendar", () => {
  it("disables departure and earlier days for return and emits a local ISO date", () => {
    const onChange = vi.fn();
    render(
      <LanguageProvider initialLocale="en">
        <PlannerDatePicker
          label="Return date"
          value="2027-01-01"
          min="2027-01-01"
          className=""
          onChange={onChange}
        />
      </LanguageProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Return date" }));
    expect(
      screen.getByRole("dialog", { name: "Calendar: Return date" }),
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: /December 31/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /January 2nd/ }));
    expect(onChange).toHaveBeenCalledWith("2027-01-02");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("supports Vietnamese and closes without changing the selected day", () => {
    const onChange = vi.fn();
    render(
      <LanguageProvider initialLocale="vi">
        <PlannerDatePicker
          label="Ngày đi"
          value="2027-01-02"
          className=""
          onChange={onChange}
        />
      </LanguageProvider>,
    );
    expect((screen.getByLabelText("Ngày đi") as HTMLInputElement).value).toBe(
      "02/01/2027",
    );
    fireEvent.click(screen.getByRole("button", { name: "Chọn Ngày đi" }));
    fireEvent.click(screen.getByRole("button", { name: "Đóng" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
