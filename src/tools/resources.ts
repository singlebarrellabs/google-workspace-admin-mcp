import { z } from "zod";
import type { ConfirmedToolSpec, ToolSpec } from "../catalog.js";
import type { ResourcesService } from "../services/resources.js";

const pageShape = {
  maxResults: z.number().int().min(1).max(500).optional().describe("Page size, default 100"),
  pageToken: z.string().optional().describe("Token from a previous call"),
};

const buildingShape = {
  buildingId: z.string().min(1).describe("Building id from a list call"),
};

const addressShape = z.object({
  streetAddress: z.string().optional(),
  locality: z.string().optional(),
  region: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
});

const createBuildingShape = {
  buildingName: z.string().min(1).describe("Display name"),
  description: z.string().optional().describe("What the building is"),
  floorNames: z.array(z.string()).optional().describe('Floors, for example ["1", "2"]'),
  address: addressShape.optional().describe("Postal address"),
};

const patchBuildingShape = {
  ...buildingShape,
  buildingName: z.string().min(1).optional(),
  description: z.string().optional(),
  floorNames: z.array(z.string()).optional(),
  address: addressShape.optional(),
  confirm: z.boolean().optional().describe("Not needed: a PATCH does not blank other fields"),
};

const deleteBuildingShape = {
  ...buildingShape,
  confirm: z
    .boolean()
    .optional()
    .describe("Must be true. Rooms in the building lose their building reference"),
};

const roomShape = {
  resourceId: z.string().min(1).describe("Resource id from a list call"),
};

const createRoomShape = {
  resourceName: z.string().min(1).describe('Room name, for example "Aurora"'),
  buildingId: z.string().min(1).describe("Building the room sits in"),
  capacity: z.number().int().min(0).optional().describe("Seats"),
  floorName: z.string().optional(),
  floorSection: z.string().optional(),
  resourceCategory: z.string().optional().describe('For example "CONFERENCE_ROOM"'),
  resourceDescription: z.string().optional(),
};

const patchRoomShape = {
  ...roomShape,
  resourceName: z.string().min(1).optional(),
  capacity: z.number().int().min(0).optional(),
  floorName: z.string().optional(),
  floorSection: z.string().optional(),
  resourceCategory: z.string().optional(),
  resourceDescription: z.string().optional(),
};

const deleteRoomShape = {
  ...roomShape,
  confirm: z
    .boolean()
    .optional()
    .describe("Must be true. Its calendar disappears and feature assignments are lost"),
};

const featureShape = {
  featureKey: z.string().min(1).describe("Feature id or name"),
};

const createFeatureShape = {
  name: z.string().min(1).describe('Feature name, for example "Projector"'),
};

const patchFeatureShape = {
  ...featureShape,
  name: z.string().min(1).describe("New feature name"),
};

const deleteFeatureShape = {
  ...featureShape,
  confirm: z.boolean().optional().describe("Must be true. Rooms that carry the feature lose it"),
};

