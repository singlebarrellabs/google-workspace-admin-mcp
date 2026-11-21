import { z } from "zod";
import type { ConfirmedToolSpec, ToolSpec } from "../catalog.js";
import type { LicensingService } from "../services/licensing.js";

const listShape = {
  productId: z.string().min(1).describe('Product, for example "Google-Apps"'),
  skuId: z.string().optional().describe('SKU, for example "Google-Apps-For-Business"'),
  maxResults: z.number().int().min(1).max(500).optional().describe("Page size, default 100"),
  pageToken: z.string().optional().describe("Token from a previous call"),
};

const keyShape = {
  productId: z.string().min(1).describe("Product id"),
  skuId: z.string().min(1).describe("SKU id"),
  userId: z.string().min(1).describe("User's primary email"),
};

const assignShape = {
  ...keyShape,
  confirm: z
    .boolean()
    .optional()
    .describe("Must be true. A paid seat is taken from the subscription for this user"),
};

const revokeShape = {
  ...keyShape,
  confirm: z
    .boolean()
    .optional()
    .describe("Must be true. The user loses access to the product straight away"),
};

export function licensingTools(service: LicensingService): Array<ToolSpec | ConfirmedToolSpec> {
  return [
    {
      name: "gws_licenses_list",
      surface: "licensing",
      access: "read",
      edition: "all",
      description:
        "List license assignments for a product, optionally narrowed to one SKU. Pages with nextPageToken.",
      inputShape: listShape,
      run: async (input) => {
        const args = z.object(listShape).parse(input);
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
      name: "gws_licenses_get",
      surface: "licensing",
      access: "read",
      edition: "all",
      description: "Get one license assignment: user, product, SKU and whether it is active.",
      inputShape: keyShape,
      run: async (input) => {
        const args = z.object(keyShape).parse(input);
        const assignment = await service.getAssignment(args);
        return {
          summary: `${assignment.userId} holds ${assignment.skuName ?? args.skuId}`,
          data: assignment,
        };
      },
    },
    {
      name: "gws_licenses_assign",
      surface: "licensing",
      access: "destructive",
      edition: "all",
      description:
        "Assign a license seat to a user. The seat comes out of the subscription, and a tenant with none left is told so rather than silently failing.",
      confirmNote: "a paid seat is assigned to this user and is unavailable to anyone else",
      inputShape: assignShape,
      run: async (input) => {
        const args = z.object(assignShape).parse(input);
        const result = await service.assign(args);
        return {
          summary: result.alreadyAssigned
            ? `${args.userId} already holds ${args.skuId}; nothing changed`
            : `Assigned ${args.skuId} to ${args.userId}`,
          data: result,
        };
      },
    },
    {
      name: "gws_licenses_revoke",
      surface: "licensing",
      access: "destructive",
      edition: "all",
      description:
        "Revoke a license from a user. Access to that product ends immediately and the seat returns to the subscription.",
      confirmNote: "the user loses access to the product now and the seat is freed",
      inputShape: revokeShape,
      run: async (input) => {
        const args = z.object(revokeShape).parse(input);
        const assignment = await service.revoke(args);
        return {
          summary: `Revoked ${assignment.skuName ?? args.skuId} from ${assignment.userId || args.userId}; access ends now`,
          data: assignment,
        };
      },
    },
  ];
}
