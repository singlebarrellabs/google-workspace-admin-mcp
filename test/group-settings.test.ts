import { OAuth2Client } from "google-auth-library";
import nock from "nock";
import { afterEach, describe, expect, it } from "vitest";
import { GroupSettingsService } from "../src/services/group-settings.js";
import { SETTING_NAMES } from "../src/services/group-settings-catalog.js";

function service(): GroupSettingsService {
  const auth = new OAuth2Client({
    clientId: "client-id.apps.googleusercontent.com",
    clientSecret: "placeholder",
  });
  auth.setCredentials({ access_token: "test-token", expiry_date: Date.now() + 3_600_000 });
  return new GroupSettingsService(auth);
}

function groupPath(groupEmail: string): string {
  return `/groups/v1/groups/${groupEmail}`;
}

afterEach(() => {
  nock.cleanAll();
});

describe("group settings read", () => {
  it("normalises the response into membership, posting, moderation and delivery", async () => {
    nock("https://www.googleapis.com").get(groupPath("team%40example.com")).query(true).reply(200, {
      email: "team@example.com",
      name: "Team",
      whoCanJoin: "INVITED_CAN_JOIN",
      whoCanPostMessage: "ALL_MEMBERS_CAN_POST",
      messageModerationLevel: "MODERATE_NONE",
      sendMessageDenyNotification: "false",
      futureSetting: "keep-me",
    });

    const view = await service().getSettings("team@example.com");

    expect(view.group).toBe("team@example.com");
    expect(view.name).toBe("Team");
    expect(view.groups.membership).toEqual({ whoCanJoin: "INVITED_CAN_JOIN" });
    expect(view.groups.posting).toEqual({ whoCanPostMessage: "ALL_MEMBERS_CAN_POST" });
    expect(view.groups.moderation).toEqual({ messageModerationLevel: "MODERATE_NONE" });
    expect(view.groups.delivery).toEqual({ sendMessageDenyNotification: "false" });
    expect(view.other).toEqual({
      futureSetting: "keep-me",
      email: "team@example.com",
      name: "Team",
    });
  });

  it("turns a 403 into permission_denied naming owners and managers", async () => {
    nock("https://www.googleapis.com")
      .get(groupPath("team%40example.com"))
      .query(true)
      .reply(403, {
        error: { code: 403, message: "Not Authorized to access this resource/api" },
      });

    const error = await service()
      .getSettings("team@example.com")
      .catch((caught: unknown) => caught as { category: string; message: string });

    expect(error.category).toBe("permission_denied");
    expect(error.message).toContain("Only owners and managers of the group");
  });
});

describe("group settings update", () => {
  it("sends only the supplied setting", async () => {
    nock("https://www.googleapis.com")
      .get(groupPath("team%40example.com"))
      .query(true)
      .reply(200, { email: "team@example.com", whoCanJoin: "INVITED_CAN_JOIN" });

    const patch = nock("https://www.googleapis.com")
      .patch(groupPath("team%40example.com"), { whoCanJoin: "ANYONE_CAN_JOIN" })
      .query(true)
      .reply(200, {});

    nock("https://www.googleapis.com").get(groupPath("team%40example.com")).query(true).reply(200, {
      email: "team@example.com",
      whoCanJoin: "ANYONE_CAN_JOIN",
      whoCanPostMessage: "ALL_MEMBERS_CAN_POST",
    });

    const result = await service().updateSettings("team@example.com", {
      whoCanJoin: "ANYONE_CAN_JOIN",
    });

    expect(patch.isDone()).toBe(true);
    expect(result.requested).toEqual({ whoCanJoin: "ANYONE_CAN_JOIN" });
    expect(result.previous.membership).toEqual({ whoCanJoin: "INVITED_CAN_JOIN" });
    expect(result.current.groups.posting).toEqual({ whoCanPostMessage: "ALL_MEMBERS_CAN_POST" });
  });

  it("refuses an unknown setting before any request", async () => {
    const error = await service()
      .updateSettings("team@example.com", { whoCanFly: "true" })
      .catch(
        (caught: unknown) => caught as { category: string; message: string; nextStep?: string },
      );

    expect(error.category).toBe("invalid_request");
    expect(error.message).toContain("whoCanFly");
    expect(error.nextStep).toContain("whoCanJoin");
  });

  it("refuses an empty update", async () => {
    await expect(service().updateSettings("team@example.com", {})).rejects.toMatchObject({
      category: "invalid_request",
    });
  });

  it("keeps the integer byte limit an integer", async () => {
    nock("https://www.googleapis.com")
      .get(groupPath("team%40example.com"))
      .query(true)
      .reply(200, { email: "team@example.com" });

    const patch = nock("https://www.googleapis.com")
      .patch(groupPath("team%40example.com"), { maxMessageBytes: 2048 })
      .query(true)
      .reply(200, {});

    nock("https://www.googleapis.com")
      .get(groupPath("team%40example.com"))
      .query(true)
      .reply(200, { email: "team@example.com", maxMessageBytes: "2048" });

    await service().updateSettings("team@example.com", { maxMessageBytes: 2048 });

    expect(patch.isDone()).toBe(true);
  });

  it("stringifies booleans for the API body", async () => {
    nock("https://www.googleapis.com")
      .get(groupPath("team%40example.com"))
      .query(true)
      .reply(200, { email: "team@example.com" });

    const patch = nock("https://www.googleapis.com")
      .patch(groupPath("team%40example.com"), { allowExternalMembers: "true" })
      .query(true)
      .reply(200, {});

    nock("https://www.googleapis.com")
      .get(groupPath("team%40example.com"))
      .query(true)
      .reply(200, { email: "team@example.com", allowExternalMembers: "true" });

    await service().updateSettings("team@example.com", { allowExternalMembers: true });

    expect(patch.isDone()).toBe(true);
  });
});

describe("settings catalog", () => {
  it("has no duplicate names across groups", () => {
    expect(new Set(SETTING_NAMES).size).toBe(SETTING_NAMES.length);
  });
});
