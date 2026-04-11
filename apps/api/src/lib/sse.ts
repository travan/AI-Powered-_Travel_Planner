import type { FastifyReply } from "fastify";
import type { SSEEventType } from "@travel/types";

/**
 * Initialize an SSE response.
 * Headers must be set before any data is written.
 */
export function initSSE(reply: FastifyReply): void {
  reply.raw.setHeader("Content-Type", "text/event-stream");
  reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
  reply.raw.setHeader("Connection", "keep-alive");
  reply.raw.setHeader("X-Accel-Buffering", "no"); // disable Nginx buffering
  reply.raw.flushHeaders();
}

/**
 * Write a single SSE event to the response stream.
 */
export function sendSSEEvent(
  reply: FastifyReply,
  event: SSEEventType,
  data: unknown
): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  reply.raw.write(payload);
}

/**
 * Close the SSE stream gracefully.
 */
export function closeSSE(reply: FastifyReply): void {
  reply.raw.end();
}

/**
 * Send a heartbeat comment to keep the connection alive.
 */
export function sendHeartbeat(reply: FastifyReply): void {
  reply.raw.write(": heartbeat\n\n");
}
