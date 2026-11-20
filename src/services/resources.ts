import type { OAuth2Client } from "google-auth-library";
import { type admin_directory_v1, google } from "googleapis";
import { mapGoogleError } from "../util/errors.js";

export interface BuildingRow {
  buildingId?: string;
  buildingName?: string;
  description?: string;
  floorNames?: string[];
  address?: Record<string, string>;
  coordinates?: { latitude?: number; longitude?: number };
}

export interface RoomRow {
  resourceId?: string;
  resourceName?: string;
  resourceEmail?: string;
  buildingId?: string;
  floorName?: string;
  floorSection?: string;
  capacity?: number;
  resourceCategory?: string;
  resourceDescription?: string;
  /** Feature names attached to the room; the API returns them as loose objects. */
  features?: string[];
}

export interface FeatureRow {
  name?: string;
}

export interface PageArgs {
  maxResults?: number;
  pageToken?: string;
}

export interface RoomArgs extends PageArgs {
  buildingId?: string;
}

/**
 * Calendar resources: buildings, rooms and the features a room can carry.
 * Updates use PATCH, so a caller changing capacity cannot blank the floor.
 */
export class ResourcesService {
  private readonly client: admin_directory_v1.Admin;

  constructor(auth: OAuth2Client) {
    this.client = google.admin({ version: "directory_v1", auth });
  }

  async listBuildings(args: PageArgs): Promise<{ items: BuildingRow[]; nextPageToken?: string }> {
    try {
      const response = await this.client.resources.buildings.list({
        customer: "my_customer",
        maxResults: args.maxResults ?? 100,
        ...(args.pageToken ? { pageToken: args.pageToken } : {}),
      });
      return {
        items: (response.data.buildings ?? []).map(toBuildingRow),
        ...(response.data.nextPageToken ? { nextPageToken: response.data.nextPageToken } : {}),
      };
    } catch (error) {
      throw mapGoogleError(error, "resources");
    }
  }

  async getBuilding(buildingId: string): Promise<BuildingRow> {
    try {
      const response = await this.client.resources.buildings.get({
        customer: "my_customer",
        buildingId,
      });
      return toBuildingRow(response.data);
    } catch (error) {
      throw mapGoogleError(error, "resources");
    }
  }

  async createBuilding(args: {
    buildingName: string;
    description?: string;
    floorNames?: string[];
    address?: BuildingRow["address"];
  }): Promise<BuildingRow> {
    try {
      const response = await this.client.resources.buildings.insert({
        customer: "my_customer",
        requestBody: {
          buildingName: args.buildingName,
          ...(args.description ? { description: args.description } : {}),
          ...(args.floorNames?.length ? { floorNames: args.floorNames } : {}),
          ...(args.address ? { address: args.address } : {}),
        },
      });
      return toBuildingRow(response.data);
    } catch (error) {
      throw mapGoogleError(error, "resources");
    }
  }

  async patchBuilding(buildingId: string, patch: Partial<BuildingRow>): Promise<BuildingRow> {
    try {
      const response = await this.client.resources.buildings.patch({
        customer: "my_customer",
        buildingId,
        requestBody: patch as admin_directory_v1.Schema$Building,
      });
      return toBuildingRow(response.data);
    } catch (error) {
      throw mapGoogleError(error, "resources");
    }
  }

  async deleteBuilding(buildingId: string): Promise<void> {
    try {
      await this.client.resources.buildings.delete({ customer: "my_customer", buildingId });
    } catch (error) {
      throw mapGoogleError(error, "resources");
    }
  }

  async listRooms(args: RoomArgs): Promise<{ items: RoomRow[]; nextPageToken?: string }> {
    try {
      const response = await this.client.resources.calendars.list({
        customer: "my_customer",
        maxResults: args.maxResults ?? 100,
        ...(args.buildingId ? { buildingId: args.buildingId } : {}),
        ...(args.pageToken ? { pageToken: args.pageToken } : {}),
      });
      return {
        items: (response.data.items ?? []).map(toRoomRow),
        ...(response.data.nextPageToken ? { nextPageToken: response.data.nextPageToken } : {}),
      };
    } catch (error) {
      throw mapGoogleError(error, "resources");
    }
  }

  async getRoom(resourceId: string): Promise<RoomRow> {
    try {
      const response = await this.client.resources.calendars.get({
        customer: "my_customer",
        calendarResourceId: resourceId,
      });
      return toRoomRow(response.data);
    } catch (error) {
      throw mapGoogleError(error, "resources");
    }
  }

  async createRoom(args: {
    resourceName: string;
    buildingId: string;
    capacity?: number;
    floorName?: string;
    floorSection?: string;
    resourceCategory?: string;
    resourceDescription?: string;
  }): Promise<RoomRow> {
    try {
      const response = await this.client.resources.calendars.insert({
        customer: "my_customer",
        requestBody: {
          resourceName: args.resourceName,
          buildingId: args.buildingId,
          ...(args.capacity === undefined ? {} : { capacity: args.capacity }),
          ...(args.floorName ? { floorName: args.floorName } : {}),
          ...(args.floorSection ? { floorSection: args.floorSection } : {}),
          ...(args.resourceCategory ? { resourceCategory: args.resourceCategory } : {}),
          ...(args.resourceDescription ? { resourceDescription: args.resourceDescription } : {}),
        },
      });
      return toRoomRow(response.data);
    } catch (error) {
      throw mapGoogleError(error, "resources");
    }
  }

