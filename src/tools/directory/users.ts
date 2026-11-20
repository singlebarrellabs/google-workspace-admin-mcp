import { z } from "zod";
import type { ConfirmedToolSpec, ToolSpec } from "../../catalog.js";
import type { DirectoryService } from "../../services/directory.js";

const listShape = {
  query: z.string().optional().describe('Directory query, for example "email:user@example.com"'),
  orgUnitPath: z.string().optional().describe("Org unit path, for example /Engineering"),
  maxResults: z.number().int().min(1).max(500).optional().describe("Page size, default 100"),
  pageToken: z.string().optional().describe("Token from a previous call"),
  showDeleted: z.boolean().optional().describe("Include deleted users, which users.undelete needs"),
};

const userKeyShape = {
  userKey: z.string().min(1).describe("Primary email or immutable user id"),
};

const suspendShape = {
  ...userKeyShape,
  confirm: z
    .boolean()
    .optional()
    .describe("Must be true. Suspension is reversible, but it ends the user's access now"),
};

const unsuspendShape = {
  ...userKeyShape,
};

const createShape = {
  primaryEmail: z.string().min(1).describe("The new account's primary address"),
  givenName: z.string().min(1).describe("First name"),
  familyName: z.string().min(1).describe("Last name"),
  password: z.string().min(1).optional().describe("Initial password; omit to set one later"),
  orgUnitPath: z.string().optional().describe("Org unit path, default /"),
  changePasswordAtNextLogin: z
    .boolean()
    .optional()
    .describe("Default true: the user must choose a new password at first sign-in"),
};

const patchShape = {
  ...userKeyShape,
  givenName: z.string().min(1).optional().describe("New first name"),
  familyName: z.string().min(1).optional().describe("New last name"),
  orgUnitPath: z.string().optional().describe("Move the user to this org unit"),
  changePasswordAtNextLogin: z
    .boolean()
    .optional()
    .describe("Force a password change at next login"),
  archived: z.boolean().optional().describe("Archive or unarchive the account"),
};

const moveShape = {
  ...userKeyShape,
  orgUnitPath: z.string().min(1).describe("Destination org unit path"),
  confirm: z
    .boolean()
    .optional()
    .describe("Must be true. The destination org unit's settings apply immediately"),
};

const deleteShape = {
  ...userKeyShape,
  confirm: z
    .boolean()
    .optional()
    .describe("Must be true. The account loses its data and can only be restored for 20 days"),
};

const undeleteShape = {
  ...userKeyShape,
  orgUnitPath: z.string().min(1).describe("Org unit to restore the account into"),
};

const aliasShape = {
  ...userKeyShape,
  alias: z.string().min(1).describe("Alias address, for example sales@example.com"),
};

const aliasUserShape = {
  ...userKeyShape,
};

