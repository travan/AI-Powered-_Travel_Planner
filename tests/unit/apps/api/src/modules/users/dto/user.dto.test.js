import { beforeEach, describe, expect, it, vi } from "vitest";
const user_dto_1 = await import("../../../../../../../../apps/api/dist/modules/users/dto/user.dto");
describe("user DTO validation", () => {
    it("coerces and clamps prompt history limits through validation", () => {
        expect(user_dto_1.promptHistoryQueryDto.parse({ limit: "10" })).toEqual({ limit: 10 });
        expect(user_dto_1.promptHistoryQueryDto.parse({})).toEqual({ limit: 5 });
        expect(user_dto_1.promptHistoryQueryDto.safeParse({ limit: "100" }).success).toBe(false);
    });
});
