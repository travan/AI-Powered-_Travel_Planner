import { Inject, Injectable, Optional } from "@nestjs/common";
import { TripInviteMailWorker } from "./trip-invite-mail.worker.js";
import { randomBytes } from "node:crypto";
import {
  conflict,
  forbidden,
  notFound,
  ok,
  type ServiceResult,
} from "../../../shared/application/service-result.js";
import { getTripRolePermissions } from "../../../shared/application/trip-role-permissions.js";
import type { TripSummary } from "@travel/types";
import type {
  Trip,
  TripAuditLog,
  TripInvite,
  TripMember,
  TripShareLink,
} from "../domain/trip.entity.js";
import {
  TRIP_REPOSITORY,
  type TripRepository,
} from "../domain/trip.repository.js";
import type {
  CreateTripInviteDto,
  JoinTripInviteDto,
  JoinTripShareLinkDto,
  UpdateTripMemberDto,
  UpdateTripShareLinkDto,
} from "../dto/trip.dto.js";

@Injectable()
export class TripsService {
  constructor(
    @Inject(TRIP_REPOSITORY) private readonly trips: TripRepository,
    @Optional()
    @Inject(TripInviteMailWorker)
    private readonly inviteMail?: TripInviteMailWorker,
  ) {}

  listForUser(userId: string): Promise<TripSummary[]> {
    return this.trips.listForUser(userId);
  }

  async getForUser(input: {
    tripId: string;
    userId: string;
  }): Promise<ServiceResult<Trip>> {
    const trip = await this.trips.findForUser(input);
    return trip ? ok(trip) : notFound("Trip not found");
  }

  async getMembership(input: {
    tripId: string;
    actorUserId: string;
  }): Promise<ServiceResult<TripMember>> {
    const member = await this.trips.findMember({
      tripId: input.tripId,
      userId: input.actorUserId,
    });
    return member?.status === "active"
      ? ok(member)
      : notFound("Trip not found");
  }

  async workspace(input: { tripId: string; actorUserId: string }) {
    const membership = await this.getMembership(input);
    if (!membership.ok) return membership;
    const trip = await this.trips.findForUser({
      tripId: input.tripId,
      userId: input.actorUserId,
    });
    if (!trip) return notFound("Trip not found");
    const permissions = getTripRolePermissions(membership.value.role);
    const members = permissions.viewMembers
      ? await this.trips.listMembers(input.tripId)
      : [membership.value];
    return ok({
      membership: membership.value,
      permissions,
      members,
      title: trip.title,
      primaryCitySlug: trip.primaryCitySlug ?? null,
    });
  }

  async listMembers(input: {
    tripId: string;
    actorUserId: string;
  }): Promise<ServiceResult<TripMember[]>> {
    const member = await this.trips.findMember({
      tripId: input.tripId,
      userId: input.actorUserId,
    });
    if (!member || member.status !== "active")
      return notFound("Trip not found");
    if (!getTripRolePermissions(member.role).viewMembers) {
      return forbidden(
        "Viewers cannot access the trip member list",
        "member_list_forbidden",
      );
    }
    return ok(await this.trips.listMembers(input.tripId));
  }

  async createInvite(input: {
    tripId: string;
    actorUserId: string;
    dto: CreateTripInviteDto;
  }): Promise<ServiceResult<TripInvite>> {
    const permission = await this.canManageTrip(
      input.tripId,
      input.actorUserId,
    );
    if (!permission.ok) return permission;

    const invite = await this.trips.createInvite({
      tripId: input.tripId,
      invitedByUserId: input.actorUserId,
      email: input.dto.email,
      role: input.dto.role,
      token: randomToken(),
      expiresAt: addDays(input.dto.expiresInDays).toISOString(),
    });
    await this.trips.audit({
      tripId: input.tripId,
      actorUserId: input.actorUserId,
      entityType: "trip_invite",
      entityId: invite.id,
      action: "created",
      after: invite,
    });
    if (invite.email && this.inviteMail) {
      try {
        await this.inviteMail.processNext(invite.id);
        return ok({ ...invite, ...(await this.inviteMail.status(invite.id)) });
      } catch {
        return ok({ ...invite, emailStatus: "failed" as const });
      }
    }
    return ok({
      ...invite,
      emailStatus: invite.email
        ? ("not_configured" as const)
        : ("not_requested" as const),
    });
  }

  async inviteDelivery(input: {
    tripId: string;
    actorUserId: string;
    inviteId: string;
    resend?: boolean;
  }) {
    const permission = await this.canManageTrip(
      input.tripId,
      input.actorUserId,
    );
    if (!permission.ok) return permission;
    const invite = await this.trips.findInviteById({
      tripId: input.tripId,
      id: input.inviteId,
    });
    if (!invite) return notFound("Invite not found");
    if (!invite.email) return ok({ emailStatus: "not_requested" as const });
    if (
      invite.status !== "pending" ||
      (invite.expiresAt && Date.parse(invite.expiresAt) <= Date.now())
    )
      return ok({ emailStatus: "cancelled" as const });
    if (!this.inviteMail) return ok({ emailStatus: "not_configured" as const });
    return ok(
      input.resend
        ? await this.inviteMail.resend(invite.id)
        : await this.inviteMail.status(invite.id),
    );
  }

