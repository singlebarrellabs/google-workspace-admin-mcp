import { z } from "zod";
import type { ConfirmedToolSpec, ToolSpec } from "../../catalog.js";
import type { GroupsService } from "../../services/directory-groups.js";

const listShape = {
  query: z.string().optional().describe('Group search, for example "name:Engineering"'),
  maxResults: z.number().int().min(1).max(200).optional().describe("Page size, default 100"),
  pageToken: z.string().optional().describe("Token from a previous call"),
};

const groupKeyShape = {
  groupKey: z.string().min(1).describe("Group email address or id"),
};

const createShape = {
  email: z.string().min(1).describe("Group address, for example team@example.com"),
  name: z.string().min(1).describe("Display name"),
  description: z.string().optional().describe("Purpose of the group"),
};

const patchShape = {
  ...groupKeyShape,
  name: z.string().min(1).optional().describe("New display name"),
  description: z.string().optional().describe("New description; an empty string clears it"),
};

const deleteShape = {
  ...groupKeyShape,
  confirm: z
    .boolean()
    .optional()
    .describe("Must be true. The address stops accepting mail and the memberships are gone"),
};

const memberListShape = {
  ...groupKeyShape,
  roles: z.string().optional().describe('Only these roles, for example "OWNER,MANAGER"'),
  maxResults: z.number().int().min(1).max(200).optional().describe("Page size, default 100"),
  pageToken: z.string().optional().describe("Token from a previous call"),
};

const memberKeyShape = {
  ...groupKeyShape,
  memberKey: z.string().min(1).describe("Member email address or id"),
};

const addMemberShape = {
  ...groupKeyShape,
  email: z.string().min(1).describe("Address to add"),
  role: z
    .enum(["MEMBER", "MANAGER", "OWNER"])
    .optional()
    .describe("Group role, default MEMBER. OWNER can manage the group"),
  type: z.enum(["USER", "GROUP"]).optional().describe("Entry type, default USER"),
};

const removeMemberShape = {
  ...memberKeyShape,
};

export function groupTools(service: GroupsService): Array<ToolSpec | ConfirmedToolSpec> {
  return [
    {
      name: "gws_groups_list",
      surface: "directory",
      access: "read",
      edition: "all",
      description: "List groups, optionally filtered by a search query. Pages with nextPageToken.",
      inputShape: listShape,
      run: async (input) => {
        const args = z.object(listShape).parse(input);
        const result = await service.listGroups(args);
        return {
          summary: `${result.items.length} group${result.items.length === 1 ? "" : "s"}${
            result.nextPageToken ? ", more available" : ""
          }`,
          data: result,
        };
      },
    },
    {
      name: "gws_groups_get",
      surface: "directory",
      access: "read",
      edition: "all",
      description: "Get one group: name, description, member count and aliases.",
      inputShape: groupKeyShape,
      run: async (input) => {
        const args = z.object(groupKeyShape).parse(input);
        const group = await service.getGroup(args.groupKey);
        return {
          summary: `${group.email}${group.directMembersCount ? `, ${group.directMembersCount} members` : ""}`,
          data: group,
        };
      },
    },
    {
      name: "gws_groups_create",
      surface: "directory",
      access: "write",
      edition: "all",
      description:
        "Create a group. The address must be in a domain this tenant owns; mail to it reaches every member.",
      inputShape: createShape,
      run: async (input) => {
        const args = z.object(createShape).parse(input);
        const group = await service.createGroup(args);
        return { summary: `Created ${group.email}`, data: group };
      },
    },
    {
      name: "gws_groups_update",
      surface: "directory",
      access: "write",
      edition: "all",
      description:
        "Change a group's name or description with a PATCH, so the other field keeps its value.",
      inputShape: patchShape,
      run: async (input) => {
        const args = z.object(patchShape).parse(input);
        const group = await service.patchGroup(args.groupKey, {
          ...(args.name === undefined ? {} : { name: args.name }),
          ...(args.description === undefined ? {} : { description: args.description }),
        });
        return { summary: `Updated ${group.email}`, data: group };
      },
    },
    {
      name: "gws_groups_delete",
      surface: "directory",
      access: "destructive",
      edition: "all",
      description:
        "Delete a group. The address stops accepting mail and the membership list is gone; members' own accounts are untouched.",
      confirmNote: "the group address stops accepting mail and every membership is lost",
      inputShape: deleteShape,
      run: async (input) => {
        const args = z.object(deleteShape).parse(input);
        await service.deleteGroup(args.groupKey);
        return { summary: `Deleted ${args.groupKey}`, data: { groupKey: args.groupKey } };
      },
    },
    {
      name: "gws_members_list",
      surface: "directory",
      access: "read",
      edition: "all",
      description: "List a group's members, optionally limited to roles such as OWNER or MANAGER.",
      inputShape: memberListShape,
      run: async (input) => {
        const args = z.object(memberListShape).parse(input);
        const result = await service.listMembers(args);
        return {
          summary: `${result.items.length} member${result.items.length === 1 ? "" : "s"}${
            result.nextPageToken ? ", more available" : ""
          }`,
          data: result,
        };
      },
    },
    {
      name: "gws_members_get",
      surface: "directory",
      access: "read",
      edition: "all",
      description: "Get one group membership: role, entry type and delivery status.",
      inputShape: memberKeyShape,
      run: async (input) => {
        const args = z.object(memberKeyShape).parse(input);
        const member = await service.getMember(args.groupKey, args.memberKey);
        return {
          summary: `${member.email}${member.role ? ` (${member.role})` : ""}`,
          data: member,
        };
      },
    },
    {
      name: "gws_members_add",
      surface: "directory",
      access: "write",
      edition: "all",
      description:
        "Add a user or group to a group. OWNER and MANAGER grant the ability to manage the group, so the role is explicit rather than defaulted silently.",
      inputShape: addMemberShape,
      run: async (input) => {
        const args = z.object(addMemberShape).parse(input);
        const member = await service.addMember(args);
        return {
          summary: `Added ${member.email} as ${member.role ?? "MEMBER"}`,
          data: member,
        };
      },
    },
    {
      name: "gws_members_remove",
      surface: "directory",
      access: "write",
      edition: "all",
      description: "Remove a member from a group. The member's own account is untouched.",
      inputShape: removeMemberShape,
      run: async (input) => {
        const args = z.object(removeMemberShape).parse(input);
        await service.removeMember(args.groupKey, args.memberKey);
        return {
          summary: `Removed ${args.memberKey} from ${args.groupKey}`,
          data: { removed: true },
        };
      },
    },
  ];
}
