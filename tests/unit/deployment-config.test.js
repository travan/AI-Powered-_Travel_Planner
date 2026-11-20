import { describe, expect, it } from "vitest";
import { privateDeploymentConfig } from "../../scripts/deployment-config.mjs";

describe("private production configuration", () => {
  it("allows public CI checks without production values but refuses a production deploy without its secret", async () => {
    expect(await privateDeploymentConfig({ CI: "true" })).toBeUndefined();
    await expect(
      privateDeploymentConfig({
        CI: "true",
        REQUIRE_PRIVATE_DEPLOY_CONFIG: "true",
      }),
    ).rejects.toThrow("TRAVEL_PRODUCTION_CONFIG");
  });
  it("loads the configured project and refuses invalid configuration without echoing its contents", async () => {
    const bundle = {
      supabaseProjectRef: "a".repeat(20),
      worker: {
        account_id: "b".repeat(32),
        hyperdrive: [{ id: "c".repeat(32) }],
      },
    };
    expect(
      await privateDeploymentConfig({
        CI: "true",
        TRAVEL_PRODUCTION_CONFIG: JSON.stringify(bundle),
      }),
    ).toEqual(bundle);
    for (const value of [
      '{"secret":"never-echo-this"',
      "null",
      "[]",
      JSON.stringify({ ...bundle, supabaseProjectRef: "wrong" }),
    ]) {
      await expect(
        privateDeploymentConfig({
          CI: "true",
          TRAVEL_PRODUCTION_CONFIG: value,
        }),
      ).rejects.not.toThrow("never-echo-this");
    }
  });
});