  async patchRoom(resourceId: string, patch: Partial<RoomRow>): Promise<RoomRow> {
    try {
      const response = await this.client.resources.calendars.patch({
        customer: "my_customer",
        calendarResourceId: resourceId,
        requestBody: patch as admin_directory_v1.Schema$CalendarResource,
      });
      return toRoomRow(response.data);
    } catch (error) {
      throw mapGoogleError(error, "resources");
    }
  }

  /** Returns the feature assignments the room held, so the caller sees what went. */
  async deleteRoom(resourceId: string): Promise<{ resourceId: string; removedFeatures: string[] }> {
    const room = await this.getRoom(resourceId);
    try {
      await this.client.resources.calendars.delete({
        customer: "my_customer",
        calendarResourceId: resourceId,
      });
      return {
        resourceId,
        removedFeatures: room.features ?? [],
      };
    } catch (error) {
      throw mapGoogleError(error, "resources");
    }
  }

  async listFeatures(args: PageArgs): Promise<{ items: FeatureRow[]; nextPageToken?: string }> {
    try {
      const response = await this.client.resources.features.list({
        customer: "my_customer",
        maxResults: args.maxResults ?? 100,
        ...(args.pageToken ? { pageToken: args.pageToken } : {}),
      });
      return {
        items: (response.data.features ?? []).map(toFeatureRow),
        ...(response.data.nextPageToken ? { nextPageToken: response.data.nextPageToken } : {}),
      };
    } catch (error) {
      throw mapGoogleError(error, "resources");
    }
  }

  async getFeature(featureKey: string): Promise<FeatureRow> {
    try {
      const response = await this.client.resources.features.get({
        customer: "my_customer",
        featureKey,
      });
      return toFeatureRow(response.data);
    } catch (error) {
      throw mapGoogleError(error, "resources");
    }
  }

  async createFeature(name: string): Promise<FeatureRow> {
    try {
      const response = await this.client.resources.features.insert({
        customer: "my_customer",
        requestBody: { name },
      });
      return toFeatureRow(response.data);
    } catch (error) {
      throw mapGoogleError(error, "resources");
    }
  }

  async patchFeature(featureKey: string, name: string): Promise<FeatureRow> {
    try {
      const response = await this.client.resources.features.patch({
        customer: "my_customer",
        featureKey,
        requestBody: { name },
      });
      return toFeatureRow(response.data);
    } catch (error) {
      throw mapGoogleError(error, "resources");
    }
  }

  async deleteFeature(featureKey: string): Promise<void> {
    try {
      await this.client.resources.features.delete({ customer: "my_customer", featureKey });
    } catch (error) {
      throw mapGoogleError(error, "resources");
    }
  }
}

function toBuildingRow(building: admin_directory_v1.Schema$Building): BuildingRow {
  return {
    ...(building.buildingId ? { buildingId: building.buildingId } : {}),
    ...(building.buildingName ? { buildingName: building.buildingName } : {}),
    ...(building.description ? { description: building.description } : {}),
    ...(building.floorNames?.length ? { floorNames: building.floorNames } : {}),
    ...(building.address
      ? { address: stripNulls(building.address) as Record<string, string> }
      : {}),
    ...(building.coordinates
      ? {
          coordinates: stripNulls(building.coordinates) as {
            latitude?: number;
            longitude?: number;
          },
        }
      : {}),
  };
}

function toRoomRow(room: admin_directory_v1.Schema$CalendarResource): RoomRow {
  return {
    ...(room.resourceId ? { resourceId: room.resourceId } : {}),
    ...(room.resourceName ? { resourceName: room.resourceName } : {}),
    ...(room.resourceEmail ? { resourceEmail: room.resourceEmail } : {}),
    ...(room.buildingId ? { buildingId: room.buildingId } : {}),
    ...(room.floorName ? { floorName: room.floorName } : {}),
    ...(room.floorSection ? { floorSection: room.floorSection } : {}),
    ...(room.capacity === undefined || room.capacity === null ? {} : { capacity: room.capacity }),
    ...(room.resourceCategory ? { resourceCategory: room.resourceCategory } : {}),
    ...(room.resourceDescription ? { resourceDescription: room.resourceDescription } : {}),
    ...(featureNames(room.featureInstances).length > 0
      ? { features: featureNames(room.featureInstances) }
      : {}),
  };
}

function toFeatureRow(feature: admin_directory_v1.Schema$Feature): FeatureRow {
  return {
    ...(feature.name ? { name: feature.name } : {}),
  };
}

/**
 * `featureInstances` is typed `any` by googleapis, so it is read defensively:
 * a name in either the nested feature object or the flat object counts.
 */
function featureNames(instances: unknown): string[] {
  if (!Array.isArray(instances)) return [];
  return instances
    .map((instance: unknown) => {
      if (!instance || typeof instance !== "object") return "";
      const record = instance as { feature?: { name?: unknown }; name?: unknown };
      const name = record.feature?.name ?? record.name;
      return typeof name === "string" ? name : "";
    })
    .filter((name) => name.length > 0);
}

function stripNulls<T extends object>(value: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null),
  );
}
