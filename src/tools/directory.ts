import { z } from "zod";
import type { ConfirmedToolSpec, ToolSpec } from "../catalog.js";
import type { DirectoryService } from "../services/directory.js";

const listShape = {
  query: z.string().optional().describe('Directory query, for example "email:user@example.com"'),
  orgUnitPath: z.string().optional().describe("Org unit path, for example /Engineering"),
  maxResults: z.number().int().min(1).max(500).optional().describe("Page size, default 100"),
  pageToken: z.string().optional().describe("Token from a previous call"),
};

const suspendShape = {
  userKey: z.string().min(1).describe("Primary email or immutable user id"),
  confirm: z
    .boolean()
    .optional()
    .describe("Must be true. Suspension is reversible, but it ends the user's access now"),
};

export function directoryTools(service: DirectoryService): Array<ToolSpec | ConfirmedToolSpec> {
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
        return {
          summary: `${user.primaryEmail || args.userKey} is suspended`,
          data: user,
        };
      },
    },
  ];
}
