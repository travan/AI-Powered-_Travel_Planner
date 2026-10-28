// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../../../../../apps/web/lib/supabase/client", () => ({
  createClient: vi.fn(),
}));
import { AuthExperience } from "../../../../../apps/web/components/auth/AuthExperience";
import { LanguageProvider } from "../../../../../apps/web/components/i18n/LanguageProvider";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("friendly auth placeholders", () => {
  it.each([
    ["en", "you@example.com", "Enter your password"],
    ["vi", "ban@example.com", "Nhập mật khẩu của bạn"],
  ] as const)(
    "renders real %s text instead of translation keys",
    (locale, email, password) => {
      vi.stubGlobal("React", React);
      render(
        <LanguageProvider initialLocale={locale}>
          <AuthExperience mode="login" />
        </LanguageProvider>,
      );
      expect(screen.getByPlaceholderText(email)).toBeTruthy();
      expect(screen.getByPlaceholderText(password)).toBeTruthy();
      expect(screen.queryByPlaceholderText("email_placeholder")).toBeNull();
      expect(screen.queryByPlaceholderText("password_placeholder")).toBeNull();
    },
  );
});
