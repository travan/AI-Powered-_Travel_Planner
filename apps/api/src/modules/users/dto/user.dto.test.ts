import { describe, expect, it } from "vitest";
import { promptHistoryQueryDto } from "./user.dto";

describe("user DTO validation", () => {
  it("coerces and clamps prompt history limits through validation", () => {
    expect(promptHistoryQueryDto.parse({ limit: "10" })).toEqual({ limit: 10 });
    expect(promptHistoryQueryDto.parse({})).toEqual({ limit: 5 });
    expect(promptHistoryQueryDto.safeParse({ limit: "100" }).success).toBe(false);
  });
});
