import { describe, expect, it } from "vitest";
import { getTripRolePermissions } from "../../../../../packages/types/src/trip-permissions";
import { getTripRolePermissions as getServerTripRolePermissions } from "../../../../../apps/server/src/shared/application/trip-role-permissions";

describe("trip role permissions", () => {
  it("gives host and co-host full operational access", () => {
    expect(getTripRolePermissions("host")).toEqual({
      manageMembers: true,
      contribute: true,
      viewMembers: true,
      viewFinance: true,
      reviewSubmissions: true,
      viewAudit: true,
    });
    expect(getTripRolePermissions("co_host")).toEqual(
      getTripRolePermissions("host"),
    );
  });

  it("limits contributors to collaborative planning and finance", () => {
    expect(getTripRolePermissions("contributor")).toEqual({
      manageMembers: false,
      contribute: true,
      viewMembers: true,
      viewFinance: true,
      reviewSubmissions: false,
      viewAudit: false,
    });
  });

  it("keeps viewers read-only without member or finance access", () => {
    expect(getTripRolePermissions("viewer")).toEqual({
      manageMembers: false,
      contribute: false,
      viewMembers: false,
      viewFinance: false,
      reviewSubmissions: false,
      viewAudit: false,
    });
  });

  it("keeps the server runtime matrix aligned with the shared web contract", () => {
    for (const role of ["host", "co_host", "contributor", "viewer"] as const) {
      expect(getServerTripRolePermissions(role)).toEqual(
        getTripRolePermissions(role),
      );
    }
  });
});
