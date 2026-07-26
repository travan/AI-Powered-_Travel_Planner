import { describe, expect, it, vi } from "vitest";
import { TripsService } from "../../../../../../apps/server/src/modules/trips/application/trips.service";
import type { TripInvite, TripMember } from "../../../../../../apps/server/src/modules/trips/domain/trip.entity";
import type { TripRepository } from "../../../../../../apps/server/src/modules/trips/domain/trip.repository";

const pendingInvite: TripInvite = {
  id: "invite-1",
  tripId: "trip-1",
  invitedByUserId: "host-1",
  email: null,
  role: "viewer",
  token: "invite-token-123",
  status: "pending",
  expiresAt: "2099-01-01T00:00:00.000Z",
  acceptedByUserId: null,
  acceptedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const viewerMember: TripMember = {
  tripId: "trip-1",
  userId: "guest-1",
  role: "viewer",
  status: "active",
  invitedByUserId: "host-1",
  joinedAt: "2026-01-01T00:00:00.000Z",
};

function createRepository(overrides: Partial<TripRepository>): TripRepository {
  return {
    findInviteByToken: vi.fn(),
    findMember: vi.fn(),
    upsertMember: vi.fn(),
    acceptInvite: vi.fn(),
    audit: vi.fn(),
    ...overrides,
  } as unknown as TripRepository;
}

describe("TripsService.joinInvite", () => {
  it("does not let the invite creator consume their own invite", async () => {
    const repository = createRepository({
      findInviteByToken: vi.fn().mockResolvedValue(pendingInvite),
    });
    const service = new TripsService(repository);

    await expect(
      service.joinInvite({
        actorUserId: "host-1",
        actorEmail: "host@example.com",
        dto: { token: pendingInvite.token },
      })
    ).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        statusCode: 403,
        apiCode: "cannot_accept_own_invite",
      }),
    });
    expect(repository.upsertMember).not.toHaveBeenCalled();
    expect(repository.acceptInvite).not.toHaveBeenCalled();
  });

  it("treats a repeated click by the accepting member as idempotent", async () => {
    const acceptedInvite = {
      ...pendingInvite,
      status: "accepted" as const,
      acceptedByUserId: "guest-1",
    };
    const repository = createRepository({
      findInviteByToken: vi.fn().mockResolvedValue(acceptedInvite),
      findMember: vi.fn().mockResolvedValue(viewerMember),
    });
    const service = new TripsService(repository);

    await expect(
      service.joinInvite({
        actorUserId: "guest-1",
        actorEmail: "guest@example.com",
        dto: { token: pendingInvite.token },
      })
    ).resolves.toEqual({ ok: true, value: viewerMember });
  });

  it("reports when another traveler already used the invite", async () => {
    const repository = createRepository({
      findInviteByToken: vi.fn().mockResolvedValue({
        ...pendingInvite,
        status: "accepted",
        acceptedByUserId: "guest-1",
      }),
    });
    const service = new TripsService(repository);

    await expect(
      service.joinInvite({
        actorUserId: "guest-2",
        actorEmail: "guest2@example.com",
        dto: { token: pendingInvite.token },
      })
    ).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        statusCode: 409,
        apiCode: "invite_already_used",
      }),
    });
  });
});
