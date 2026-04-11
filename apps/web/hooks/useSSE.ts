import { useEffect, useRef, useCallback } from "react";
import type { SSEEventType } from "@travel/types";

type SSEHandler = (data: unknown) => void;

export function useSSE(
  jobId: string | null,
  handlers: Partial<Record<SSEEventType, SSEHandler>>
) {
  const evtSourceRef = useRef<EventSource | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const connect = useCallback(() => {
    if (!jobId || evtSourceRef.current) return;

    const apiUrl = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";
    const url = `${apiUrl}/api/itinerary/stream/${jobId}`;

    const es = new EventSource(url);
    evtSourceRef.current = es;

    const eventTypes: SSEEventType[] = [
      "queued",
      "processing",
      "overview_ready",
      "city_ready",
      "transport_ready",
      "restaurants_ready",
      "complete",
      "error",
    ];

    for (const type of eventTypes) {
      es.addEventListener(type, (e: MessageEvent) => {
        const handler = handlersRef.current[type];
        if (handler) {
          handler(JSON.parse(e.data as string) as unknown);
        }
      });
    }

    es.onerror = () => {
      es.close();
      evtSourceRef.current = null;
    };
  }, [jobId]);

  useEffect(() => {
    connect();
    return () => {
      evtSourceRef.current?.close();
      evtSourceRef.current = null;
    };
  }, [connect]);
}
