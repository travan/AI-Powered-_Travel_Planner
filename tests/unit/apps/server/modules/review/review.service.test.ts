import { describe, expect, it, vi } from "vitest";
import { ReviewService } from "../../../../../../apps/server/src/modules/review/application/review.service.js";

function buildRepository(overrides = {}) {
  return {
    findTripMember: vi.fn(),
    listQueue: vi.fn().mockResolvedValue([]),
    reviewSubmission: vi.fn().mockResolvedValue(true),
    listDataQualitySignals: vi.fn().mockResolvedValue([]),
    audit: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("ReviewService", () => {
  it("blocks non-host members from reviewing submissions", async () => {
    const repository = buildRepository({
      findTripMember: vi.fn().mockResolvedValue({
        tripId: "trip-1",
        userId: "viewer-1",
        role: "viewer",
        status: "active",
        invitedByUserId: null,
        joinedAt: new Date().toISOString(),
      }),
    });
    const service = new ReviewService(repository);

    await expect(service.listQueue({ tripId: "trip-1", actorUserId: "viewer-1" })).resolves.toMatchObject({
      ok: false,
      error: { statusCode: 403, apiCode: "review_forbidden" },
    });
  });

  it("lets host approve a pending expense and returns the refreshed queue", async () => {
    const repository = buildRepository({
      findTripMember: vi.fn().mockResolvedValue({
        tripId: "trip-1",
        userId: "host-1",
        role: "host",
        status: "active",
        invitedByUserId: null,
        joinedAt: new Date().toISOString(),
      }),
      listQueue: vi.fn().mockResolvedValue([{ id: "activity:next", title: "Next item" }]),
    });
    const service = new ReviewService(repository);

    const result = await service.reviewSubmission({
      tripId: "trip-1",
      actorUserId: "host-1",
      dto: {
        entity_type: "expense",
        entity_id: "11111111-1111-4111-8111-111111111111",
        decision: "approved",
      },
    });

    expect(result).toMatchObject({ ok: true, value: [{ id: "activity:next" }] });
    expect(repository.reviewSubmission).toHaveBeenCalledWith({
      tripId: "trip-1",
      actorUserId: "host-1",
      entityType: "expense",
      entityId: "11111111-1111-4111-8111-111111111111",
      decision: "approved",
    });
    expect(repository.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "host_approved" }));
  });
});
