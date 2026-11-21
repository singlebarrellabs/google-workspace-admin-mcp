import { OAuth2Client } from "google-auth-library";
import nock from "nock";
import { afterEach, describe, expect, it } from "vitest";
import { GroupsService } from "../src/services/directory-groups.js";

function service(): GroupsService {
  const auth = new OAuth2Client({
    clientId: "client-id.apps.googleusercontent.com",
    clientSecret: "placeholder",
  });
  auth.setCredentials({ access_token: "test-token", expiry_date: Date.now() + 3_600_000 });
  return new GroupsService(auth);
}

function groupPath(groupKey: string): string {
  return `/admin/directory/v1/groups/${groupKey}`;
}

afterEach(() => {
  nock.cleanAll();
});

describe("groups", () => {
  it("lists groups with a next page token", async () => {
    nock("https://admin.googleapis.com")
      .get("/admin/directory/v1/groups")
      .query(true)
      .reply(200, {
        groups: [{ id: "g1", email: "team@example.com", name: "Team", directMembersCount: "4" }],
        nextPageToken: "page-2",
      });

    const result = await service().listGroups({});

    expect(result.items[0]).toEqual({
      id: "g1",
      email: "team@example.com",
      name: "Team",
      directMembersCount: "4",
    });
    expect(result.nextPageToken).toBe("page-2");
  });

  it("creates a group", async () => {
    const scope = nock("https://admin.googleapis.com")
      .post("/admin/directory/v1/groups", {
        email: "new-team@example.com",
        name: "New Team",
        description: "Project group",
      })
      .query(true)
      .reply(200, { id: "g2", email: "new-team@example.com", name: "New Team" });

    const group = await service().createGroup({
      email: "new-team@example.com",
      name: "New Team",
      description: "Project group",
    });

    expect(scope.isDone()).toBe(true);
    expect(group.email).toBe("new-team@example.com");
  });

  it("patches only the supplied group fields", async () => {
    const scope = nock("https://admin.googleapis.com")
      .patch(groupPath("team%40example.com"), { description: "Renamed purpose" })
      .query(true)
      .reply(200, { id: "g1", email: "team@example.com" });

    await service().patchGroup("team@example.com", { description: "Renamed purpose" });

    expect(scope.isDone()).toBe(true);
  });

  it("refuses an empty group patch", async () => {
    await expect(service().patchGroup("team@example.com", {})).rejects.toMatchObject({
      category: "invalid_request",
    });
  });

  it("deletes a group", async () => {
    const scope = nock("https://admin.googleapis.com")
      .delete(groupPath("team%40example.com"))
      .query(true)
      .reply(200, {});

    await service().deleteGroup("team@example.com");

    expect(scope.isDone()).toBe(true);
  });
});

describe("members", () => {
  const membersPath = `${groupPath("team%40example.com")}/members`;

  it("lists members and forwards the role filter", async () => {
    const scope = nock("https://admin.googleapis.com")
      .get(membersPath)
      .query((query) => {
        expect(query.roles).toBe("OWNER,MANAGER");
        return true;
      })
      .reply(200, {
        members: [
          { id: "m1", email: "owner@example.com", role: "OWNER", type: "USER", status: "ACTIVE" },
        ],
      });

    const result = await service().listMembers({
      groupKey: "team@example.com",
      roles: "OWNER,MANAGER",
    });

    expect(scope.isDone()).toBe(true);
    expect(result.items[0].role).toBe("OWNER");
  });

  it("gets one membership", async () => {
    nock("https://admin.googleapis.com")
      .get(`${membersPath}/owner%40example.com`)
      .query(true)
      .reply(200, { email: "owner@example.com", role: "OWNER", type: "USER" });

    const member = await service().getMember("team@example.com", "owner@example.com");

    expect(member.role).toBe("OWNER");
  });

  it("adds a member as MEMBER by default", async () => {
    const scope = nock("https://admin.googleapis.com")
      .post(membersPath, { email: "new@example.com", role: "MEMBER", type: "USER" })
      .query(true)
      .reply(200, { email: "new@example.com", role: "MEMBER", type: "USER" });

    const member = await service().addMember({
      groupKey: "team@example.com",
      email: "new@example.com",
    });

    expect(scope.isDone()).toBe(true);
    expect(member.role).toBe("MEMBER");
  });

  it("adds a nested group as an OWNER when asked", async () => {
    const scope = nock("https://admin.googleapis.com")
      .post(membersPath, { email: "leads@example.com", role: "OWNER", type: "GROUP" })
      .query(true)
      .reply(200, { email: "leads@example.com", role: "OWNER", type: "GROUP" });

    await service().addMember({
      groupKey: "team@example.com",
      email: "leads@example.com",
      role: "OWNER",
      type: "GROUP",
    });

    expect(scope.isDone()).toBe(true);
  });

  it("removes a member", async () => {
    const scope = nock("https://admin.googleapis.com")
      .delete(`${membersPath}/new%40example.com`)
      .query(true)
      .reply(200, {});

    await service().removeMember("team@example.com", "new@example.com");

    expect(scope.isDone()).toBe(true);
  });

  it("maps a 404 to not_found", async () => {
    nock("https://admin.googleapis.com")
      .get(groupPath("missing%40example.com"))
      .query(true)
      .reply(404, { error: { code: 404, message: "Resource Not Found: groupKey" } });

    await expect(service().getGroup("missing@example.com")).rejects.toMatchObject({
      category: "not_found",
    });
  });
});
