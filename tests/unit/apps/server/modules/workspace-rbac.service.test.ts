import { describe, expect, it, vi } from "vitest";
import { ActivitiesService } from "../../../../../apps/server/src/modules/activities/application/activities.service";
import { TransportService } from "../../../../../apps/server/src/modules/transport/application/transport.service";
import { TripsService } from "../../../../../apps/server/src/modules/trips/application/trips.service";

const activeViewer = {
  tripId: "trip-1",
  userId: "viewer-1",
  role: "viewer" as const,
  status: "active" as const,
  invitedByUserId: "host-1",
  joinedAt: "2026-07-26T00:00:00.000Z",
};

const activeContributor = {
  ...activeViewer,
  userId: "contributor-1",
  role: "contributor" as const,
};

const activeCoHost = {
  ...activeViewer,
  userId: "co-host-1",
  role: "co_host" as const,
};

const activeHost = {
  ...activeViewer,
  userId: "host-1",
  role: "host" as const,
  invitedByUserId: null,
};

describe("workspace role enforcement", () => {
  it("lets viewers read activities but blocks activity creation", async () => {
    const repository = {
      findTripMember: vi.fn().mockResolvedValue(activeViewer),
      listTripActivities: vi.fn().mockResolvedValue([]),
      createTripActivity: vi.fn(),
    };
    const service = new ActivitiesService(repository as never);

    await expect(
      service.listTripActivities({
        tripId: "trip-1",
        actorUserId: activeViewer.userId,
      }),
    ).resolves.toEqual({ ok: true, value: [] });
    await expect(
      service.createTripActivity({
        tripId: "trip-1",
        actorUserId: activeViewer.userId,
        dto: { title: "Museum", category: "culture", currency: "VND" },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { statusCode: 403, apiCode: "activity_create_forbidden" },
    });
    expect(repository.createTripActivity).not.toHaveBeenCalled();
  });

  it("does not let contributors approve their own activity", async () => {
    const repository = {
      findTripActivity: vi.fn().mockResolvedValue({
        id: "activity-1",
        tripId: "trip-1",
        createdByUserId: activeContributor.userId,
      }),
      findTripMember: vi.fn().mockResolvedValue(activeContributor),
      updateTripActivity: vi.fn(),
    };
    const service = new ActivitiesService(repository as never);

    await expect(
      service.updateTripActivity({
        tripId: "trip-1",
        activityId: "activity-1",
        actorUserId: activeContributor.userId,
        dto: { status: "approved" },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { statusCode: 403, apiCode: "activity_status_forbidden" },
    });
    expect(repository.updateTripActivity).not.toHaveBeenCalled();
  });

  it("lets contributors mark their own activity done", async () => {
    const activity = {
      id: "activity-1",
      tripId: "trip-1",
      title: "Museum",
      createdByUserId: activeContributor.userId,
      status: "scheduled",
    };
    const updated = { ...activity, status: "done" };
    const repository = {
      findTripActivity: vi.fn().mockResolvedValue(activity),
      findTripMember: vi.fn().mockResolvedValue(activeContributor),
      updateTripActivity: vi.fn().mockResolvedValue(updated),
      audit: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ActivitiesService(repository as never);

    await expect(
      service.updateTripActivity({
        tripId: "trip-1",
        activityId: "activity-1",
        actorUserId: activeContributor.userId,
        dto: { status: "done" },
      }),
    ).resolves.toEqual({ ok: true, value: updated });
    expect(repository.updateTripActivity).toHaveBeenCalled();
  });

  it("lets viewers read transport but blocks transport creation", async () => {
    const repository = {
      findTripMember: vi.fn().mockResolvedValue(activeViewer),
      listForTrip: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    };
    const service = new TransportService(repository as never);

    await expect(
      service.listForTrip({
        tripId: "trip-1",
        actorUserId: activeViewer.userId,
      }),
    ).resolves.toEqual({ ok: true, value: [] });
    await expect(
      service.create({
        tripId: "trip-1",
        actorUserId: activeViewer.userId,
        dto: {
          mode: "train",
          origin_name: "Da Nang",
          destination_name: "Hue",
          currency: "VND",
          booking_status: "planned",
        },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { statusCode: 403, apiCode: "transport_create_forbidden" },
    });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("returns a viewer's own membership without exposing the member list", async () => {
    const repository = {
      findMember: vi.fn().mockResolvedValue(activeViewer),
      listMembers: vi.fn(),
    };
    const service = new TripsService(repository as never);

    await expect(
      service.getMembership({
        tripId: "trip-1",
        actorUserId: activeViewer.userId,
      }),
    ).resolves.toEqual({ ok: true, value: activeViewer });
    await expect(
      service.listMembers({
        tripId: "trip-1",
        actorUserId: activeViewer.userId,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { statusCode: 403, apiCode: "member_list_forbidden" },
    });
    expect(repository.listMembers).not.toHaveBeenCalled();
  });

  it("lets a co-host manage invites but never change the protected host", async () => {
    const createdInvite = {
      id: "invite-1",
      tripId: "trip-1",
      invitedByUserId: activeCoHost.userId,
      email: "friend@example.com",
      role: "contributor" as const,
      token: "invite-token-123456",
      status: "pending" as const,
      expiresAt: "2026-08-02T00:00:00.000Z",
      acceptedByUserId: null,
      acceptedAt: null,
      createdAt: "2026-07-26T00:00:00.000Z",
    };
    const repository = {
      findMember: vi
        .fn()
        .mockResolvedValueOnce(activeCoHost)
        .mockResolvedValueOnce(activeCoHost)
        .mockResolvedValueOnce(activeHost),
      createInvite: vi.fn().mockResolvedValue(createdInvite),
      updateMember: vi.fn(),
      audit: vi.fn().mockResolvedValue(undefined),
    };
    const service = new TripsService(repository as never);

    await expect(
      service.createInvite({
        tripId: "trip-1",
        actorUserId: activeCoHost.userId,
        dto: {
          email: "friend@example.com",
          role: "contributor",
          expiresInDays: 7,
        },
      }),
    ).resolves.toMatchObject({ ok: true, value: createdInvite });
    await expect(
      service.updateMember({
        tripId: "trip-1",
        actorUserId: activeCoHost.userId,
        targetUserId: activeHost.userId,
        dto: { role: "viewer" },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { statusCode: 403, apiCode: "host_member_locked" },
    });
    expect(repository.updateMember).not.toHaveBeenCalled();
  });
});
