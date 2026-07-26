export type ServerTripRole = "host" | "co_host" | "contributor" | "viewer";

export type ServerTripRolePermissions = {
  manageMembers: boolean;
  contribute: boolean;
  viewMembers: boolean;
  viewFinance: boolean;
  reviewSubmissions: boolean;
  viewAudit: boolean;
};

const permissionsByRole: Record<ServerTripRole, ServerTripRolePermissions> = {
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

export function getTripRolePermissions(
  role: ServerTripRole,
): ServerTripRolePermissions {
  return permissionsByRole[role];
}
