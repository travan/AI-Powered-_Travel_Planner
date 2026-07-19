/** @vitest-environment jsdom */
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSSE } from "../../../../../apps/web/hooks/useSSE";

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  listeners = new Map<string, (event: MessageEvent) => void>();
  onerror: (() => void) | null = null;
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, handler: (event: MessageEvent) => void) {
    this.listeners.set(type, handler);
  }

  emit(type: string, data: unknown) {
    const handler = this.listeners.get(type);
    if (handler) {
      handler({ data: JSON.stringify(data) } as MessageEvent);
    }
  }
}

describe("useSSE", () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://127.0.0.1:3101");
    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("connects to stream and dispatches typed handlers", () => {
    const onQueued = vi.fn();
    const onComplete = vi.fn();

    renderHook(() =>
      useSSE("job-1", {
        queued: onQueued,
        complete: onComplete,
      })
    );

    expect(MockEventSource.instances).toHaveLength(1);
    const source = MockEventSource.instances[0]!;
    expect(source.url).toBe("http://127.0.0.1:3101/api/itinerary/stream/job-1");

    source.emit("queued", { status: "queued" });
    source.emit("complete", { itinerary_id: "it-1" });

    expect(onQueued).toHaveBeenCalledWith({ status: "queued" });
    expect(onComplete).toHaveBeenCalledWith({ itinerary_id: "it-1" });
  });

  it("does not connect when jobId is null and closes stream on cleanup/error", () => {
    const { unmount, rerender } = renderHook(
      ({ jobId }) => useSSE(jobId, { queued: vi.fn() }),
      { initialProps: { jobId: null as string | null } }
    );

    expect(MockEventSource.instances).toHaveLength(0);

    rerender({ jobId: "job-2" });
    expect(MockEventSource.instances).toHaveLength(1);

    const source = MockEventSource.instances[0]!;
    source.onerror?.();
    expect(source.close).toHaveBeenCalledTimes(1);

    unmount();
    expect(source.close).toHaveBeenCalledTimes(1);
  });
});
