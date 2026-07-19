import { beforeEach, describe, expect, it, vi } from "vitest";
const trip_collaboration_1 = await import("../../../../../../apps/api/dist/lib/trip-collaboration");
describe("trip collaboration policy", () => {
    it("allows contributors to add new data but blocks viewers", () => {
        expect(trip_collaboration_1.canWriteTrip("host")).toBe(true);
        expect(trip_collaboration_1.canWriteTrip("co_host")).toBe(true);
        expect(trip_collaboration_1.canWriteTrip("contributor")).toBe(true);
        expect(trip_collaboration_1.canWriteTrip("viewer")).toBe(false);
    });
    it("routes new contributor data through host approval", () => {
        expect(trip_collaboration_1.approvalStatusForNewContribution("host")).toBe("approved");
        expect(trip_collaboration_1.approvalStatusForNewContribution("co_host")).toBe("approved");
        expect(trip_collaboration_1.approvalStatusForNewContribution("contributor")).toBe("pending");
    });
    it("only owners, assignees, or moderators can update mutable trip records", () => {
        expect(trip_collaboration_1.canUpdateOwnedOrModerated({ role: "host", actorUserId: "u1", ownerUserId: "u2" })).toBe(true);
        expect(trip_collaboration_1.canUpdateOwnedOrModerated({ role: "contributor", actorUserId: "u1", ownerUserId: "u1" })).toBe(true);
        expect(trip_collaboration_1.canUpdateOwnedOrModerated({
            role: "contributor",
            actorUserId: "u1",
            ownerUserId: "u2",
            assignedUserId: "u1",
        })).toBe(true);
        expect(trip_collaboration_1.canUpdateOwnedOrModerated({ role: "contributor", actorUserId: "u1", ownerUserId: "u2" })).toBe(false);
        expect(trip_collaboration_1.canUpdateOwnedOrModerated({ role: "viewer", actorUserId: "u1", ownerUserId: "u1" })).toBe(false);
    });
    it("builds deterministic equal splits and keeps rounding on the first member", () => {
        expect(trip_collaboration_1.buildEqualSplits({ amount: 100_001, userIds: ["a", "b", "b", "c"] })).toEqual([
            { userId: "a", shareAmount: 33_335, sharePercent: 33.33 },
            { userId: "b", shareAmount: 33_333, sharePercent: 33.33 },
            { userId: "c", shareAmount: 33_333, sharePercent: 33.33 },
        ]);
    });
});