  async joinInvite(input: {
    actorUserId: string;
    actorEmail?: string;
    dto: JoinTripInviteDto;
  }): Promise<ServiceResult<TripMember>> {
    const invite = await this.trips.findInviteByToken(input.dto.token);
    if (!invite) return notFound("Invite not found");
    if (invite.status === "accepted") {
      if (invite.acceptedByUserId === input.actorUserId) {
        const member = await this.trips.findMember({
          tripId: invite.tripId,
          userId: input.actorUserId,
        });
        return member
          ? ok(member)
          : conflict(
              "This invite was already accepted, but its membership is unavailable",
              "invite_membership_missing",
            );
      }
      return conflict(
        "This invite has already been used",
        "invite_already_used",
      );
    }
    if (invite.status !== "pending") {
      return forbidden("This invite is no longer active", "invite_inactive");
    }
    if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) {
      return forbidden("Invite has expired", "invite_expired");
    }
    if (invite.invitedByUserId === input.actorUserId) {
      return forbidden(
        "You created this invite. Open the link with the invited traveler's account instead.",
        "cannot_accept_own_invite",
      );
    }
    if (
      invite.email &&
      input.actorEmail &&
      invite.email.toLowerCase() !== input.actorEmail.toLowerCase()
    ) {
      return forbidden(
        "Invite email does not match current user",
        "invite_email_mismatch",
      );
    }
    const existingMember = await this.trips.findMember({
      tripId: invite.tripId,
      userId: input.actorUserId,
    });
    if (existingMember?.status === "active") {
      return conflict(
        "You are already a member of this trip",
        "already_trip_member",
      );
    }

    const member = await this.trips.upsertMember({
      tripId: invite.tripId,
      userId: input.actorUserId,
      role: invite.role,
      invitedByUserId: invite.invitedByUserId,
    });
    const acceptedInvite = await this.trips.acceptInvite({
      inviteId: invite.id,
      userId: input.actorUserId,
    });
    await this.trips.audit({
      tripId: invite.tripId,
      actorUserId: input.actorUserId,
      entityType: "trip_invite",
      entityId: acceptedInvite.id,
      action: "accepted",
      before: invite,
      after: acceptedInvite,
    });
    return ok(member);
  }

  async setShareLink(input: {
    tripId: string;
    actorUserId: string;
    dto: UpdateTripShareLinkDto;
  }): Promise<ServiceResult<TripShareLink>> {
    const permission = await this.canManageTrip(
      input.tripId,
      input.actorUserId,
    );
    if (!permission.ok) return permission;

    const shareLink = await this.trips.setShareLink({
      tripId: input.tripId,
      enabled: input.dto.enabled,
      role: input.dto.role,
      token: input.dto.enabled ? randomToken() : null,
    });
    await this.trips.audit({
      tripId: input.tripId,
      actorUserId: input.actorUserId,
      entityType: "trip",
      entityId: input.tripId,
      action: input.dto.enabled ? "share_link_enabled" : "share_link_disabled",
      after: shareLink,
    });
    return ok(shareLink);
  }

  async joinShareLink(input: {
    actorUserId: string;
    dto: JoinTripShareLinkDto;
  }): Promise<ServiceResult<TripMember>> {
    const shareLink = await this.trips.findShareLink(input.dto.token);
    if (!shareLink || !shareLink.enabled)
      return notFound("Share link not found");

    const member = await this.trips.upsertMember({
      tripId: shareLink.tripId,
      userId: input.actorUserId,
      role: shareLink.role,
      invitedByUserId: null,
    });
    await this.trips.audit({
      tripId: shareLink.tripId,
      actorUserId: input.actorUserId,
      entityType: "trip_member",
      entityId: input.actorUserId,
      action: "joined_by_share_link",
      after: member,
    });
    return ok(member);
  }

  async updateMember(input: {
    tripId: string;
    targetUserId: string;
    actorUserId: string;
    dto: UpdateTripMemberDto;
  }): Promise<ServiceResult<TripMember>> {
    const permission = await this.canManageTrip(
      input.tripId,
      input.actorUserId,
    );
    if (!permission.ok) return permission;
    const before = await this.trips.findMember({
      tripId: input.tripId,
      userId: input.targetUserId,
    });
    if (!before) return notFound("Trip member not found");
    if (
      before.role === "host" &&
      (input.dto.role !== undefined ||
        (input.dto.status !== undefined && input.dto.status !== "active"))
    ) {
      return forbidden(
        "The trip host role and active membership are protected",
        "host_member_locked",
      );
    }

    const updated = await this.trips.updateMember({
      tripId: input.tripId,
      userId: input.targetUserId,
      role: input.dto.role,
      status: input.dto.status,
    });
    if (!updated) return notFound("Trip member not found");

    await this.trips.audit({
      tripId: input.tripId,
      actorUserId: input.actorUserId,
      entityType: "trip_member",
      entityId: input.targetUserId,
      action: "updated",
      before,
      after: updated,
    });
    return ok(updated);
  }

  async listAuditLogs(input: {
    tripId: string;
    actorUserId: string;
    limit: number;
  }): Promise<ServiceResult<TripAuditLog[]>> {
    const permission = await this.canManageTrip(
      input.tripId,
      input.actorUserId,
    );
    if (!permission.ok) return permission;
    return ok(
      await this.trips.listAuditLogs({
        tripId: input.tripId,
        limit: input.limit,
      }),
    );
  }

  private async canManageTrip(
    tripId: string,
    userId: string,
  ): Promise<ServiceResult<TripMember>> {
    const member = await this.trips.findMember({ tripId, userId });
    if (!member || member.status !== "active")
      return notFound("Trip not found");
    if (!getTripRolePermissions(member.role).manageMembers) {
      return forbidden(
        "Only host or co-host can manage this trip",
        "trip_management_forbidden",
      );
    }
    return ok(member);
  }
}

function randomToken(): string {
  return randomBytes(24).toString("base64url");
}

function addDays(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
