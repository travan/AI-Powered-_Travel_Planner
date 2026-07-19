import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const tripStoreMock = {
    createPlaceSubmission: vi.fn(),
    createTripActivity: vi.fn(),
    createTripExpense: vi.fn(),
    getProfileSummary: vi.fn(),
    getTripDetailForUser: vi.fn(),
    listTripsForUser: vi.fn(),
    reviewTripChangeRequest: vi.fn(),
    updateChecklistStatus: vi.fn(),
    updateTripActivityStatus: vi.fn(),
};
const tripStorePath = require.resolve("../../../../../../../../apps/api/dist/db/trip-store.js");
require.cache[tripStorePath] = {
    id: tripStorePath,
    filename: tripStorePath,
    loaded: true,
    exports: tripStoreMock,
};

const trip_store_js_1 = tripStoreMock;
const trip_service_1 = await import("../../../../../../../../apps/api/dist/modules/trips/application/trip.service.js");
const service = new trip_service_1.TripService();
describe("TripService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    it("maps missing profile to a not_found service error", async () => {
        vi.mocked(trip_store_js_1.getProfileSummary).mockResolvedValue(null);
        const result = await service.getProfile("user-1");
        expect(result).toEqual({
            ok: false,
            error: {
                code: "not_found",
                statusCode: 404,
                message: "Profile not found",
            },
        });
    });
    it("returns trip detail value when repository finds an accessible trip", async () => {
        vi.mocked(trip_store_js_1.getTripDetailForUser).mockResolvedValue({
            id: "trip-1",
            title: "Demo trip",
            description: null,
            primary_city_slug: "da-nang",
            start_date: null,
            end_date: null,
            status: "planning",
            visibility: "private",
            budget: null,
            currency: "VND",
            role: "host",
            member_count: 1,
            activity_count: 0,
            checklist_done: 0,
            checklist_total: 0,
            expense_total: 0,
            created_at: "2026-07-16T00:00:00.000Z",
            members: [],
            days: [],
            activities: [],
            checklist: [],
            accommodations: [],
            transports: [],
            expenses: [],
            change_requests: [],
            place_submissions: [],
            audit_logs: [],
        });
        const result = await service.getTripDetail({ tripId: "trip-1", userId: "user-1" });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.title).toBe("Demo trip");
        }
    });
    it("maps forbidden activity creation to a service error", async () => {
        vi.mocked(trip_store_js_1.createTripActivity).mockResolvedValue(null);
        const result = await service.addActivity({
            tripId: "trip-1",
            userId: "viewer-1",
            dto: { title: "Viewer activity" },
        });
        expect(result).toEqual({
            ok: false,
            error: {
                code: "forbidden",
                statusCode: 403,
                message: "You cannot add activities to this trip",
            },
        });
    });
    it("reviews pending change requests through the repository boundary", async () => {
        vi.mocked(trip_store_js_1.reviewTripChangeRequest).mockResolvedValue({
            id: "request-1",
            target_type: "activity",
            target_id: "activity-1",
            requested_by_user_id: "user-2",
            requested_by_email: "friend@test.com",
            reviewed_by_user_id: "host-1",
            reviewed_by_email: "host@test.com",
            reviewed_at: "2026-07-16T00:01:00.000Z",
            change_payload: { title: "Contributor seafood market" },
            reason: "New contributor activity needs host review",
            status: "approved",
            created_at: "2026-07-16T00:00:00.000Z",
        });
        const result = await service.reviewChangeRequest({
            tripId: "trip-1",
            requestId: "request-1",
            userId: "host-1",
            dto: { status: "approved" },
        });
        expect(trip_store_js_1.reviewTripChangeRequest).toHaveBeenCalledWith({
            tripId: "trip-1",
            requestId: "request-1",
            userId: "host-1",
            status: "approved",
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.status).toBe("approved");
        }
    });
    it("maps forbidden change request review to a service error", async () => {
        vi.mocked(trip_store_js_1.reviewTripChangeRequest).mockResolvedValue(null);
        const result = await service.reviewChangeRequest({
            tripId: "trip-1",
            requestId: "request-1",
            userId: "viewer-1",
            dto: { status: "rejected" },
        });
        expect(result).toEqual({
            ok: false,
            error: {
                code: "forbidden",
                statusCode: 403,
                message: "You cannot review this change request",
            },
        });
    });
});
