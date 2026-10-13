import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { designTokens } from "@travel/design-tokens";

describe("shared design tokens", () => {
  it("provides matching core colors and radii for web and mobile", () => {
    expect(designTokens.colors.primary).toBe("#005d90");
    expect(designTokens.colors.surface).toBe("#f8f9fa");
    expect(designTokens.radius.md).toBe(14);
    expect(designTokens.spacing.lg).toBe(16);
  });

  it("keeps spacing tokens out of Tailwind's built-in width namespace", async () => {
    const generatedCss = await readFile(
      new URL("../../../../../packages/design-tokens/tokens.css", import.meta.url),
      "utf8",
    );

    expect(generatedCss).toContain("--ds-space-md: 12px;");
    expect(generatedCss).not.toMatch(/--spacing-(?:xs|sm|md|lg|xl|2xl)\s*:/);
  });
});