export function userTools(service: DirectoryService): Array<ToolSpec | ConfirmedToolSpec> {
  return [
    {
      name: "gws_users_list",
      surface: "directory",
      access: "read",
      edition: "all",
      description:
        "List users in the directory, optionally filtered by query or org unit. Returns a page of users and a nextPageToken when more exist.",
      inputShape: listShape,
      run: async (input) => {
        const args = z.object(listShape).parse(input);
        const result = await service.listUsers(args);
        return {
          summary: `${result.items.length} user${result.items.length === 1 ? "" : "s"} returned${
            result.nextPageToken ? ", more available" : ""
          }`,
          data: result,
        };
      },
    },
    {
      name: "gws_users_get",
      surface: "directory",
      access: "read",
      edition: "all",
      description:
        "Get one user: name, org unit, suspension and admin state, last login and password-change flag.",
      inputShape: userKeyShape,
      run: async (input) => {
        const args = z.object(userKeyShape).parse(input);
        const user = await service.getUser(args.userKey);
        return {
          summary: `${user.primaryEmail}${user.suspended ? " (suspended)" : ""}`,
          data: user,
        };
      },
    },
    {
      name: "gws_users_create",
      surface: "directory",
      access: "write",
      edition: "all",
      description:
        "Create a user. The account cannot hold admin rights: this tool never sets isAdmin. A password change is required at first sign-in unless explicitly disabled.",
      inputShape: createShape,
      run: async (input) => {
        const args = z.object(createShape).parse(input);
        const user = await service.createUser(args);
        return { summary: `Created ${user.primaryEmail}`, data: user };
      },
    },
    {
      name: "gws_users_update",
      surface: "directory",
      access: "write",
      edition: "all",
      description:
        "Change selected user fields with a PATCH, so omitted fields keep their values. Moves to a new org unit with the move tool instead, which explains the effect.",
      inputShape: patchShape,
      run: async (input) => {
        const args = z.object(patchShape).parse(input);
        const patch = {
          ...(args.givenName && args.familyName
            ? { fullName: { givenName: args.givenName, familyName: args.familyName } }
            : {}),
          ...(args.orgUnitPath ? { orgUnitPath: args.orgUnitPath } : {}),
          ...(args.changePasswordAtNextLogin === undefined
            ? {}
            : { changePasswordAtNextLogin: args.changePasswordAtNextLogin }),
          ...(args.archived === undefined ? {} : { archived: args.archived }),
        };
        const user = await service.patchUser(args.userKey, patch);
        return { summary: `Updated ${user.primaryEmail}`, data: user };
      },
    },
    {
      name: "gws_users_suspend",
      surface: "directory",
      access: "destructive",
      edition: "all",
      description:
        "Suspend a user, which blocks sign-in and stops new sessions. Reversible with the unsuspend tool, but it ends access immediately.",
      confirmNote: "the user is signed out and cannot sign in until unsuspended",
      inputShape: suspendShape,
      run: async (input) => {
        const args = z.object(suspendShape).parse(input);
        const user = await service.suspendUser(args.userKey);
        return { summary: `${user.primaryEmail || args.userKey} is suspended`, data: user };
      },
    },
    {
      name: "gws_users_unsuspend",
      surface: "directory",
      access: "write",
      edition: "all",
      description: "Restore a suspended user's ability to sign in. Sessions do not resume.",
      inputShape: unsuspendShape,
      run: async (input) => {
        const args = z.object(unsuspendShape).parse(input);
        const user = await service.unsuspendUser(args.userKey);
        return { summary: `${user.primaryEmail || args.userKey} can sign in again`, data: user };
      },
    },
    {
      name: "gws_users_move",
      surface: "directory",
      access: "destructive",
      edition: "all",
      description:
        "Move a user to another org unit. Settings, policies and app defaults for the destination apply immediately, and the old unit's stop applying.",
      confirmNote: "the destination org unit's policies take effect immediately for this user",
      inputShape: moveShape,
      run: async (input) => {
        const args = z.object(moveShape).parse(input);
        const user = await service.patchUser(args.userKey, { orgUnitPath: args.orgUnitPath });
        return {
          summary: `${user.primaryEmail || args.userKey} moved to ${args.orgUnitPath}`,
          data: user,
        };
      },
    },
    {
      name: "gws_users_delete",
      surface: "directory",
      access: "destructive",
      edition: "all",
      description:
        "Delete a user. The account is recoverable with undelete for 20 days, after which its data is gone for good. Suspend first if the intent is only to block access.",
      confirmNote:
        "the account and its data are scheduled for permanent deletion, restorable for 20 days",
      inputShape: deleteShape,
      run: async (input) => {
        const args = z.object(deleteShape).parse(input);
        await service.deleteUser(args.userKey);
        return {
          summary: `${args.userKey} deleted; restorable for 20 days with undelete`,
          data: { userKey: args.userKey, deleted: true },
        };
      },
    },
    {
      name: "gws_users_undelete",
      surface: "directory",
      access: "write",
      edition: "all",
      description:
        "Restore a deleted user into an org unit. Only works within the 20-day recovery window.",
      inputShape: undeleteShape,
      run: async (input) => {
        const args = z.object(undeleteShape).parse(input);
        const user = await service.undeleteUser(args.userKey, args.orgUnitPath);
        return {
          summary: `Restored ${user.primaryEmail || args.userKey} to ${args.orgUnitPath}`,
          data: user,
        };
      },
    },
    {
      name: "gws_aliases_list",
      surface: "directory",
      access: "read",
      edition: "all",
      description: "List a user's email aliases.",
      inputShape: aliasUserShape,
      run: async (input) => {
        const args = z.object(aliasUserShape).parse(input);
        const aliases = await service.listAliases(args.userKey);
        return {
          summary: `${aliases.length} alias${aliases.length === 1 ? "" : "es"}`,
          data: { items: aliases },
        };
      },
    },
    {
      name: "gws_aliases_insert",
      surface: "directory",
      access: "write",
      edition: "all",
      description:
        "Add an alias to a user. Mail to the alias lands in the user's mailbox; the alias must be in a domain this tenant owns.",
      inputShape: aliasShape,
      run: async (input) => {
        const args = z.object(aliasShape).parse(input);
        const alias = await service.insertAlias(args.userKey, args.alias);
        return { summary: `Added ${alias.alias}`, data: alias };
      },
    },
    {
      name: "gws_aliases_delete",
      surface: "directory",
      access: "write",
      edition: "all",
      description:
        "Remove an alias from a user. Mail sent to the alias afterwards bounces until it is reassigned.",
      inputShape: aliasShape,
      run: async (input) => {
        const args = z.object(aliasShape).parse(input);
        await service.deleteAlias(args.userKey, args.alias);
        return { summary: `Removed ${args.alias}`, data: { alias: args.alias, deleted: true } };
      },
    },
  ];
}
