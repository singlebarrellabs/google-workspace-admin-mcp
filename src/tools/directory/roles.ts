import { z } from "zod";
import type { ConfirmedToolSpec, ToolSpec } from "../../catalog.js";
import type { RolesService } from "../../services/roles.js";

const roleIdShape = {
  roleId: z.string().min(1).describe("Role id from a list call"),
};

const insertShape = {
  roleName: z.string().min(1).describe("Name for the custom role"),
  roleDescription: z.string().optional().describe("What the role is for"),
  privileges: z
    .array(
      z.object({
        serviceId: z.string().min(1).describe("Service id, for example 06"),
        privilegeName: z.string().min(1).describe("Privilege name from the privileges list"),
      }),
    )
    .min(1)
    .describe("Privileges the role grants; list them first"),
};

const deleteShape = {
  ...roleIdShape,
  confirm: z
    .boolean()
    .optional()
    .describe("Must be true. Assignments must be removed first, and the role is gone"),
};

const assignmentListShape = {
  userKey: z.string().optional().describe("Only assignments for this user"),
  roleId: z.string().optional().describe("Only assignments of this role"),
  maxResults: z.number().int().min(1).max(200).optional().describe("Page size, default 100"),
  pageToken: z.string().optional().describe("Token from a previous call"),
};

const assignmentInsertShape = {
  roleId: z.string().min(1).describe("Role to grant"),
  assignedTo: z.string().min(1).describe("User who receives the role"),
  scopeType: z.enum(["CUSTOMER", "ORG_UNIT"]).describe("Whole tenant or one org unit"),
  orgUnitId: z.string().optional().describe("Required when scopeType is ORG_UNIT"),
};

const assignmentDeleteShape = {
  roleAssignmentId: z.string().min(1).describe("Assignment id from a list call"),
  confirm: z
    .boolean()
    .optional()
    .describe("Must be true. The user loses the role's privileges immediately"),
};

export function roleTools(service: RolesService): Array<ToolSpec | ConfirmedToolSpec> {
  return [
    {
      name: "gws_roles_list",
      surface: "directory",
      access: "read",
      edition: "all",
      description:
        "List roles, custom and system. System roles can be assigned but not deleted; custom roles are the ones this server can create.",
      inputShape: {},
      run: async () => {
        const result = await service.listRoles();
        const custom = result.items.filter((role) => role.isSystemRole === false).length;
        return {
          summary: `${result.items.length} role${result.items.length === 1 ? "" : "s"}, ${custom} custom`,
          data: result,
        };
      },
    },
    {
      name: "gws_privileges_list",
      surface: "directory",
      access: "read",
      edition: "all",
      description:
        "List the privileges a custom role can hold, with their service ids. Needed before creating a role, since the API rejects invented names.",
      inputShape: {},
      run: async () => {
        const items = await service.listPrivileges();
        return { summary: `${items.length} privileges available`, data: { items } };
      },
    },
    {
      name: "gws_roles_create",
      surface: "directory",
      access: "write",
      edition: "all",
      description:
        "Create a custom role from an explicit privilege list. Creating the role grants nothing; the assignment tools do.",
      inputShape: insertShape,
      run: async (input) => {
        const args = z.object(insertShape).parse(input);
        const role = await service.insertRole(args);
        return { summary: `Created role ${role.roleName ?? args.roleName}`, data: role };
      },
    },
    {
      name: "gws_roles_delete",
      surface: "directory",
      access: "destructive",
      edition: "all",
      description:
        "Delete a custom role. Every assignment of it must be removed first, and the role cannot be restored.",
      confirmNote: "the custom role is deleted for good and cannot be recreated with the same id",
      inputShape: deleteShape,
      run: async (input) => {
        const args = z.object(deleteShape).parse(input);
        await service.deleteRole(args.roleId);
        return { summary: `Deleted role ${args.roleId}`, data: { roleId: args.roleId } };
      },
    },
    {
      name: "gws_role_assignments_list",
      surface: "directory",
      access: "read",
      edition: "all",
      description: "List role assignments, optionally for one user or one role.",
      inputShape: assignmentListShape,
      run: async (input) => {
        const args = z.object(assignmentListShape).parse(input);
        const result = await service.listAssignments(args);
        return {
          summary: `${result.items.length} assignment${result.items.length === 1 ? "" : "s"}${
            result.nextPageToken ? ", more available" : ""
          }`,
          data: result,
        };
      },
    },
    {
      name: "gws_role_assignments_create",
      surface: "directory",
      access: "write",
      edition: "all",
      description:
        "Grant a role to a user, either tenant-wide or over one org unit. This grants real admin capability immediately.",
      inputShape: assignmentInsertShape,
      run: async (input) => {
        const args = z.object(assignmentInsertShape).parse(input);
        const assignment = await service.insertAssignment({
          roleId: args.roleId,
          assignedTo: args.assignedTo,
          scopeType: args.scopeType,
          ...(args.orgUnitId ? { orgUnitId: args.orgUnitId } : {}),
        });
        return {
          summary: `Granted role ${args.roleId} to ${args.assignedTo}`,
          data: assignment,
        };
      },
    },
    {
      name: "gws_role_assignments_delete",
      surface: "directory",
      access: "destructive",
      edition: "all",
      description:
        "Revoke a role assignment. The user loses those privileges immediately; granting it again is a separate call.",
      confirmNote: "the user loses the role's privileges immediately",
      inputShape: assignmentDeleteShape,
      run: async (input) => {
        const args = z.object(assignmentDeleteShape).parse(input);
        await service.deleteAssignment(args.roleAssignmentId);
        return {
          summary: `Revoked assignment ${args.roleAssignmentId}`,
          data: { roleAssignmentId: args.roleAssignmentId, revoked: true },
        };
      },
    },
  ];
}
