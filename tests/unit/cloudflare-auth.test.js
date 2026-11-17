import { describe, it, expect, vi } from "vitest";
import { cloudflareApiToken } from "../../scripts/cloudflare-auth.mjs";

describe("local Cloudflare deployment authentication", () => {
  it("prefers the CI API token without invoking the CLI", async () => {
    const run = vi.fn();
    expect(
      await cloudflareApiToken({
        env: { CLOUDFLARE_API_TOKEN: " explicit-token " },
        run,
      }),
    ).toBe("explicit-token");
    expect(run).not.toHaveBeenCalled();
  });
  it("reads a local OAuth session using the supported JSON command", async () => {
    const run = vi
      .fn()
      .mockResolvedValue({
        stdout: JSON.stringify({ type: "oauth", token: "local-token" }),
      });
    expect(await cloudflareApiToken({ env: {}, run })).toBe("local-token");
    expect(run).toHaveBeenCalledWith(
      "pnpm",
      ["dlx", "wrangler@4.155.0", "auth", "token", "--json"],
      expect.objectContaining({ timeout: 60000 }),
    );
  });
  it.each([
    "invalid-json",
    JSON.stringify({ type: "api_key", token: "must-not-use" }),
  ])("rejects malformed or unsupported session output", async (stdout) => {
    await expect(
      cloudflareApiToken({
        env: {},
        run: vi.fn().mockResolvedValue({ stdout }),
      }),
    ).rejects.toThrow("Cloudflare credentials unavailable");
  });
  it("does not leak CLI stdout or stderr when authentication fails", async () => {
    const run = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error("private-token"), {
          stdout: "private-token",
          stderr: "private-token",
        }),
      );
    try {
      await cloudflareApiToken({ env: {}, run });
      throw new Error("should fail");
    } catch (error) {
      expect(error.message).toContain("Cloudflare credentials unavailable");
      expect(String(error)).not.toContain("private-token");
    }
  });
});
