/** @vitest-environment jsdom */
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCitySearch } from "../../../../../packages/hooks/src/useCitySearch";
import { usePopularCities } from "../../../../../packages/hooks/src/usePopularCities";

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

    expect(result.current.loading).toBe(true);

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
    expect(result.current.loading).toBe(false);
  });

  it("useCitySearch ignores stale responses when the query changes", async () => {
    let resolveFirst!: (value: Response) => void;
    const firstRequest = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });

    vi.spyOn(globalThis, "fetch" as never)
      .mockReturnValueOnce(firstRequest as never)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ slug: "danang", name: { en: "Da Nang" } }],
      } as Response);

    const { result, rerender } = renderHook(
      ({ query }) => useCitySearch(query, "http://api.test", 5),
      { initialProps: { query: "to" } }
    );

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    rerender({ query: "da" });

    await waitFor(() => {
      expect(result.current.suggestions).toEqual([{ slug: "danang", name: { en: "Da Nang" } }]);
      expect(result.current.loading).toBe(false);
    });

    resolveFirst({
      ok: true,
      json: async () => [{ slug: "tokyo", name: { en: "Tokyo" } }],
    } as Response);

    await Promise.resolve();
    expect(result.current.suggestions).toEqual([{ slug: "danang", name: { en: "Da Nang" } }]);
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