export function resourceTools(service: ResourcesService): Array<ToolSpec | ConfirmedToolSpec> {
  return [
    {
      name: "gws_buildings_list",
      surface: "resources",
      access: "read",
      edition: "all",
      description: "List buildings with their address and floors.",
      inputShape: pageShape,
      run: async (input) => {
        const args = z.object(pageShape).parse(input);
        const result = await service.listBuildings(args);
        return {
          summary: `${result.items.length} building${result.items.length === 1 ? "" : "s"}${
            result.nextPageToken ? ", more available" : ""
          }`,
          data: result,
        };
      },
    },
    {
      name: "gws_buildings_get",
      surface: "resources",
      access: "read",
      edition: "all",
      description: "Get one building.",
      inputShape: buildingShape,
      run: async (input) => {
        const args = z.object(buildingShape).parse(input);
        const building = await service.getBuilding(args.buildingId);
        return { summary: building.buildingName ?? args.buildingId, data: building };
      },
    },
    {
      name: "gws_buildings_create",
      surface: "resources",
      access: "write",
      edition: "all",
      description: "Create a building. Rooms can only be attached to an existing building.",
      inputShape: createBuildingShape,
      run: async (input) => {
        const args = z.object(createBuildingShape).parse(input);
        const building = await service.createBuilding(args);
        return { summary: `Created ${building.buildingName ?? args.buildingName}`, data: building };
      },
    },
    {
      name: "gws_buildings_update",
      surface: "resources",
      access: "write",
      edition: "all",
      description: "Change named building fields with a PATCH; everything else keeps its value.",
      inputShape: patchBuildingShape,
      run: async (input) => {
        const args = z.object(patchBuildingShape).parse(input);
        const { buildingId, confirm: _confirm, ...patch } = args;
        const building = await service.patchBuilding(buildingId, patch);
        return { summary: `Updated ${building.buildingName ?? buildingId}`, data: building };
      },
    },
    {
      name: "gws_buildings_delete",
      surface: "resources",
      access: "destructive",
      edition: "all",
      description:
        "Delete a building. Rooms inside it lose their building reference and must be reassigned.",
      confirmNote: "the building is removed and its rooms lose their building reference",
      inputShape: deleteBuildingShape,
      run: async (input) => {
        const args = z.object(deleteBuildingShape).parse(input);
        await service.deleteBuilding(args.buildingId);
        return { summary: `Deleted ${args.buildingId}`, data: { buildingId: args.buildingId } };
      },
    },
    {
      name: "gws_rooms_list",
      surface: "resources",
      access: "read",
      edition: "all",
      description:
        "List calendar resources (rooms) with capacity, floor and feature assignments, optionally for one building.",
      inputShape: { ...pageShape, buildingId: z.string().optional().describe("Only rooms here") },
      run: async (input) => {
        const args = z.object({ ...pageShape, buildingId: z.string().optional() }).parse(input);
        const result = await service.listRooms(args);
        return {
          summary: `${result.items.length} room${result.items.length === 1 ? "" : "s"}${
            result.nextPageToken ? ", more available" : ""
          }`,
          data: result,
        };
      },
    },
    {
      name: "gws_rooms_get",
      surface: "resources",
      access: "read",
      edition: "all",
      description: "Get one room: calendar address, capacity, floor and features.",
      inputShape: roomShape,
      run: async (input) => {
        const args = z.object(roomShape).parse(input);
        const room = await service.getRoom(args.resourceId);
        return { summary: room.resourceName ?? args.resourceId, data: room };
      },
    },
    {
      name: "gws_rooms_create",
      surface: "resources",
      access: "write",
      edition: "all",
      description:
        "Create a room in an existing building. Google issues its calendar address; nobody can book it until it is created here.",
      inputShape: createRoomShape,
      run: async (input) => {
        const args = z.object(createRoomShape).parse(input);
        const room = await service.createRoom(args);
        return { summary: `Created ${room.resourceName ?? args.resourceName}`, data: room };
      },
    },
    {
      name: "gws_rooms_update",
      surface: "resources",
      access: "write",
      edition: "all",
      description: "Change named room fields with a PATCH; other fields keep their values.",
      inputShape: patchRoomShape,
      run: async (input) => {
        const args = z.object(patchRoomShape).parse(input);
        const { resourceId, ...patch } = args;
        const room = await service.patchRoom(resourceId, patch);
        return { summary: `Updated ${room.resourceName ?? resourceId}`, data: room };
      },
    },
    {
      name: "gws_rooms_delete",
      surface: "resources",
      access: "destructive",
      edition: "all",
      description:
        "Delete a room. The result lists the feature assignments that went with it, so nothing disappears unmentioned.",
      confirmNote: "the room's calendar is removed and its feature assignments are lost",
      inputShape: deleteRoomShape,
      run: async (input) => {
        const args = z.object(deleteRoomShape).parse(input);
        const result = await service.deleteRoom(args.resourceId);
        return {
          summary: `Deleted room ${result.resourceId}${
            result.removedFeatures.length > 0
              ? `; removed features: ${result.removedFeatures.join(", ")}`
              : "; it had no features"
          }`,
          data: result,
        };
      },
    },
    {
      name: "gws_features_list",
      surface: "resources",
      access: "read",
      edition: "all",
      description: "List room features, for example projectors or video conferencing.",
      inputShape: pageShape,
      run: async (input) => {
        const args = z.object(pageShape).parse(input);
        const result = await service.listFeatures(args);
        return {
          summary: `${result.items.length} feature${result.items.length === 1 ? "" : "s"}${
            result.nextPageToken ? ", more available" : ""
          }`,
          data: result,
        };
      },
    },
    {
      name: "gws_features_get",
      surface: "resources",
      access: "read",
      edition: "all",
      description: "Get one feature.",
      inputShape: featureShape,
      run: async (input) => {
        const args = z.object(featureShape).parse(input);
        const feature = await service.getFeature(args.featureKey);
        return { summary: feature.name ?? args.featureKey, data: feature };
      },
    },
    {
      name: "gws_features_create",
      surface: "resources",
      access: "write",
      edition: "all",
      description: "Create a feature that rooms can then be tagged with.",
      inputShape: createFeatureShape,
      run: async (input) => {
        const args = z.object(createFeatureShape).parse(input);
        const feature = await service.createFeature(args.name);
        return { summary: `Created ${feature.name ?? args.name}`, data: feature };
      },
    },
    {
      name: "gws_features_update",
      surface: "resources",
      access: "write",
      edition: "all",
      description: "Rename a feature. Rooms keep the feature, with the new name.",
      inputShape: patchFeatureShape,
      run: async (input) => {
        const args = z.object(patchFeatureShape).parse(input);
        const feature = await service.patchFeature(args.featureKey, args.name);
        return { summary: `Renamed to ${feature.name ?? args.name}`, data: feature };
      },
    },
    {
      name: "gws_features_delete",
      surface: "resources",
      access: "destructive",
      edition: "all",
      description: "Delete a feature. Every room tagged with it loses the tag.",
      confirmNote: "the feature is removed from every room that carries it",
      inputShape: deleteFeatureShape,
      run: async (input) => {
        const args = z.object(deleteFeatureShape).parse(input);
        await service.deleteFeature(args.featureKey);
        return {
          summary: `Deleted feature ${args.featureKey}`,
          data: { featureKey: args.featureKey },
        };
      },
    },
  ];
}
