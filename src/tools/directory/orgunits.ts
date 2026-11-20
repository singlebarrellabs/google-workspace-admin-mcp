import { z } from "zod";
import type { ConfirmedToolSpec, ToolSpec } from "../../catalog.js";
import type { OrgUnitsService } from "../../services/orgunits.js";

const listShape = {
  orgUnitPath: z.string().optional().describe("Start point, default the root"),
  type: z
    .enum(["all", "children", "self"])
    .optional()
    .describe("all includes descendants, children is one level, self is the unit itself"),
};

const pathShape = {
  orgUnitPath: z.string().min(1).describe('Org unit path, for example "/Engineering"'),
};

const createShape = {
  name: z.string().min(1).describe("Name of the new unit"),
  parentOrgUnitPath: z.string().min(1).describe('Parent path, for example "/"'),
  description: z.string().optional().describe("What the unit is for"),
  blockInheritance: z
    .boolean()
    .optional()
    .describe("Stop inheriting settings from the parent unit"),
};

const updateShape = {
  ...pathShape,
  name: z.string().min(1).optional().describe("New name"),
  parentOrgUnitPath: z.string().min(1).optional().describe("Move the unit under this parent"),
  description: z.string().optional().describe("New description"),
  blockInheritance: z.boolean().optional().describe("Stop or resume inheriting parent settings"),
};

const deleteShape = {
  ...pathShape,
  confirm: z
    .boolean()
    .optional()
    .describe("Must be true. The unit must be empty, and it disappears from every admin view"),
};

export function orgUnitTools(service: OrgUnitsService): Array<ToolSpec | ConfirmedToolSpec> {
  return [
    {
      name: "gws_orgunits_list",
      surface: "directory",
      access: "read",
      edition: "all",
      description:
        "List org units, whole tree or one level. Org units decide which settings and policies apply to their users.",
      inputShape: listShape,
      run: async (input) => {
        const args = z.object(listShape).parse(input);
        const units = await service.listOrgUnits(args);
        return {
          summary: `${units.length} org unit${units.length === 1 ? "" : "s"}`,
          data: { items: units },
        };
      },
    },
    {
      name: "gws_orgunits_get",
      surface: "directory",
      access: "read",
      edition: "all",
      description: "Get one org unit: path, parent, description and inheritance flag.",
      inputShape: pathShape,
      run: async (input) => {
        const args = z.object(pathShape).parse(input);
        const unit = await service.getOrgUnit(args.orgUnitPath);
        return { summary: unit.orgUnitPath ?? unit.name, data: unit };
      },
    },
    {
      name: "gws_orgunits_create",
      surface: "directory",
      access: "write",
      edition: "all",
      description:
        "Create an org unit under a parent. Settings place new units at Google's defaults until an admin changes them.",
      inputShape: createShape,
      run: async (input) => {
        const args = z.object(createShape).parse(input);
        const unit = await service.createOrgUnit(args);
        return { summary: `Created ${unit.orgUnitPath ?? unit.name}`, data: unit };
      },
    },
    {
      name: "gws_orgunits_update",
      surface: "directory",
      access: "write",
      edition: "all",
      description:
        "Change an org unit. The API has no partial update, so the current unit is read first and only the supplied fields change.",
      inputShape: updateShape,
      run: async (input) => {
        const args = z.object(updateShape).parse(input);
        const unit = await service.updateOrgUnit(args.orgUnitPath, {
          ...(args.name === undefined ? {} : { name: args.name }),
          ...(args.parentOrgUnitPath === undefined
            ? {}
            : { parentOrgUnitPath: args.parentOrgUnitPath }),
          ...(args.description === undefined ? {} : { description: args.description }),
          ...(args.blockInheritance === undefined
            ? {}
            : { blockInheritance: args.blockInheritance }),
        });
        return { summary: `Updated ${unit.orgUnitPath ?? args.orgUnitPath}`, data: unit };
      },
    },
    {
      name: "gws_orgunits_delete",
      surface: "directory",
      access: "destructive",
      edition: "all",
      description:
        "Delete an org unit. It must have no users and no child units; move them first. Settings defined on it are lost.",
      confirmNote: "the unit and the settings defined on it are gone, and it must already be empty",
      inputShape: deleteShape,
      run: async (input) => {
        const args = z.object(deleteShape).parse(input);
        await service.deleteOrgUnit(args.orgUnitPath);
        return { summary: `Deleted ${args.orgUnitPath}`, data: { orgUnitPath: args.orgUnitPath } };
      },
    },
  ];
}
