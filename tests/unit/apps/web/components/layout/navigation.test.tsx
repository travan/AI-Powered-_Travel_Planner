// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const route = vi.hoisted(() => ({ pathname: "/plan" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("../../../../../../apps/web/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  }),
}));
vi.mock("../../../../../../apps/web/components/layout/AccountMenu", () => ({
  AccountMenu: () => null,
}));
import { SiteHeader } from "../../../../../../apps/web/components/layout/SiteHeader";
import { BottomNav } from "../../../../../../apps/web/components/layout/BottomNav";
import { LanguageProvider } from "../../../../../../apps/web/components/i18n/LanguageProvider";
const links = (id: string) =>
  [...screen.getByTestId(id).querySelectorAll("a")].map((link) => ({
    href: link.getAttribute("href"),
    label: link.textContent?.trim(),
    current: link.getAttribute("aria-current"),
  }));
beforeEach(() => {
  route.pathname = "/plan";
});
afterEach(cleanup);
describe("shared primary navigation", () => {
  it("uses the same destinations and labels on desktop and mobile in both languages", () => {
    render(
      <LanguageProvider initialLocale="vi">
        <SiteHeader />
        <BottomNav />
      </LanguageProvider>,
    );
    const desktop = links("desktop-navigation");
    const mobile = links("mobile-navigation").map((link) => ({
      ...link,
      label: link.label?.replace(
        /^(route|flight_takeoff|explore|menu_book)\s*/,
        "",
      ),
    }));
    expect(mobile).toEqual(desktop);
    expect(desktop.map((link) => link.href)).toEqual([
      "/plan",
      "/trips",
      "/explore",
      "/guides",
    ]);
    expect(desktop.map((link) => link.label)).toEqual([
      "Lập kế hoạch",
      "Chuyến đi của tôi",
      "Khám phá",
      "Cẩm nang",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "EN", exact: true }));
    expect(links("desktop-navigation").map((link) => link.label)).toEqual([
      "Plan",
      "My trips",
      "Explore",
      "Guides",
    ]);
    expect(links("mobile-navigation").map((link) => link.href)).toEqual(
      desktop.map((link) => link.href),
    );
  });
  it("marks the same active destination on nested trip screens", () => {
    route.pathname = "/trips/trip-1/workspace";
    render(
      <LanguageProvider initialLocale="en">
        <SiteHeader />
        <BottomNav />
      </LanguageProvider>,
    );
    for (const id of ["desktop-navigation", "mobile-navigation"])
      expect(
        links(id)
          .filter((link) => link.current === "page")
          .map((link) => link.href),
      ).toEqual(["/trips"]);
  });
});
