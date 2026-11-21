import { OAuth2Client } from "google-auth-library";
import nock from "nock";
import { afterEach, describe, expect, it } from "vitest";
import { DevicesService } from "../src/services/devices.js";
import { UserSecurityService } from "../src/services/user-security.js";
import { userSecurityTools } from "../src/tools/directory/user-security.js";

function auth(): OAuth2Client {
  const client = new OAuth2Client({
    clientId: "client-id.apps.googleusercontent.com",
    clientSecret: "placeholder",
  });
  client.setCredentials({ access_token: "test-token", expiry_date: Date.now() + 3_600_000 });
  return client;
}

const mobilePath = "/admin/directory/v1/customer/my_customer/devices/mobile";
const chromeOsPath = "/admin/directory/v1/customer/my_customer/devices/chromeos";

afterEach(() => {
  nock.cleanAll();
});

describe("mobile devices", () => {
  it("lists devices and keeps the owner addresses", async () => {
    nock("https://admin.googleapis.com")
      .get(mobilePath)
      .query(true)
      .reply(200, {
        mobiledevices: [
          {
            resourceId: "r1",
            deviceId: "d1",
            model: "Phone",
            os: "Android",
            status: "APPROVED",
            email: ["user-1@example.com"],
            lastSync: "2026-11-18T10:00:00.000Z",
          },
        ],
      });

    const result = await new DevicesService(auth()).listMobileDevices({});

    expect(result.items[0]).toEqual({
      resourceId: "r1",
      deviceId: "d1",
      model: "Phone",
      os: "Android",
      status: "APPROVED",
      email: ["user-1@example.com"],
      lastSync: "2026-11-18T10:00:00.000Z",
    });
  });

  it("sends a wipe action", async () => {
    const scope = nock("https://admin.googleapis.com")
      .post(`${mobilePath}/r1/action`, { action: "admin_remote_wipe" })
      .query(true)
      .reply(200, {});

    const result = await new DevicesService(auth()).mobileAction("r1", "admin_remote_wipe");

    expect(scope.isDone()).toBe(true);
    expect(result).toEqual({ resourceId: "r1", action: "admin_remote_wipe" });
  });
});

describe("chromeos devices", () => {
  it("lists devices with serial and org unit", async () => {
    nock("https://admin.googleapis.com")
      .get(chromeOsPath)
      .query(true)
      .reply(200, {
        chromeosdevices: [
          {
            deviceId: "c1",
            serialNumber: "SN-1",
            model: "Chromebook",
            status: "ACTIVE",
            orgUnitPath: "/Engineering",
            annotatedUser: "user-2@example.com",
          },
        ],
      });

    const result = await new DevicesService(auth()).listChromeOsDevices({});

    expect(result.items[0].serialNumber).toBe("SN-1");
    expect(result.items[0].orgUnitPath).toBe("/Engineering");
  });

  it("deprovisions through the fleet action, naming the reason", async () => {
    const scope = nock("https://admin.googleapis.com")
      .post(`${chromeOsPath}/c1/action`, {
        action: "deprovision",
        deprovisionReason: "RETIRE",
      })
      .query(true)
      .reply(200, {});

    await new DevicesService(auth()).chromeOsAction("c1", "deprovision", "RETIRE");

    expect(scope.isDone()).toBe(true);
  });

  it("refuses a deprovision without a reason before calling the API", async () => {
    await expect(
      new DevicesService(auth()).chromeOsAction("c1", "deprovision"),
    ).rejects.toMatchObject({ category: "invalid_request" });
  });

  it("maps a 404 to not_found", async () => {
    nock("https://admin.googleapis.com")
      .get(`${chromeOsPath}/missing`)
      .query(true)
      .reply(404, { error: { code: 404, message: "Resource Not Found" } });

    await expect(new DevicesService(auth()).getChromeOsDevice("missing")).rejects.toMatchObject({
      category: "not_found",
    });
  });
});

describe("user security", () => {
  const tokenPath = "/admin/directory/v1/users/user-3%40example.com/tokens";

  it("lists app grants with scopes", async () => {
    nock("https://admin.googleapis.com")
      .get(tokenPath)
      .query(true)
      .reply(200, {
        items: [
          {
            clientId: "app-1",
            displayText: "Calendar Sync",
            scopes: ["https://www.googleapis.com/auth/calendar"],
            anonymous: false,
            nativeApp: true,
          },
        ],
      });

    const tokens = await new UserSecurityService(auth()).listTokens("user-3@example.com");

    expect(tokens[0]).toEqual({
      clientId: "app-1",
      displayText: "Calendar Sync",
      scopes: ["https://www.googleapis.com/auth/calendar"],
      anonymous: false,
      nativeApp: true,
    });
  });

  it("revokes one app grant", async () => {
    const scope = nock("https://admin.googleapis.com")
      .delete(`${tokenPath}/app-1`)
      .query(true)
      .reply(200, {});

    await new UserSecurityService(auth()).deleteToken("user-3@example.com", "app-1");

    expect(scope.isDone()).toBe(true);
  });

  it("returns the issued backup codes instead of an empty list", async () => {
    nock("https://admin.googleapis.com")
      .post("/admin/directory/v1/users/user-3%40example.com/verificationCodes/generate")
      .query(true)
      .reply(200, {});
    nock("https://admin.googleapis.com")
      .get("/admin/directory/v1/users/user-3%40example.com/verificationCodes")
      .query(true)
      .reply(200, {
        kind: "admin#directory#verificationCodesList",
        items: [{ userId: "1003", verificationCode: "123456789" }],
      });

    const codes = await new UserSecurityService(auth()).generateVerificationCodes(
      "user-3@example.com",
    );

    expect(codes).toEqual([{ userId: "1003", verificationCode: "123456789" }]);

    // Both change a user's second factor, so both are destructive-class.
    const specs = userSecurityTools(new UserSecurityService(auth())).filter((spec) =>
      spec.name.startsWith("gws_user_verification_codes_"),
    );
    expect(specs.map((spec) => spec.access)).toEqual(["destructive", "destructive"]);
    for (const spec of specs) {
      expect("confirmNote" in spec ? spec.confirmNote : "").not.toBe("");
    }
  });

  it("invalidates backup codes", async () => {
    const scope = nock("https://admin.googleapis.com")
      .post("/admin/directory/v1/users/user-3%40example.com/verificationCodes/invalidate")
      .query(true)
      .reply(200, {});

    await new UserSecurityService(auth()).invalidateVerificationCodes("user-3@example.com");

    expect(scope.isDone()).toBe(true);
  });

  it("signs a user out of every session", async () => {
    const scope = nock("https://admin.googleapis.com")
      .post("/admin/directory/v1/users/user-3%40example.com/signOut")
      .query(true)
      .reply(200, {});

    await new UserSecurityService(auth()).signOut("user-3@example.com");

    expect(scope.isDone()).toBe(true);
  });
});
