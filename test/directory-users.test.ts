import { OAuth2Client } from "google-auth-library";
import nock from "nock";
import { afterEach, describe, expect, it } from "vitest";
import { DirectoryService } from "../src/services/directory.js";

function service(): DirectoryService {
  const auth = new OAuth2Client({
    clientId: "client-id.apps.googleusercontent.com",
    clientSecret: "placeholder",
  });
  auth.setCredentials({ access_token: "test-token", expiry_date: Date.now() + 3_600_000 });
  return new DirectoryService(auth);
}

function userPath(userKey: string): string {
  return `/admin/directory/v1/users/${userKey}`;
}

afterEach(() => {
  nock.cleanAll();
});

describe("directory user reads", () => {
  it("gets one user with the change-password and archive flags", async () => {
    nock("https://admin.googleapis.com")
      .get(userPath("user-1%40example.com"))
      .query(true)
      .reply(200, {
        id: "1001",
        primaryEmail: "user-1@example.com",
        name: { fullName: "User One" },
        changePasswordAtNextLogin: true,
        archived: false,
        isAdmin: false,
      });

    const user = await service().getUser("user-1@example.com");

    expect(user).toEqual({
      id: "1001",
      primaryEmail: "user-1@example.com",
      fullName: "User One",
      changePasswordAtNextLogin: true,
      archived: false,
      isAdmin: false,
    });
  });

  it("asks for deleted users only when showDeleted is set", async () => {
    const scope = nock("https://admin.googleapis.com")
      .get("/admin/directory/v1/users")
      .query((query) => {
        expect(query.showDeleted).toBe("true");
        return true;
      })
      .reply(200, { users: [] });

    await service().listUsers({ showDeleted: true });

    expect(scope.isDone()).toBe(true);
  });
});

describe("directory user writes", () => {
  it("creates a user with a forced password change and no admin flag", async () => {
    const scope = nock("https://admin.googleapis.com")
      .post("/admin/directory/v1/users", (body) => {
        expect(body).toEqual({
          primaryEmail: "user-2@example.com",
          name: { givenName: "User", familyName: "Two" },
          changePasswordAtNextLogin: true,
          orgUnitPath: "/Engineering",
        });
        return true;
      })
      .query(true)
      .reply(200, { id: "1002", primaryEmail: "user-2@example.com" });

    const user = await service().createUser({
      primaryEmail: "user-2@example.com",
      givenName: "User",
      familyName: "Two",
      orgUnitPath: "/Engineering",
    });

    expect(scope.isDone()).toBe(true);
    expect(user.primaryEmail).toBe("user-2@example.com");
  });

  it("patches only the supplied fields", async () => {
    const scope = nock("https://admin.googleapis.com")
      .patch(userPath("user-3%40example.com"), { name: { givenName: "Re", familyName: "Named" } })
      .query(true)
      .reply(200, { id: "1003", primaryEmail: "user-3@example.com" });

    await service().patchUser("user-3@example.com", {
      fullName: { givenName: "Re", familyName: "Named" },
    });

    expect(scope.isDone()).toBe(true);
  });

  it("refuses an empty patch instead of sending a blank request", async () => {
    await expect(service().patchUser("user-3@example.com", {})).rejects.toMatchObject({
      category: "invalid_request",
    });
  });

  it("unsuspends through the same patch path as suspend", async () => {
    const scope = nock("https://admin.googleapis.com")
      .patch(userPath("user-4%40example.com"), { suspended: false })
      .query(true)
      .reply(200, { id: "1004", primaryEmail: "user-4@example.com", suspended: false });

    const user = await service().unsuspendUser("user-4@example.com");

    expect(scope.isDone()).toBe(true);
    expect(user.suspended).toBe(false);
  });

  it("deletes a user", async () => {
    const scope = nock("https://admin.googleapis.com")
      .delete(userPath("user-5%40example.com"))
      .query(true)
      .reply(200, {});

    await service().deleteUser("user-5@example.com");

    expect(scope.isDone()).toBe(true);
  });

  it("restores a deleted user into an org unit", async () => {
    const undelete = nock("https://admin.googleapis.com")
      .post(`${userPath("user-6%40example.com")}/undelete`, { orgUnitPath: "/Engineering" })
      .query(true)
      .reply(200, {});
    const readBack = nock("https://admin.googleapis.com")
      .get(userPath("user-6%40example.com"))
      .query(true)
      .reply(200, {
        id: "1006",
        primaryEmail: "user-6@example.com",
        orgUnitPath: "/Engineering",
      });

    const user = await service().undeleteUser("user-6@example.com", "/Engineering");

    expect(undelete.isDone()).toBe(true);
    expect(readBack.isDone()).toBe(true);
    expect(user.orgUnitPath).toBe("/Engineering");
  });
});

describe("directory aliases", () => {
  it("lists aliases", async () => {
    nock("https://admin.googleapis.com")
      .get(`${userPath("user-7%40example.com")}/aliases`)
      .query(true)
      .reply(200, {
        aliases: [{ alias: "sales@example.com", primaryEmail: "user-7@example.com" }],
      });

    const aliases = await service().listAliases("user-7@example.com");

    expect(aliases).toEqual([{ alias: "sales@example.com", primaryEmail: "user-7@example.com" }]);
  });

  it("adds an alias", async () => {
    const scope = nock("https://admin.googleapis.com")
      .post(`${userPath("user-7%40example.com")}/aliases`, { alias: "support@example.com" })
      .query(true)
      .reply(200, { alias: "support@example.com", primaryEmail: "user-7@example.com" });

    const alias = await service().insertAlias("user-7@example.com", "support@example.com");

    expect(scope.isDone()).toBe(true);
    expect(alias.alias).toBe("support@example.com");
  });

  it("removes an alias", async () => {
    const scope = nock("https://admin.googleapis.com")
      .delete(`${userPath("user-7%40example.com")}/aliases/support%40example.com`)
      .query(true)
      .reply(200, {});

    await service().deleteAlias("user-7@example.com", "support@example.com");

    expect(scope.isDone()).toBe(true);
  });

  it("maps a 409 on alias insert to invalid_request", async () => {
    nock("https://admin.googleapis.com")
      .post(`${userPath("user-7%40example.com")}/aliases`)
      .query(true)
      .reply(409, {
        error: { code: 409, message: "Entity already exists.", errors: [{ reason: "duplicate" }] },
      });

    await expect(
      service().insertAlias("user-7@example.com", "support@example.com"),
    ).rejects.toMatchObject({ message: expect.stringContaining("already exists") });
  });
});
