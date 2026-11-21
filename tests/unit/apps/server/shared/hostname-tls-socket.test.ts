import { EventEmitter } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock("node:tls", () => ({ connect: mocks.connect }));
import { hostnameTlsSocket } from "../../../../../apps/server/src/shared/infrastructure/hostname-tls-socket";

let socket: EventEmitter & { destroy: ReturnType<typeof vi.fn> };
beforeEach(() => {
  vi.useFakeTimers();
  socket = Object.assign(new EventEmitter(), { destroy: vi.fn() });
  mocks.connect.mockReset().mockReturnValue(socket);
});
afterEach(() => vi.useRealTimers());
it("passes the hostname to TLS and hands off only after certificate validation succeeds", () => {
  const callback = vi.fn();
  hostnameTlsSocket("smtp.test.invalid", 465)({}, callback);
  expect(mocks.connect).toHaveBeenCalledWith({ host: "smtp.test.invalid", port: 465, servername: "smtp.test.invalid", rejectUnauthorized: true });
  expect(callback).not.toHaveBeenCalled();
  socket.emit("secureConnect");
  expect(callback).toHaveBeenCalledWith(null, { connection: socket, secured: true });
  vi.advanceTimersByTime(15_000);
  expect(socket.destroy).not.toHaveBeenCalled();
  expect(callback).toHaveBeenCalledTimes(1);
});
it("destroys failed sockets and reports TLS errors once without a secured handoff", () => {
  const callback = vi.fn();
  hostnameTlsSocket("smtp.test.invalid", 465)({}, callback);
  const failure = new Error("Certificate rejected");
  socket.emit("error", failure);
  socket.emit("secureConnect");
  vi.advanceTimersByTime(15_000);
  expect(socket.destroy).toHaveBeenCalledOnce();
  expect(callback).toHaveBeenCalledExactlyOnceWith(failure, undefined);
});
it("bounds the handshake wait and cleans up the socket on timeout", () => {
  const callback = vi.fn();
  hostnameTlsSocket("smtp.test.invalid", 465)({}, callback);
  vi.advanceTimersByTime(10_000);
  socket.emit("secureConnect");
  expect(callback).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ code: "ETIMEDOUT" }), undefined);
  expect(socket.destroy).toHaveBeenCalledOnce();
});
it("handles synchronous runtime connection errors", () => {
  const failure = new Error("Socket unavailable");
  mocks.connect.mockImplementation(() => { throw failure; });
  const callback = vi.fn();
  hostnameTlsSocket("smtp.test.invalid", 465)({}, callback);
  expect(callback).toHaveBeenCalledExactlyOnceWith(failure, undefined);
});
