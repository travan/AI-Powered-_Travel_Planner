export type TripRole = "host" | "co_host" | "contributor" | "viewer";
export type ApprovalStatus = "pending" | "approved";

export function canWriteTrip(role: TripRole): boolean {
  return role !== "viewer";
}

export function canModerateTrip(role: TripRole): boolean {
  return role === "host" || role === "co_host";
}

export function approvalStatusForNewContribution(role: TripRole): ApprovalStatus {
  return canModerateTrip(role) ? "approved" : "pending";
}

export function canUpdateOwnedOrModerated(input: {
  role: TripRole;
  actorUserId: string;
  ownerUserId: string | null;
  assignedUserId?: string | null;
}): boolean {
  if (canModerateTrip(input.role)) return true;
  if (!canWriteTrip(input.role)) return false;
  return input.ownerUserId === input.actorUserId || input.assignedUserId === input.actorUserId;
}

export function buildEqualSplits(input: {
  amount: number;
  userIds: string[];
}): Array<{ userId: string; shareAmount: number; sharePercent: number }> {
  const uniqueUserIds = [...new Set(input.userIds.filter(Boolean))];
  if (uniqueUserIds.length === 0) {
    throw new Error("At least one split member is required");
  }

  const baseShare = Math.floor(input.amount / uniqueUserIds.length);
  const remainder = Math.round(input.amount - baseShare * uniqueUserIds.length);
  const percent = Number((100 / uniqueUserIds.length).toFixed(2));

  return uniqueUserIds.map((userId, index) => ({
    userId,
    shareAmount: baseShare + (index === 0 ? remainder : 0),
    sharePercent: percent,
  }));
}
