export type TripRole = "host" | "co_host" | "contributor" | "viewer";

export type TripRolePermissions = {
  manageMembers: boolean;
  contribute: boolean;
  viewMembers: boolean;
  viewFinance: boolean;
  reviewSubmissions: boolean;
  viewAudit: boolean;
};

export const TRIP_ROLE_PERMISSIONS: Record<TripRole, TripRolePermissions> = {
  host: {
    manageMembers: true,
    contribute: true,
    viewMembers: true,
    viewFinance: true,
    reviewSubmissions: true,
    viewAudit: true,
  },
  co_host: {
    manageMembers: true,
    contribute: true,
    viewMembers: true,
    viewFinance: true,
    reviewSubmissions: true,
    viewAudit: true,
  },
  contributor: {
    manageMembers: false,
    contribute: true,
    viewMembers: true,
    viewFinance: true,
    reviewSubmissions: false,
    viewAudit: false,
  },
  viewer: {
    manageMembers: false,
    contribute: false,
    viewMembers: false,
    viewFinance: false,
    reviewSubmissions: false,
    viewAudit: false,
  },
};

export function getTripRolePermissions(role: TripRole): TripRolePermissions {
  return TRIP_ROLE_PERMISSIONS[role];
}
