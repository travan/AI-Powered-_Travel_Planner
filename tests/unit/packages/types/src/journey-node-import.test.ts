import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("journey validation native Node entrypoint", () => {
  it("loads the E2E server's TypeScript entrypoint without a bundler or TS loader", () => {
    const entry = pathToFileURL(resolve("packages/types/src/journey.ts")).href;
    const output = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { validatePlanning, flexibleMonthWindows } from ${JSON.stringify(entry)};
console.log(JSON.stringify({ valid: validatePlanning({ flexible_month: "2090-02", num_days: 3 }).valid, windows: flexibleMonthWindows("2090-02", 3, "2090-01-01").length }));`,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    expect(JSON.parse(output)).toEqual({ valid: true, windows: 26 });
  });
});
