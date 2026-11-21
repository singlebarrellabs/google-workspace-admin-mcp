import { OAuth2Client } from "google-auth-library";
import nock from "nock";
import { afterEach, describe, expect, it } from "vitest";
import { RolesService } from "../src/services/roles.js";

function service(): RolesService {
  const auth = new OAuth2Client({
    clientId: "client-id.apps.googleusercontent.com",
    clientSecret: "placeholder",
  });
  auth.setCredentials({ access_token: "test-token", expiry_date: Date.now() + 3_600_000 });
  return new RolesService(auth);
}

const rolesPath = "/admin/directory/v1/customer/my_customer/roles";
const assignmentsPath = "/admin/directory/v1/customer/my_customer/roleassignments";

afterEach(() => {
  nock.cleanAll();
});

describe("roles", () => {
  it("lists custom and system roles", async () => {
    nock("https://admin.googleapis.com")
      .get(rolesPath)
      .query(true)
      .reply(200, {
        items: [
          { roleId: "1001", roleName: "Help Desk", isSystemRole: false },
          { roleId: "2001", roleName: "Super Admin", isSystemRole: true },
        ],
      });

    const result = await service().listRoles();

    expect(result.items).toHaveLength(2);
    expect(result.items[0].isSystemRole).toBe(false);
  });

  it("lists privileges with their service ids", async () => {
    nock("https://admin.googleapis.com")
      .get("/admin/directory/v1/customer/my_customer/roles/ALL/privileges")
      .query(true)
      .reply(200, {
        items: [{ serviceId: "06", serviceName: "Directory", privilegeName: "USERS_UPDATE" }],
      });

    const privileges = await service().listPrivileges();

    expect(privileges[0]).toEqual({
      serviceId: "06",
      serviceName: "Directory",
      privilegeName: "USERS_UPDATE",
    });
  });

  it("creates a custom role from an explicit privilege list", async () => {
    const scope = nock("https://admin.googleapis.com")
      .post(rolesPath, {
        roleName: "Help Desk",
        rolePrivileges: [{ serviceId: "06", privilegeName: "USERS_UPDATE" }],
      })
      .query(true)
      .reply(200, { roleId: "1002", roleName: "Help Desk", isSystemRole: false });

    const role = await service().insertRole({
      roleName: "Help Desk",
      privileges: [{ serviceId: "06", privilegeName: "USERS_UPDATE" }],
    });

    expect(scope.isDone()).toBe(true);
    expect(role.roleId).toBe("1002");
  });

  it("deletes a custom role", async () => {
    const scope = nock("https://admin.googleapis.com")
      .delete(`${rolesPath}/1002`)
      .query(true)
      .reply(200, {});

    await service().deleteRole("1002");

    expect(scope.isDone()).toBe(true);
  });
});

describe("role assignments", () => {
  it("lists assignments for one user", async () => {
    const scope = nock("https://admin.googleapis.com")
      .get(assignmentsPath)
      .query((query) => {
        expect(query.userKey).toBe("user-1@example.com");
        return true;
      })
      .reply(200, {
        items: [{ roleAssignmentId: "a1", roleId: "1002", assignedTo: "user-1@example.com" }],
      });

    const result = await service().listAssignments({ userKey: "user-1@example.com" });

    expect(scope.isDone()).toBe(true);
    expect(result.items[0].roleAssignmentId).toBe("a1");
  });

  it("grants a role over one org unit", async () => {
    const scope = nock("https://admin.googleapis.com")
      .post(assignmentsPath, {
        roleId: "1002",
        assignedTo: "user-1@example.com",
        scopeType: "ORG_UNIT",
        orgUnitId: "ou1",
      })
      .query(true)
      .reply(200, { roleAssignmentId: "a2", roleId: "1002" });

    const assignment = await service().insertAssignment({
      roleId: "1002",
      assignedTo: "user-1@example.com",
      scopeType: "ORG_UNIT",
      orgUnitId: "ou1",
    });

    expect(scope.isDone()).toBe(true);
    expect(assignment.roleAssignmentId).toBe("a2");
  });

  it("revokes an assignment", async () => {
    const scope = nock("https://admin.googleapis.com")
      .delete(`${assignmentsPath}/a2`)
      .query(true)
      .reply(200, {});

    await service().deleteAssignment("a2");

    expect(scope.isDone()).toBe(true);
  });

  it("maps a 403 on assignment insert to permission_denied", async () => {
    nock("https://admin.googleapis.com")
      .post(assignmentsPath)
      .query(true)
      .reply(403, {
        error: { code: 403, message: "Not Authorized", errors: [{ reason: "forbidden" }] },
      });

    await expect(
      service().insertAssignment({
        roleId: "1002",
        assignedTo: "user-1@example.com",
        scopeType: "CUSTOMER",
      }),
    ).rejects.toMatchObject({ category: "permission_denied" });
  });
});
