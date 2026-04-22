import { describe, expect, it } from "vitest";
import { mobileTheme } from "./theme";

describe("mobileTheme", () => {
  it("exposes design tokens for colors and radii", () => {
    expect(mobileTheme.colors.background).toBe("#f8f9fa");
    expect(mobileTheme.colors.primaryStrong).toBe("#0077b6");
    expect(mobileTheme.radius.pill).toBe(999);
  });
});
