import { OAuth2Client } from "google-auth-library";
import nock from "nock";
import { afterEach, describe, expect, it } from "vitest";
import { ResourcesService } from "../src/services/resources.js";

function service(): ResourcesService {
  const auth = new OAuth2Client({
    clientId: "client-id.apps.googleusercontent.com",
    clientSecret: "placeholder",
  });
  auth.setCredentials({ access_token: "test-token", expiry_date: Date.now() + 3_600_000 });
  return new ResourcesService(auth);
}

const root = "/admin/directory/v1/customer/my_customer/resources";

afterEach(() => {
  nock.cleanAll();
});

describe("buildings", () => {
  it("lists buildings", async () => {
    nock("https://admin.googleapis.com")
      .get(`${root}/buildings`)
      .query(true)
      .reply(200, {
        buildings: [
          {
            buildingId: "b1",
            buildingName: "HQ",
            floorNames: ["1", "2"],
            address: {
              addressLines: ["1 Main St"],
              locality: "Longmont",
              administrativeArea: "CO",
              postalCode: "80501",
              regionCode: "US",
            },
          },
        ],
        nextPageToken: "page-2",
      });

    const result = await service().listBuildings({});

    expect(result.items[0]).toEqual({
      buildingId: "b1",
      buildingName: "HQ",
      floorNames: ["1", "2"],
      address: {
        addressLines: ["1 Main St"],
        locality: "Longmont",
        administrativeArea: "CO",
        postalCode: "80501",
        regionCode: "US",
      },
    });
    expect(result.nextPageToken).toBe("page-2");
  });

  it("creates a building", async () => {
    const scope = nock("https://admin.googleapis.com")
      .post(`${root}/buildings`, {
        buildingName: "Annex",
        floorNames: ["1"],
      })
      .query(true)
      .reply(200, { buildingId: "b2", buildingName: "Annex" });

    const building = await service().createBuilding({
      buildingName: "Annex",
      floorNames: ["1"],
    });

    expect(scope.isDone()).toBe(true);
    expect(building.buildingId).toBe("b2");
  });

  it("patches only the supplied fields", async () => {
    const scope = nock("https://admin.googleapis.com")
      .patch(`${root}/buildings/b1`, { description: "Main office" })
      .query(true)
      .reply(200, { buildingId: "b1", buildingName: "HQ", description: "Main office" });

    const building = await service().patchBuilding("b1", { description: "Main office" });

    expect(scope.isDone()).toBe(true);
    expect(building.description).toBe("Main office");
  });

  it("deletes a building", async () => {
    const scope = nock("https://admin.googleapis.com")
      .delete(`${root}/buildings/b1`)
      .query(true)
      .reply(200, {});

    await service().deleteBuilding("b1");

    expect(scope.isDone()).toBe(true);
  });
});

describe("rooms", () => {
  it("lists rooms for a building with their features", async () => {
    const scope = nock("https://admin.googleapis.com")
      .get(`${root}/calendars`)
      .query((query) => {
        expect(query.query).toBe("buildingId=b1");
        return true;
      })
      .reply(200, {
        items: [
          {
            resourceId: "r1",
            resourceName: "Aurora",
            capacity: 8,
            floorName: "2",
            buildingId: "b1",
            featureInstances: [{ feature: { name: "Projector" } }, { name: "Whiteboard" }],
          },
        ],
      });

    const result = await service().listRooms({ buildingId: "b1" });

    expect(scope.isDone()).toBe(true);
    expect(result.items[0]).toEqual({
      resourceId: "r1",
      resourceName: "Aurora",
      capacity: 8,
      floorName: "2",
      buildingId: "b1",
      features: ["Projector", "Whiteboard"],
    });
  });

  it("creates a room with its capacity", async () => {
    const scope = nock("https://admin.googleapis.com")
      .post(`${root}/calendars`, {
        resourceId: "r1",
        resourceName: "Aurora",
        buildingId: "b1",
        capacity: 8,
      })
      .query(true)
      .reply(200, { resourceId: "r1", resourceName: "Aurora", capacity: 8 });

    const room = await service().createRoom({
      resourceId: "r1",
      resourceName: "Aurora",
      buildingId: "b1",
      capacity: 8,
    });

    expect(scope.isDone()).toBe(true);
    expect(room.capacity).toBe(8);
  });

  it("deletes a room and reports the features that went with it", async () => {
    nock("https://admin.googleapis.com")
      .get(`${root}/calendars/r1`)
      .query(true)
      .reply(200, {
        resourceId: "r1",
        resourceName: "Aurora",
        featureInstances: [{ feature: { name: "Projector" } }],
      });
    const deletion = nock("https://admin.googleapis.com")
      .delete(`${root}/calendars/r1`)
      .query(true)
      .reply(200, {});

    const result = await service().deleteRoom("r1");

    expect(deletion.isDone()).toBe(true);
    expect(result).toEqual({ resourceId: "r1", removedFeatures: ["Projector"] });
  });

  it("maps a 404 to not_found", async () => {
    nock("https://admin.googleapis.com")
      .get(`${root}/calendars/missing`)
      .query(true)
      .reply(404, { error: { code: 404, message: "Resource Not Found" } });

    await expect(service().getRoom("missing")).rejects.toMatchObject({ category: "not_found" });
  });
});

describe("features", () => {
  it("lists features", async () => {
    nock("https://admin.googleapis.com")
      .get(`${root}/features`)
      .query(true)
      .reply(200, { features: [{ name: "Projector" }, { name: "Video conferencing" }] });

    const result = await service().listFeatures({});

    expect(result.items).toEqual([{ name: "Projector" }, { name: "Video conferencing" }]);
  });

  it("creates a feature", async () => {
    const scope = nock("https://admin.googleapis.com")
      .post(`${root}/features`, { name: "Whiteboard" })
      .query(true)
      .reply(200, { name: "Whiteboard" });

    const feature = await service().createFeature("Whiteboard");

    expect(scope.isDone()).toBe(true);
    expect(feature.name).toBe("Whiteboard");
  });

  it("renames a feature", async () => {
    const scope = nock("https://admin.googleapis.com")
      .patch(`${root}/features/Whiteboard`, { name: "Marker board" })
      .query(true)
      .reply(200, { name: "Marker board" });

    const feature = await service().patchFeature("Whiteboard", "Marker board");

    expect(scope.isDone()).toBe(true);
    expect(feature.name).toBe("Marker board");
  });

  it("deletes a feature", async () => {
    const scope = nock("https://admin.googleapis.com")
      .delete(`${root}/features/Whiteboard`)
      .query(true)
      .reply(200, {});

    await service().deleteFeature("Whiteboard");

    expect(scope.isDone()).toBe(true);
  });
});
