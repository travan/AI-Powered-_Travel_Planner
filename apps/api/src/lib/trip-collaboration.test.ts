import { describe, expect, it } from "vitest";
import {
  approvalStatusForNewContribution,
  buildEqualSplits,
  canUpdateOwnedOrModerated,
  canWriteTrip,
} from "./trip-collaboration";

describe("trip collaboration policy", () => {
  it("allows contributors to add new data but blocks viewers", () => {
    expect(canWriteTrip("host")).toBe(true);
    expect(canWriteTrip("co_host")).toBe(true);
    expect(canWriteTrip("contributor")).toBe(true);
    expect(canWriteTrip("viewer")).toBe(false);
  });

  it("routes new contributor data through host approval", () => {
    expect(approvalStatusForNewContribution("host")).toBe("approved");
    expect(approvalStatusForNewContribution("co_host")).toBe("approved");
    expect(approvalStatusForNewContribution("contributor")).toBe("pending");
  });

  it("only owners, assignees, or moderators can update mutable trip records", () => {
    expect(canUpdateOwnedOrModerated({ role: "host", actorUserId: "u1", ownerUserId: "u2" })).toBe(true);
    expect(canUpdateOwnedOrModerated({ role: "contributor", actorUserId: "u1", ownerUserId: "u1" })).toBe(true);
    expect(
      canUpdateOwnedOrModerated({
        role: "contributor",
        actorUserId: "u1",
        ownerUserId: "u2",
        assignedUserId: "u1",
      })
    ).toBe(true);
    expect(canUpdateOwnedOrModerated({ role: "contributor", actorUserId: "u1", ownerUserId: "u2" })).toBe(false);
    expect(canUpdateOwnedOrModerated({ role: "viewer", actorUserId: "u1", ownerUserId: "u1" })).toBe(false);
  });

  it("builds deterministic equal splits and keeps rounding on the first member", () => {
    expect(buildEqualSplits({ amount: 100_001, userIds: ["a", "b", "b", "c"] })).toEqual([
      { userId: "a", shareAmount: 33_335, sharePercent: 33.33 },
      { userId: "b", shareAmount: 33_333, sharePercent: 33.33 },
      { userId: "c", shareAmount: 33_333, sharePercent: 33.33 },
    ]);
  });
});
