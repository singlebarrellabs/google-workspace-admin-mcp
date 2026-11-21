import { OAuth2Client } from "google-auth-library";
import nock from "nock";
import { afterEach, describe, expect, it } from "vitest";
import { OrgUnitsService } from "../src/services/orgunits.js";

function service(): OrgUnitsService {
  const auth = new OAuth2Client({
    clientId: "client-id.apps.googleusercontent.com",
    clientSecret: "placeholder",
  });
  auth.setCredentials({ access_token: "test-token", expiry_date: Date.now() + 3_600_000 });
  return new OrgUnitsService(auth);
}

const orgUnitsPath = "/admin/directory/v1/customer/my_customer/orgunits";

/**
 * googleapis expands `{+orgUnitPath}` without encoding, so a path that already
 * starts with a slash reaches the API as a double slash. The tests pin the
 * real request instead of a tidier one that never happens.
 */
function orgUnitPath(orgUnitPath: string): string {
  return `${orgUnitsPath}/${orgUnitPath}`;
}

afterEach(() => {
  nock.cleanAll();
});

describe("org units", () => {
  it("lists the tree by default", async () => {
    const scope = nock("https://admin.googleapis.com")
      .get(orgUnitsPath)
      .query((query) => {
        expect(query.type).toBe("all");
        return true;
      })
      .reply(200, {
        organizationUnits: [{ orgUnitId: "ou1", name: "Engineering", orgUnitPath: "/Engineering" }],
      });

    const units = await service().listOrgUnits({});

    expect(scope.isDone()).toBe(true);
    expect(units[0].orgUnitPath).toBe("/Engineering");
  });

  it("gets one unit", async () => {
    nock("https://admin.googleapis.com").get(orgUnitPath("/Engineering")).query(true).reply(200, {
      orgUnitId: "ou1",
      name: "Engineering",
      orgUnitPath: "/Engineering",
      parentOrgUnitPath: "/",
      description: "Builders",
      blockInheritance: false,
    });

    const unit = await service().getOrgUnit("/Engineering");

    expect(unit).toEqual({
      orgUnitId: "ou1",
      name: "Engineering",
      orgUnitPath: "/Engineering",
      parentOrgUnitPath: "/",
      description: "Builders",
      blockInheritance: false,
    });
  });

  it("creates a unit under a parent", async () => {
    const scope = nock("https://admin.googleapis.com")
      .post(orgUnitsPath, {
        name: "Platform",
        parentOrgUnitPath: "/Engineering",
        description: "Platform team",
      })
      .query(true)
      .reply(200, { orgUnitId: "ou2", name: "Platform", orgUnitPath: "/Engineering/Platform" });

    const unit = await service().createOrgUnit({
      name: "Platform",
      parentOrgUnitPath: "/Engineering",
      description: "Platform team",
    });

    expect(scope.isDone()).toBe(true);
    expect(unit.orgUnitPath).toBe("/Engineering/Platform");
  });

  it("reads the current unit before sending a full replacement", async () => {
    nock("https://admin.googleapis.com").get(orgUnitPath("/Engineering")).query(true).reply(200, {
      name: "Engineering",
      orgUnitPath: "/Engineering",
      parentOrgUnitPath: "/",
      description: "Keep me",
      blockInheritance: true,
    });
    const put = nock("https://admin.googleapis.com")
      .put(orgUnitPath("/Engineering"), {
        name: "Engineering",
        parentOrgUnitPath: "/",
        description: "New purpose",
        blockInheritance: true,
      })
      .query(true)
      .reply(200, {
        name: "Engineering",
        orgUnitPath: "/Engineering",
        description: "New purpose",
      });

    const unit = await service().updateOrgUnit("/Engineering", { description: "New purpose" });

    expect(put.isDone()).toBe(true);
    expect(unit.description).toBe("New purpose");
  });

  it("deletes a unit", async () => {
    const scope = nock("https://admin.googleapis.com")
      .delete(orgUnitPath("/Engineering/Platform"))
      .query(true)
      .reply(200, {});

    await service().deleteOrgUnit("/Engineering/Platform");

    expect(scope.isDone()).toBe(true);
  });
});
