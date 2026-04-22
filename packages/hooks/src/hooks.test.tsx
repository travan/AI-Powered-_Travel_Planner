/** @vitest-environment jsdom */
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCitySearch } from "./useCitySearch";
import { usePopularCities } from "./usePopularCities";

describe("hooks package", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("useCitySearch debounces requests and stores suggestions", async () => {
    vi.spyOn(globalThis, "fetch" as never).mockResolvedValue({
      ok: true,
      json: async () => [{ slug: "tokyo", name: { en: "Tokyo" } }],
    } as Response);

    const { result } = renderHook(() => useCitySearch("to", "http://api.test", 5));

    expect(result.current.loading).toBe(false);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.suggestions).toEqual([{ slug: "tokyo", name: { en: "Tokyo" } }]);
    }, { timeout: 2000 });
  });

  it("useCitySearch clears when query is short or request fails", async () => {
    vi.spyOn(globalThis, "fetch" as never).mockRejectedValue(new Error("network"));
    const { result, rerender } = renderHook(
      ({ query }) => useCitySearch(query, "http://api.test", 5),
      { initialProps: { query: "to" } }
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.suggestions).toEqual([]);
    }, { timeout: 2000 });

    rerender({ query: "" });
    expect(result.current.suggestions).toEqual([]);
  });

  it("usePopularCities resolves list and computes locale fallback", async () => {
    vi.spyOn(globalThis, "fetch" as never).mockResolvedValue({
      ok: true,
      json: async () => [
        { slug: "hcm", name: { vi: "TP.HCM", en: "Ho Chi Minh City" } },
        { slug: "ny", name: { fr: "New York" } },
      ],
    } as Response);

    const { result } = renderHook(() => usePopularCities("http://api.test", "vi"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.cities).toHaveLength(2);
    }, { timeout: 2000 });

    expect(result.current.getDisplayName(result.current.cities[0]!)).toBe("TP.HCM");
    expect(result.current.getDisplayName(result.current.cities[1]!)).toBe("New York");
  });

  it("usePopularCities exposes error state on failure", async () => {
    vi.spyOn(globalThis, "fetch" as never).mockResolvedValue({ ok: false } as Response);

    const { result } = renderHook(() => usePopularCities("http://api.test"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.cities).toEqual([]);
      expect(result.current.error).toBe("Failed to fetch popular cities");
    }, { timeout: 2000 });
  });
});
