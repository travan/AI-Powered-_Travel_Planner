import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  hashPassword,
  PostgresUserRepository,
} from "../../../../../../apps/server/src/modules/auth/infrastructure/postgres-user.repository";

const password = "Private-password-93!";
const userRow = {
  id: "user-1",
  email: "user@test.invalid",
  full_name: null,
  avatar_url: null,
  provider: "local",
  created_at: "2026-01-01",
};

describe("PostgreSQL credential and session security", () => {
  it("salts each password independently and never stores plaintext passwords", async () => {
    const first = await hashPassword(password);
    const second = await hashPassword(password);
    expect(first).toMatch(/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
    expect(first).not.toBe(second);
    expect(first).not.toContain(password);
  });

  it("accepts only the correct password and returns a user without the password hash", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ ...userRow, password_hash: await hashPassword(password) }],
    });
    const repository = new PostgresUserRepository(
      { query } as never,
      {} as never,
    );
    const result = await repository.verifyLocalCredentials({
      email: " USER@test.invalid ",
      password,
    });
    expect(result).toMatchObject({ id: userRow.id });
    expect(result).not.toHaveProperty("password_hash");
    expect(query.mock.calls[0][1]).toEqual([userRow.email]);
    expect(
      await repository.verifyLocalCredentials({
        email: userRow.email,
        password: "incorrect",
      }),
    ).toBeNull();
  });

  it.each([null, "", "plaintext-password", "scrypt$salt$00", "bcrypt$salt$key"])(
    "rejects corrupt or unsupported password hashes: %s",
    async (password_hash) => {
      const query = vi
        .fn()
        .mockResolvedValue({ rows: [{ ...userRow, password_hash }] });
      const repository = new PostgresUserRepository(
        { query } as never,
        {} as never,
      );
      expect(
        await repository.verifyLocalCredentials({
          email: userRow.email,
          password,
        }),
      ).toBeNull();
    },
  );

  it("keeps SQL injection input in bound parameters", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new PostgresUserRepository(
      { query } as never,
      {} as never,
    );
    const email = "attacker@test.invalid' OR 1=1 --";
    expect(
      await repository.verifyLocalCredentials({ email, password }),
    ).toBeNull();
    expect(query.mock.calls[0][0]).not.toContain(email.toLowerCase());
    expect(query.mock.calls[0][1]).toEqual([email.toLowerCase()]);
  });

  it("stores only hashes for access and refresh credentials in one transaction", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const release = vi.fn();
    const pool = { connect: vi.fn().mockResolvedValue({ query, release }) };
    const repository = new PostgresUserRepository(
      { query } as never,
      pool as never,
    );
    const token = "sensitive-session-token";
    const refreshToken = "sensitive-refresh-token";
    const digest = (value: string) =>
      createHash("sha256").update(value).digest("hex");
    const session = await repository.createSession({
      userId: userRow.id,
      token,
      refreshToken,
    });
    expect(query.mock.calls[0][0]).toBe("begin");
    expect(query.mock.calls[1][1]).toEqual([
      userRow.id,
      digest(token),
      expect.any(Date),
      expect.any(String),
    ]);
    expect(query.mock.calls[2][1]).toEqual([
      digest(refreshToken),
      userRow.id,
      expect.any(String),
      expect.any(Date),
    ]);
    expect(query.mock.calls[3][0]).toBe("commit");
    expect(session.expiresAt).toBe(
      Math.floor(query.mock.calls[1][1][2].getTime() / 1000),
    );
    expect(JSON.stringify(query.mock.calls)).not.toContain(token);
    expect(JSON.stringify(query.mock.calls)).not.toContain(refreshToken);
    expect(release).toHaveBeenCalledOnce();
  });
});
