import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const authStoreMock = {
    createLocalUser: vi.fn(),
    createUserSession: vi.fn(),
    getUserById: vi.fn(),
    revokeUserSession: vi.fn(),
    userExistsByEmail: vi.fn(),
    verifyLocalUserCredentials: vi.fn(),
};
const authStorePath = require.resolve("../../../../../../../../apps/api/dist/db/auth-store.js");
require.cache[authStorePath] = {
    id: authStorePath,
    filename: authStorePath,
    loaded: true,
    exports: authStoreMock,
};

const auth_store_js_1 = authStoreMock;
const auth_service_1 = await import("../../../../../../../../apps/api/dist/modules/auth/application/auth.service.js");
const user = {
    id: "user-1",
    email: "host@horizon.local",
    full_name: "Host",
    avatar_url: null,
    provider: "local",
    created_at: "2026-07-16T00:00:00.000Z",
};
const jwt = {
    sign: vi.fn(() => "signed-token"),
};
describe("AuthService", () => {
    const service = new auth_service_1.AuthService();
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(auth_store_js_1.createUserSession).mockResolvedValue({ expiresAt: 1_785_000_000 });
    });
    it("signs up a local user and returns a session", async () => {
        vi.mocked(auth_store_js_1.createLocalUser).mockResolvedValue(user);
        const result = await service.signup({
            dto: { email: user.email, password: "demo123456", full_name: "Host" },
            jwt,
        });
        expect(result.ok).toBe(true);
        expect(auth_store_js_1.createLocalUser).toHaveBeenCalledWith({
            email: user.email,
            password: "demo123456",
            fullName: "Host",
        });
        expect(auth_store_js_1.createUserSession).toHaveBeenCalledWith({ userId: user.id, token: "signed-token" });
    });
    it("maps duplicate signup to a conflict service error", async () => {
        vi.mocked(auth_store_js_1.createLocalUser).mockRejectedValue({ code: "23505" });
        const result = await service.signup({
            dto: { email: user.email, password: "demo123456" },
            jwt,
        });
        expect(result).toEqual({
            ok: false,
            error: {
                code: "conflict",
                statusCode: 409,
                message: "User already registered",
                apiCode: "user_already_exists",
            },
        });
    });
    it("maps invalid login credentials to unauthorized", async () => {
        vi.mocked(auth_store_js_1.verifyLocalUserCredentials).mockResolvedValue(null);
        const result = await service.login({
            dto: { email: user.email, password: "wrong-password" },
            jwt,
        });
        expect(result).toEqual({
            ok: false,
            error: {
                code: "unauthorized",
                statusCode: 401,
                message: "Invalid login credentials",
                apiCode: "invalid_credentials",
            },
        });
    });
    it("gets current user and revokes logout token through repositories", async () => {
        vi.mocked(auth_store_js_1.userExistsByEmail).mockResolvedValue(true);
        vi.mocked(auth_store_js_1.getUserById).mockResolvedValue(user);
        await expect(service.accountExists(user.email)).resolves.toBe(true);
        await expect(service.getMe(user.id)).resolves.toMatchObject({ ok: true });
        await expect(service.logout("token")).resolves.toEqual({ ok: true });
        expect(auth_store_js_1.revokeUserSession).toHaveBeenCalledWith("token");
    });
});
