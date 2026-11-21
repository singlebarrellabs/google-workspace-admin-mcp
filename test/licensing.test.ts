import { OAuth2Client } from "google-auth-library";
import nock from "nock";
import { afterEach, describe, expect, it } from "vitest";
import { LicensingService } from "../src/services/licensing.js";

function service(): LicensingService {
  const auth = new OAuth2Client({
    clientId: "client-id.apps.googleusercontent.com",
    clientSecret: "placeholder",
  });
  auth.setCredentials({ access_token: "test-token", expiry_date: Date.now() + 3_600_000 });
  return new LicensingService(auth);
}

const base = "/apps/licensing/v1/product/Google-Apps";
const skuBase = `${base}/sku/Google-Apps-For-Business`;

afterEach(() => {
  nock.cleanAll();
});

describe("license assignments", () => {
  it("lists assignments for a product and sku", async () => {
    nock("https://licensing.googleapis.com")
      .get(`${skuBase}/users`)
      .query(true)
      .reply(200, {
        items: [
          {
            userId: "user-1@example.com",
            productId: "Google-Apps",
            skuId: "Google-Apps-For-Business",
            skuName: "Workspace Business",
          },
        ],
        nextPageToken: "page-2",
      });

    const result = await service().listAssignments({
      productId: "Google-Apps",
      skuId: "Google-Apps-For-Business",
    });

    expect(result.items[0]).toEqual({
      userId: "user-1@example.com",
      productId: "Google-Apps",
      skuId: "Google-Apps-For-Business",
      skuName: "Workspace Business",
    });
    expect(result.nextPageToken).toBe("page-2");
  });

  it("falls back to the product-wide listing without a sku", async () => {
    const scope = nock("https://licensing.googleapis.com")
      .get(`${base}/users`)
      .query(true)
      .reply(200, { items: [] });

    const result = await service().listAssignments({ productId: "Google-Apps" });

    expect(result.items).toEqual([]);
  });

  it("gets one assignment", async () => {
    nock("https://licensing.googleapis.com")
      .get(`${skuBase}/user/user-1%40example.com`)
      .query(true)
      .reply(200, { userId: "user-1@example.com", skuId: "Google-Apps-For-Business" });

    const assignment = await service().getAssignment({
      productId: "Google-Apps",
      skuId: "Google-Apps-For-Business",
      userId: "user-1@example.com",
    });

    expect(assignment.userId).toBe("user-1@example.com");
  });

  it("assigns a seat", async () => {
    const scope = nock("https://licensing.googleapis.com")
      .post(`${skuBase}/user`, { userId: "user-1@example.com" })
      .query(true)
      .reply(200, { userId: "user-1@example.com", skuId: "Google-Apps-For-Business" });

    const result = await service().assign({
      productId: "Google-Apps",
      skuId: "Google-Apps-For-Business",
      userId: "user-1@example.com",
    });

    expect(scope.isDone()).toBe(true);
    expect(result.alreadyAssigned).toBe(false);
  });

  it("reports an existing assignment instead of failing on a duplicate", async () => {
    nock("https://licensing.googleapis.com")
      .post(`${skuBase}/user`)
      .query(true)
      .reply(409, {
        error: { code: 409, message: "The user already holds this license." },
      });
    nock("https://licensing.googleapis.com")
      .get(`${skuBase}/user/user-1%40example.com`)
      .query(true)
      .reply(200, { userId: "user-1@example.com", skuId: "Google-Apps-For-Business" });

    const result = await service().assign({
      productId: "Google-Apps",
      skuId: "Google-Apps-For-Business",
      userId: "user-1@example.com",
    });

    expect(result.alreadyAssigned).toBe(true);
    expect(result.assignment.userId).toBe("user-1@example.com");
  });

  it("says no seats are available when the subscription is exhausted", async () => {
    nock("https://licensing.googleapis.com")
      .post(`${skuBase}/user`)
      .query(true)
      .reply(412, {
        error: { code: 412, message: "Subscription count exceeded." },
      });

    await expect(
      service().assign({
        productId: "Google-Apps",
        skuId: "Google-Apps-For-Business",
        userId: "user-2@example.com",
      }),
    ).rejects.toMatchObject({
      category: "invalid_request",
      message: expect.stringContaining("No license seats are available"),
    });
  });

  it("revokes a seat", async () => {
    const scope = nock("https://licensing.googleapis.com")
      .delete(`${skuBase}/user/user-1%40example.com`)
      .query(true)
      .reply(200, {});

    const assignment = await service().revoke({
      productId: "Google-Apps",
      skuId: "Google-Apps-For-Business",
      userId: "user-1@example.com",
    });

    expect(scope.isDone()).toBe(true);
    expect(assignment).toEqual({
      userId: "user-1@example.com",
      productId: "Google-Apps",
      skuId: "Google-Apps-For-Business",
    });
  });
});
