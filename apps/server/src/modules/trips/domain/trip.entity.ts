export type Trip = {
  id: string;
  title: string;
  status: string;
  visibility: string;
  ownerUserId: string;
  createdAt: string;
};

export type TripMemberRole = "host" | "co_host" | "contributor" | "viewer";
export type TripMemberStatus = "invited" | "active" | "removed";

export type TripMember = {
  tripId: string;
  userId: string;
  displayName?: string | null;
  email?: string | null;
  role: TripMemberRole;
  status: TripMemberStatus;
  invitedByUserId: string | null;
  invitedByDisplayName?: string | null;
  invitedByEmail?: string | null;
  joinedAt: string;
};

export type TripInvite = {
  id: string;
  tripId: string;
  invitedByUserId: string;
  email: string | null;
  role: TripMemberRole;
  token: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string | null;
  acceptedByUserId: string | null;
  acceptedAt: string | null;
  createdAt: string;
};

export type TripShareLink = {
  tripId: string;
  enabled: boolean;
  shareToken: string | null;
  role: TripMemberRole;
};

export type TripAuditLog = {
  id: string;
  tripId: string | null;
  actorUserId: string | null;
  entityType: string;
  entityId: string | null;
  action: string;
  beforeSnapshot: Record<string, unknown> | null;
  afterSnapshot: Record<string, unknown> | null;
  createdAt: string;
};
