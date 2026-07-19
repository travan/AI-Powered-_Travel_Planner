import { describe, expect, it } from "vitest";
import { accountExistsQueryDto, loginDto, signupDto } from "./auth.dto";

describe("auth DTO validation", () => {
  it("normalizes email input for account checks and login", () => {
    expect(accountExistsQueryDto.parse({ email: "  Host@Horizon.Local " })).toEqual({
      email: "host@horizon.local",
    });
    expect(loginDto.parse({ email: "  Linh@Horizon.Local ", password: "demo123456" })).toEqual({
      email: "linh@horizon.local",
      password: "demo123456",
    });
  });

  it("validates signup fields", () => {
    expect(
      signupDto.parse({
        email: "new@horizon.local",
        password: "demo123456",
        full_name: "  New Traveler  ",
      })
    ).toMatchObject({
      email: "new@horizon.local",
      full_name: "New Traveler",
    });
    expect(signupDto.safeParse({ email: "bad", password: "short" }).success).toBe(false);
  });
});
