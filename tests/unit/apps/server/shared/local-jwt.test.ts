import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalJwtService } from "../../../../../apps/server/src/shared/nest/local-jwt";
const jwt = new LocalJwtService({
  jwtSecret: "unit-test-secret-at-least-32-characters",
} as never);
afterEach(() => vi.useRealTimers());
describe("local JWT verification", () => {
  it("accepts issued tokens and rejects tampered payloads", () => {
    const token = jwt.sign({ sub: "owner" }, { expiresIn: 60 });
    expect(jwt.verify(token)?.sub).toBe("owner");
    const [header, , signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "admin" })).toString(
      "base64url",
    );
    expect(jwt.verify(`${header}.${forged}.${signature}`)).toBeNull();
  });
  it("rejects expired tokens", () => {
    vi.useFakeTimers();
    const token = jwt.sign({ sub: "owner" }, { expiresIn: 60 });
    vi.advanceTimersByTime(61000);
    expect(jwt.verify(token)).toBeNull();
  });
  it("rejects tokens at the exact expiration second", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const token = jwt.sign({ sub: "owner" }, { expiresIn: 60 });
    vi.advanceTimersByTime(60000);
    expect(jwt.verify(token)).toBeNull();
  });
  it("rejects tokens signed with a different secret", () => {
    const attacker = new LocalJwtService({
      jwtSecret: "attacker-secret",
    } as never);
    expect(
      jwt.verify(attacker.sign({ sub: "owner" }, { expiresIn: 60 })),
    ).toBeNull();
  });
  it("rejects unsigned tokens using alg=none", () => {
    const header = Buffer.from(
      JSON.stringify({ alg: "none", typ: "JWT" }),
    ).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ sub: "admin" })).toString(
      "base64url",
    );
    expect(jwt.verify(`${header}.${payload}.`)).toBeNull();
  });
  it.each(["", "not-a-token", "a.b", "a.b.c.d", "a.b.c"])(
    "rejects malformed token %s without throwing",
    (token) => {
      expect(jwt.verify(token)).toBeNull();
    },
  );
});
