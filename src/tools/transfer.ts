import { z } from "zod";
import type { ConfirmedToolSpec, ToolSpec } from "../catalog.js";
import type { TransferService } from "../services/transfer.js";

const listShape = {
  status: z
    .string()
    .optional()
    .describe('Overall status, for example "inProgress", "completed", "failed"'),
  oldOwnerUserId: z.string().optional().describe("Transfers away from this user"),
  newOwnerUserId: z.string().optional().describe("Transfers into this user"),
  maxResults: z.number().int().min(1).max(500).optional().describe("Page size, default 100"),
  pageToken: z.string().optional().describe("Token from a previous call"),
};

const idShape = {
  dataTransferId: z.string().min(1).describe("Transfer id from a list call"),
};

const insertShape = {
  oldOwnerUserId: z.string().min(1).describe("Account the data leaves"),
  newOwnerUserId: z.string().min(1).describe("Account the data lands in"),
  applications: z
    .array(
      z.object({
        applicationId: z
          .string()
          .min(1)
          .describe('Application to move, for example "mail", "drive" or "calendar"'),
        parameters: z
          .record(z.string(), z.array(z.string()))
          .optional()
          .describe('Application options, for example {"transfer_drive":"true"}'),
      }),
    )
    .min(1)
    .describe("What to transfer; at least one application"),
  confirm: z
    .boolean()
    .optional()
    .describe("Must be true. Data moves and the old owner loses access to what moved"),
};

export function transferTools(service: TransferService): Array<ToolSpec | ConfirmedToolSpec> {
  return [
    {
      name: "gws_transfers_list",
      surface: "transfer",
      access: "read",
      edition: "all",
      description:
        "List data transfers, optionally filtered by status or by either account. Use it to check whether an offboarding transfer already ran.",
      inputShape: listShape,
      run: async (input) => {
        const args = z.object(listShape).parse(input);
        const result = await service.listTransfers(args);
        return {
          summary: `${result.items.length} transfer${result.items.length === 1 ? "" : "s"}${
            result.nextPageToken ? ", more available" : ""
          }`,
          data: result,
        };
      },
    },
    {
      name: "gws_transfers_get",
      surface: "transfer",
      access: "read",
      edition: "all",
      description:
        "Get one transfer with its per-application status, so a stalled application is visible rather than hidden behind the overall status.",
      inputShape: idShape,
      run: async (input) => {
        const args = z.object(idShape).parse(input);
        const transfer = await service.getTransfer(args.dataTransferId);
        return {
          summary: `Transfer ${args.dataTransferId}: ${transfer.overallTransferStatusCode ?? "unknown"}`,
          data: transfer,
        };
      },
    },
    {
      name: "gws_transfers_insert",
      surface: "transfer",
      access: "destructive",
      edition: "all",
      description:
        "Start a data transfer between two accounts. Data moves from the old owner to the new one and the old owner loses access; the transfer is not reversible from here.",
      confirmNote:
        "data moves from the old owner to the new owner and the old owner loses access to it",
      inputShape: insertShape,
      run: async (input) => {
        const args = z.object(insertShape).parse(input);
        const transfer = await service.insertTransfer({
          oldOwnerUserId: args.oldOwnerUserId,
          newOwnerUserId: args.newOwnerUserId,
          applications: args.applications.map((application) => ({
            applicationId: application.applicationId,
            ...(application.parameters ? { parameters: application.parameters } : {}),
          })),
        });
        return {
          summary: `Transfer ${transfer.id ?? "(pending)"} from ${args.oldOwnerUserId} to ${args.newOwnerUserId}: ${transfer.overallTransferStatusCode ?? "submitted"}`,
          data: transfer,
        };
      },
    },
  ];
}
