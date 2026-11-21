import type {
  Trip,
  TripAuditLog,
  TripInvite,
  TripMember,
  TripMemberRole,
  TripMemberStatus,
  TripShareLink,
} from "./trip.entity.js";
import type { TripSummary } from "@travel/types";

export const TRIP_REPOSITORY = Symbol("TRIP_REPOSITORY");

export interface TripRepository {
  listForUser(userId: string): Promise<TripSummary[]>;
  findForUser(input: { tripId: string; userId: string }): Promise<Trip | null>;
  findMember(input: {
    tripId: string;
    userId: string;
  }): Promise<TripMember | null>;
  listMembers(tripId: string): Promise<TripMember[]>;
  createInvite(input: {
    tripId: string;
    invitedByUserId: string;
    email?: string;
    role: TripMemberRole;
    token: string;
    expiresAt?: string;
  }): Promise<TripInvite>;
  findInviteByToken(token: string): Promise<TripInvite | null>;
  findInviteById(input: {
    tripId: string;
    id: string;
  }): Promise<TripInvite | null>;
  acceptInvite(input: {
    inviteId: string;
    userId: string;
  }): Promise<TripInvite>;
  upsertMember(input: {
    tripId: string;
    userId: string;
    role: TripMemberRole;
    invitedByUserId?: string | null;
  }): Promise<TripMember>;
  setShareLink(input: {
    tripId: string;
    enabled: boolean;
    role: TripMemberRole;
    token?: string | null;
  }): Promise<TripShareLink>;
  findShareLink(token: string): Promise<TripShareLink | null>;
  updateMember(input: {
    tripId: string;
    userId: string;
    role?: TripMemberRole;
    status?: TripMemberStatus;
  }): Promise<TripMember | null>;
  audit(input: {
    tripId: string;
    actorUserId: string;
    entityType: string;
    entityId?: string;
    action: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
  }): Promise<void>;
  listAuditLogs(input: {
    tripId: string;
    limit: number;
  }): Promise<TripAuditLog[]>;
}
