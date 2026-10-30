import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "../../../../../../apps/server/src/modules/auth/application/auth.service";
import { LocalJwtService } from "../../../../../../apps/server/src/shared/nest/local-jwt";

const user = {
  id: "user-1",
  email: "user@test.invalid",
  fullName: "Traveler",
  avatarUrl: null,
  provider: "local" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
};
const dto = { email: user.email, password: "Private-password-93!" };
afterEach(() => vi.useRealTimers());
function setup() {
  const repository = {
    verifyLocalCredentials: vi.fn().mockResolvedValue(user),
    createSession: vi.fn().mockResolvedValue({ expiresAt: 1234567890 }),
    revokeSession: vi.fn().mockResolvedValue(undefined),
  };
  const jwt = new LocalJwtService({
    jwtSecret: "security-test-secret-with-32-characters",
  } as never);
  return { service: new AuthService(repository as never), repository, jwt };
}

describe("login session security", () => {
  it("does not create a session for invalid credentials or an unknown user", async () => {
    const { service, repository, jwt } = setup();
    repository.verifyLocalCredentials.mockResolvedValueOnce(null as never);
    await expect(service.login({ dto, jwt })).resolves.toMatchObject({
      ok: false,
      error: { statusCode: 401, apiCode: "invalid_credentials" },
    });
    expect(repository.createSession).not.toHaveBeenCalled();
  });

  it("issues a fresh token on every login, including logins in the same second", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const { service, jwt, repository } = setup();
    const first = await service.login({ dto, jwt });
    const second = await service.login({ dto, jwt });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error("Expected successful login");
    expect(first.value.session.access_token).not.toBe(
      second.value.session.access_token,
    );
    expect(jwt.verify(first.value.session.access_token)).toMatchObject({
      sub: user.id,
      jti: expect.any(String),
    });
    expect(repository.createSession).toHaveBeenCalledWith({
      userId: user.id,
      token: first.value.session.access_token,
      refreshToken: first.value.session.refresh_token,
    });
    expect(first.value.session.expires_in).toBe(900);
    expect(first.value.session.refresh_token).toMatch(/^[a-f0-9]{64}$/);
    expect(first.value.session.refresh_token).not.toBe(
      second.value.session.refresh_token,
    );
    expect(first.value.session.expires_at).toBe(1234567890);
  });

  it("never exposes password hashes or the submitted password in login responses", async () => {
    const { service, jwt, repository } = setup();
    repository.verifyLocalCredentials.mockResolvedValueOnce({
      ...user,
      password_hash: "private-hash",
    } as typeof user);
    const result = await service.login({ dto, jwt });
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain("private-hash");
    expect(JSON.stringify(result)).not.toContain(dto.password);
  });

  it("does not return a successful login when session persistence fails", async () => {
    const { service, jwt, repository } = setup();
    repository.createSession.mockRejectedValueOnce(
      new Error("database unavailable"),
    );
    await expect(service.login({ dto, jwt })).rejects.toThrow(
      "database unavailable",
    );
  });

  it("revokes only the supplied session token on logout", async () => {
    const { service, repository } = setup();
    await expect(service.logout("session-token")).resolves.toEqual({
      ok: true,
    });
    expect(repository.revokeSession).toHaveBeenCalledExactlyOnceWith(
      "session-token",
    );
    await service.logout(null);
    expect(repository.revokeSession).toHaveBeenCalledTimes(1);
  });
});
