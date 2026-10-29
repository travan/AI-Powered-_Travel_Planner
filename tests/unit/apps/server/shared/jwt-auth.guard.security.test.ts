import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { JwtAuthGuard } from "../../../../../apps/server/src/shared/nest/jwt-auth.guard";
import { LocalJwtService } from "../../../../../apps/server/src/shared/nest/local-jwt";

function setup(authorization?: string, active = true) {
  const jwt = new LocalJwtService({
    jwtSecret: "security-test-secret-with-32-characters",
  } as never);
  const query = vi.fn().mockResolvedValue({ rows: [{ active }] });
  const request = { headers: { authorization }, user: undefined };
  const context = { switchToHttp: () => ({ getRequest: () => request }) };
  const guard = new JwtAuthGuard(
    jwt,
    { mockTokensEnabled: false } as never,
    { query } as never,
  );
  return { jwt, query, request, context, guard };
}

describe("authentication guard security", () => {
  it.each([
    undefined,
    "",
    "Basic secret",
    "Bearer ",
    "mock-access-admin",
    "Bearer mock-access-admin",
    "Bearer mock-mobile-access-admin",
  ])(
    "rejects missing, malformed and disabled mock credentials: %s",
    async (header) => {
      const { guard, context, request, query } = setup(header);
      await expect(guard.canActivate(context as never)).rejects.toMatchObject({
        status: 401,
      });
      expect(request.user).toBeUndefined();
      expect(query).not.toHaveBeenCalled();
    },
  );

  it("authenticates only after checking a hashed token against active server sessions", async () => {
    const { guard, jwt, request, query, context } = setup();
    const token = jwt.sign(
      { sub: "user-1", email: "user@test.invalid" },
      { expiresIn: 60 },
    );
    request.headers.authorization = `Bearer ${token}`;
    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(request.user).toEqual({ sub: "user-1", email: "user@test.invalid" });
    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("revoked_at is null");
    expect(sql).toContain("expires_at > now()");
    expect(parameters).toEqual([
      createHash("sha256").update(token).digest("hex"),
    ]);
    expect(sql).not.toContain(token);
  });

  it("rejects signed tokens with no active session (revoked, expired or unknown)", async () => {
    const { guard, jwt, request, context } = setup(undefined, false);
    request.headers.authorization = `Bearer ${jwt.sign({ sub: "user-1" }, { expiresIn: 60 })}`;
    await expect(guard.canActivate(context as never)).rejects.toMatchObject({
      status: 401,
    });
    expect(request.user).toBeUndefined();
  });

  it.each([{}, { sub: 42 }, { sub: "" }])(
    "rejects invalid identity claims: %j",
    async (claims) => {
      const { guard, jwt, request, context, query } = setup();
      request.headers.authorization = `Bearer ${jwt.sign(claims, { expiresIn: 60 })}`;
      await expect(guard.canActivate(context as never)).rejects.toMatchObject({
        status: 401,
      });
      expect(query).not.toHaveBeenCalled();
    },
  );

  it("fails closed if the session database is unavailable", async () => {
    const { guard, jwt, request, context, query } = setup();
    request.headers.authorization = `Bearer ${jwt.sign({ sub: "user-1" }, { expiresIn: 60 })}`;
    query.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(guard.canActivate(context as never)).rejects.toThrow();
    expect(request.user).toBeUndefined();
  });

  it("rejects an expired JWT before looking up its session", async () => {
    const { guard, jwt, request, context, query } = setup();
    request.headers.authorization = `Bearer ${jwt.sign({ sub: "user-1" }, { expiresIn: -60 })}`;
    await expect(guard.canActivate(context as never)).rejects.toMatchObject({
      status: 401,
    });
    expect(query).not.toHaveBeenCalled();
  });
});
