import { beforeEach, describe, expect, it, vi } from "vitest";
const auth_dto_1 = await import("../../../../../../../../apps/api/dist/modules/auth/dto/auth.dto");
describe("auth DTO validation", () => {
    it("normalizes email input for account checks and login", () => {
        expect(auth_dto_1.accountExistsQueryDto.parse({ email: "  Host@Horizon.Local " })).toEqual({
            email: "host@horizon.local",
        });
        expect(auth_dto_1.loginDto.parse({ email: "  Linh@Horizon.Local ", password: "demo123456" })).toEqual({
            email: "linh@horizon.local",
            password: "demo123456",
        });
    });
    it("validates signup fields", () => {
        expect(auth_dto_1.signupDto.parse({
            email: "new@horizon.local",
            password: "demo123456",
            full_name: "  New Traveler  ",
        })).toMatchObject({
            email: "new@horizon.local",
            full_name: "New Traveler",
        });
        expect(auth_dto_1.signupDto.safeParse({ email: "bad", password: "short" }).success).toBe(false);
    });
});
