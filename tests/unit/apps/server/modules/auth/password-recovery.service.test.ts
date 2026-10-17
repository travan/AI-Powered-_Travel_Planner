import { beforeEach, describe, expect, it, vi } from "vitest";
import { PasswordRecoveryService } from "../../../../../../apps/server/src/modules/auth/application/password-recovery.service";
const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

function setup(provider = "local") {
  const config: any = {
    passwordRecovery: {
      provider,
      resetUrl: "https://travel.test/reset-password",
    },
    supabaseApiConfig: { url: "https://db.test", serviceKey: "secret" },
  };
  const repository: any = {
    issue: vi.fn().mockResolvedValue("a".repeat(64)),
    reset: vi.fn().mockResolvedValue(true),
    discard: vi.fn().mockResolvedValue(undefined),
  };
  const mailer: any = {
    assertConfigured: vi.fn(),
    send: vi.fn().mockResolvedValue(undefined),
  };
  const admin: any = {
    auth: {
      admin: {
        generateLink: vi
          .fn()
          .mockResolvedValue({
            data: { properties: { hashed_token: "supabase-token" } },
            error: null,
          }),
      },
    },
  };
  return {
    service: new PasswordRecoveryService(config, repository, mailer, admin),
    config,
    repository,
    mailer,
    admin,
  };
}

beforeEach(() => vi.clearAllMocks());
describe("unified password recovery", () => {
  it("sends a server-configured link with token in fragment, never in response", async () => {
    const { service, mailer } = setup();
    const response = await service.request("user@test.invalid");
    expect(mailer.send).toHaveBeenCalledWith(
      "user@test.invalid",
      `https://travel.test/reset-password#recovery_token=${"a".repeat(64)}`,
    );
    expect(JSON.stringify(response)).not.toContain("a".repeat(64));
  });
  it("does not reveal missing users or mail failures and removes undelivered tokens", async () => {
    const { service, repository, mailer } = setup();
    const success = await service.request("user@test.invalid");
    repository.issue.mockResolvedValueOnce(null);
    expect(await service.request("missing@test.invalid")).toEqual(success);
    mailer.send.mockRejectedValueOnce(new Error("smtp secret"));
    expect(await service.request("user@test.invalid")).toEqual(success);
    expect(repository.discard).toHaveBeenCalledWith("a".repeat(64));
  });
  it("fails explicitly when delivery is unconfigured before looking up any account", async () => {
    const { service, repository, mailer } = setup();
    mailer.assertConfigured.mockImplementation(() => {
      throw new Error("not configured");
    });
    await expect(service.request("user@test.invalid")).rejects.toThrow(
      "not configured",
    );
    expect(repository.issue).not.toHaveBeenCalled();
  });
  it("rejects invalid, expired or consumed local tokens", async () => {
    const { service, repository } = setup();
    repository.reset.mockResolvedValue(false);
    await expect(service.reset("bad-token", "New-password!")).rejects.toThrow(
      "invalid or expired",
    );
  });
  it("uses Supabase native recovery without querying local accounts", async () => {
    const { service, repository, admin, mailer } = setup("supabase");
    await service.request("cloud@test.invalid");
    expect(repository.issue).not.toHaveBeenCalled();
    expect(admin.auth.admin.generateLink).toHaveBeenCalledWith({
      type: "recovery",
      email: "cloud@test.invalid",
    });
    expect(mailer.send.mock.calls[0][1]).toContain(
      "#recovery_token=supabase-token",
    );
  });
  it("uses an isolated recovery session, changes password, and revokes Supabase refresh sessions", async () => {
    const auth = {
      verifyOtp: vi.fn().mockResolvedValue({ data: { session: {} } }),
      updateUser: vi.fn().mockResolvedValue({}),
      signOut: vi.fn().mockResolvedValue({}),
    };
    createClient.mockReturnValue({ auth });
    await setup("supabase").service.reset("token", "New-password!");
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: "token",
      type: "recovery",
    });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "New-password!" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "global" });
  });
  it("never updates a Supabase password when verification fails", async () => {
    const auth = {
      verifyOtp: vi
        .fn()
        .mockResolvedValue({ error: new Error("expired"), data: {} }),
      updateUser: vi.fn(),
    };
    createClient.mockReturnValue({ auth });
    await expect(
      setup("supabase").service.reset("token", "New-password!"),
    ).rejects.toThrow("invalid or expired");
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
  it("revokes recovery sessions even if Supabase rejects the new password", async () => {
    const auth = {
      verifyOtp: vi.fn().mockResolvedValue({ data: { session: {} } }),
      updateUser: vi
        .fn()
        .mockResolvedValue({ error: new Error("weak password") }),
      signOut: vi.fn().mockResolvedValue({}),
    };
    createClient.mockReturnValue({ auth });
    await expect(
      setup("supabase").service.reset("token", "New-password!"),
    ).rejects.toThrow("could not be updated");
    expect(auth.signOut).toHaveBeenCalled();
  });
});
