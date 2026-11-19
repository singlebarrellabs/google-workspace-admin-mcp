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

afterEach(() => {
  nock.cleanAll();
});

describe("directory users", () => {
  it("lists users and exposes the next page token", async () => {
    nock("https://admin.googleapis.com")
      .get("/admin/directory/v1/users")
      .query({ customer: "my_customer", maxResults: 100 })
      .reply(200, {
        users: [
          {
            id: "1001",
            primaryEmail: "user-1@example.com",
            name: { fullName: "User One" },
            suspended: false,
            orgUnitPath: "/",
          },
        ],
        nextPageToken: "page-2",
      });

    const result = await service().listUsers({});
    expect(result.items).toHaveLength(1);
    expect(result.items[0].primaryEmail).toBe("user-1@example.com");
    expect(result.nextPageToken).toBe("page-2");
  });

  it("folds the org unit filter into the query string", async () => {
    const scope = nock("https://admin.googleapis.com")
      .get("/admin/directory/v1/users")
      .query({
        customer: "my_customer",
        maxResults: 5,
        query: "email:user-2@example.com orgUnitPath='/Engineering'",
      })
      .reply(200, { users: [] });

    const result = await service().listUsers({
      query: "email:user-2@example.com",
      orgUnitPath: "/Engineering",
      maxResults: 5,
    });

    expect(result.items).toEqual([]);
    expect(result.nextPageToken).toBeUndefined();
    expect(scope.isDone()).toBe(true);
  });

  it("maps a 403 to permission_denied", async () => {
    nock("https://admin.googleapis.com")
      .get("/admin/directory/v1/users")
      .query(true)
      .reply(403, {
        error: { code: 403, message: "Not Authorized", errors: [{ reason: "forbidden" }] },
      });

    await expect(service().listUsers({})).rejects.toMatchObject({ category: "permission_denied" });
  });

  it("suspends a user with a PATCH body and returns the new state", async () => {
    const scope = nock("https://admin.googleapis.com")
      .patch("/admin/directory/v1/users/user-3%40example.com", { suspended: true })
      .reply(200, {
        id: "1003",
        primaryEmail: "user-3@example.com",
        suspended: true,
      });

    const user = await service().suspendUser("user-3@example.com");
    expect(user.suspended).toBe(true);
    expect(scope.isDone()).toBe(true);
  });
});
