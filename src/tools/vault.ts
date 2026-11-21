import { z } from "zod";
import type { ConfirmedToolSpec, ToolSpec } from "../catalog.js";
import type { HoldQueryInput, VaultService } from "../services/vault.js";
import {
  buildExportOptions,
  buildHoldQuery,
  buildHoldScope,
  buildQuery,
  CORPORA,
  type Corpus,
} from "../services/vault-query.js";
import { ToolError } from "../util/errors.js";

const corpus = z.enum(CORPORA as [Corpus, ...Corpus[]]);

const pageShape = {
  pageSize: z.number().int().min(1).max(100).optional().describe("Page size, default 100"),
  pageToken: z.string().optional().describe("Token from a previous call"),
};

const view = z
  .enum(["BASIC", "FULL"])
  .optional()
  .describe("FULL also returns permissions or scope detail");

const matterId = z.string().min(1).describe("Matter id from a list call");

const holdId = z.string().min(1).describe("Hold id from a list call");

const exportQueryShape = {
  corpus: corpus.describe('Service to search, for example "MAIL" or "DRIVE"'),
  terms: z.string().optional().describe("Vault search operators"),
  dataScope: z.enum(["ALL_DATA", "HELD_DATA", "UNPROCESSED_DATA"]).optional(),
  searchMethod: z
    .enum([
      "ACCOUNT",
      "ORG_UNIT",
      "TEAM_DRIVE",
      "ENTIRE_ORG",
      "ROOM",
      "SITES_URL",
      "SHARED_DRIVE",
      "DRIVE_DOCUMENT",
    ])
    .optional()
    .describe("Derived from the entity you supply when it is omitted"),
  accountEmails: z.array(z.string().min(1)).optional().describe("Search these accounts"),
  orgUnitId: z.string().optional().describe("Search this organizational unit"),
  sharedDriveId: z.string().optional().describe("Search this shared drive"),
  startTime: z.string().optional().describe("Start of the date range, RFC 3339"),
  endTime: z.string().optional().describe("End of the date range, RFC 3339"),
  timeZone: z.string().optional().describe('IANA name, for example "America/Denver"'),
  options: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Extra Query fields the shortcuts do not model, for example mailOptions"),
};

const holdQueryShape = {
  terms: z.string().optional().describe("Search operators; Gmail and Groups holds"),
  startTime: z.string().optional().describe("Start of the range; Gmail and Groups holds"),
  endTime: z.string().optional().describe("End of the range; Gmail and Groups holds"),
  includeRooms: z.boolean().optional().describe("Include Chat spaces; Chat holds"),
  includeSharedDriveFiles: z.boolean().optional().describe("Include shared drives; Drive holds"),
  coveredData: z
    .array(z.enum(["TEXT_MESSAGES", "VOICEMAILS", "CALL_LOGS"]))
    .optional()
    .describe("Voice data types; Voice holds require this"),
  query: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Raw CorpusQuery, for anything the shortcuts do not model"),
};

const createMatterShape = {
  name: z.string().min(1).describe('Matter name, for example "Case 2026-014"'),
  description: z.string().optional(),
  matterRegion: z
    .enum(["ANY", "US", "EUROPE"])
    .optional()
    .describe("Requested data region; the tenant must be eligible for it"),
};

const updateMatterShape = {
  matterId,
  name: z.string().min(1).optional(),
  description: z.string().optional(),
};

const createHoldShape = {
  matterId,
  name: z.string().min(1).describe("Hold name"),
  corpus,
  accountEmails: z.array(z.string().min(1)).optional().describe("Accounts the hold covers"),
  orgUnitId: z.string().optional().describe("Organizational unit the hold covers"),
  ...holdQueryShape,
};

const updateHoldShape = {
  matterId,
  holdId,
  name: z.string().min(1).optional(),
  accountEmails: z.array(z.string().min(1)).optional().describe("Replace the held accounts"),
  orgUnitId: z.string().optional().describe("Replace the scope with this organizational unit"),
  ...holdQueryShape,
};

const addAccountsShape = {
  matterId,
  holdId,
  emails: z.array(z.string().min(1)).optional().describe("Accounts by primary email"),
  accountIds: z.array(z.string().min(1)).optional().describe("Accounts by Admin SDK id"),
};

const removeAccountsShape = {
  matterId,
  holdId,
  accountIds: z.array(z.string().min(1)).min(1).describe("Accounts to release from the hold"),
  confirm: z
    .boolean()
    .optional()
    .describe("Must be true. Data covered by the hold for these accounts is no longer preserved"),
};

const savedQueryId = z.string().min(1).describe("Saved query id from a list call");

const createSavedQueryShape = {
  matterId,
  displayName: z.string().min(1).describe("Name shown in Vault"),
  ...exportQueryShape,
};

const exportId = z.string().min(1).describe("Export id from a list or create call");

const createExportShape = {
  matterId,
  name: z.string().min(1).describe("Export name; avoid characters such as / and :"),
  ...exportQueryShape,
  exportFormat: z
    .string()
    .optional()
    .describe("Mail gets MBOX or PST, Groups XML, Chat JSON, Voice JSON, Calendar ICS"),
  region: z.enum(["ANY", "US", "EUROPE"]).optional().describe("Processing region"),
  exportOptions: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Extra ExportOptions fields, for example mailOptions.showConfidentialModeContent"),
};

const pollShape = {
  maxPolls: z
    .number()
    .int()
    .min(1)
    .max(60)
    .optional()
    .describe("Polls this call may make, default 5"),
  delaySeconds: z.number().min(0).max(60).optional().describe("Gap between polls, default 2"),
};

const exportWaitShape = {
  matterId,
  exportId,
  ...pollShape,
};

const operationWaitShape = {
  operationName: z.string().min(1).describe("Operation name returned by gws_vault_matters_count"),
  ...pollShape,
};

export function vaultTools(service: VaultService): Array<ToolSpec | ConfirmedToolSpec> {
  return [
    {
      name: "gws_vault_matters_list",
      surface: "vault",
      access: "read",
      edition: "enterprise",
      description:
        "List Vault matters with their state and name. Use view FULL to see who each matter is shared with, which is how you check what this administrator can reach. Enterprise or Education only.",
      inputShape: {
        state: z
          .enum(["OPEN", "CLOSED", "DELETED"])
          .optional()
          .describe("Only matters in this state"),
        view,
        ...pageShape,
      },
      run: async (input) => {
        const args = z
          .object({
            state: z.enum(["OPEN", "CLOSED", "DELETED"]).optional(),
            view: z.enum(["BASIC", "FULL"]).optional(),
            ...pageShape,
          })
          .parse(input);
        const result = await service.listMatters(args);
        return {
          summary: `${result.items.length} matter${result.items.length === 1 ? "" : "s"}${
            result.nextPageToken ? ", more available" : ""
          }`,
          data: result,
        };
      },
    },
    {
      name: "gws_vault_matters_get",
      surface: "vault",
      access: "read",
      edition: "enterprise",
      description:
        "Read one matter, its state and, with view FULL, its permissions. Enterprise or Education only.",
      inputShape: { matterId, view },
      run: async (input) => {
        const args = z.object({ matterId, view }).parse(input);
        const matter = await service.getMatter(args.matterId, args.view);
        return {
          summary: `${matter.name ?? args.matterId} (${matter.state ?? "unknown"})`,
          data: matter,
        };
      },
    },
    {
      name: "gws_vault_matters_create",
      surface: "vault",
      access: "write",
      edition: "enterprise",
      description:
        "Create a matter. Matters hold the searches, holds and exports for one investigation. Enterprise or Education only.",
      inputShape: createMatterShape,
      run: async (input) => {
        const args = z.object(createMatterShape).parse(input);
        const matter = await service.createMatter(args);
        return {
          summary: `Created matter ${matter.name ?? args.name}${matter.matterId ? ` (${matter.matterId})` : ""}`,
          data: matter,
        };
      },
    },
    {
      name: "gws_vault_matters_update",
      surface: "vault",
      access: "write",
      edition: "enterprise",
      description:
        "Rename a matter or change its description. The API replaces the whole matter, so the current one is read first and its region is preserved. Enterprise or Education only.",
      inputShape: updateMatterShape,
      run: async (input) => {
        const args = z.object(updateMatterShape).parse(input);
        const { matterId: id, ...patch } = args;
        const result = await service.updateMatter(id, patch);
        return {
          summary: `Updated matter ${id}`,
          data: result,
        };
      },
    },
    {
      name: "gws_vault_matters_close",
      surface: "vault",
      access: "write",
      edition: "enterprise",
      description:
        "Close a matter so it stops accepting new searches and holds. Reopening is allowed. Enterprise or Education only.",
      inputShape: { matterId },
      run: async (input) => {
        const args = z.object({ matterId }).parse(input);
        const matter = await service.closeMatter(args.matterId);
        return { summary: `Closed matter ${args.matterId}`, data: matter };
      },
    },
    {
      name: "gws_vault_matters_reopen",
      surface: "vault",
      access: "write",
      edition: "enterprise",
      description: "Reopen a closed matter. Enterprise or Education only.",
      inputShape: { matterId },
      run: async (input) => {
        const args = z.object({ matterId }).parse(input);
        const matter = await service.reopenMatter(args.matterId);
        return { summary: `Reopened matter ${args.matterId}`, data: matter };
      },
    },
    {
      name: "gws_vault_matters_delete",
      surface: "vault",
      access: "destructive",
      edition: "enterprise",
      description:
        "Delete a matter. Its holds, saved queries and exports go with it. Google keeps a deleted matter restorable with the undelete tool for 30 days. Enterprise or Education only.",
      confirmNote:
        "the matter and everything in it is deleted, and only undelete within 30 days can bring it back",
      inputShape: { matterId, confirm: z.boolean().optional() },
      run: async (input) => {
        const args = z.object({ matterId, confirm: z.boolean().optional() }).parse(input);
        const matter = await service.deleteMatter(args.matterId);
        return {
          summary: `Deleted matter ${args.matterId}; undelete can restore it for 30 days`,
          data: matter,
        };
      },
    },
    {
      name: "gws_vault_matters_undelete",
      surface: "vault",
      access: "write",
      edition: "enterprise",
      description:
        "Restore a deleted matter within Google's 30-day window. Enterprise or Education only.",
      inputShape: { matterId },
      run: async (input) => {
        const args = z.object({ matterId }).parse(input);
        const matter = await service.undeleteMatter(args.matterId);
        return { summary: `Restored matter ${args.matterId}`, data: matter };
      },
    },
    {
      name: "gws_vault_holds_list",
      surface: "vault",
      access: "read",
      edition: "enterprise",
      description:
        "List the holds in a matter with their corpus and scope. Enterprise or Education only.",
      inputShape: { matterId, view, ...pageShape },
      run: async (input) => {
        const args = z.object({ matterId, view, ...pageShape }).parse(input);
        const result = await service.listHolds(args.matterId, args);
        return {
          summary: `${result.items.length} hold${result.items.length === 1 ? "" : "s"}${
            result.nextPageToken ? ", more available" : ""
          }`,
          data: result,
        };
      },
    },
    {
      name: "gws_vault_holds_get",
      surface: "vault",
      access: "read",
      edition: "enterprise",
      description:
        "Read one hold: corpus, accounts or organizational unit, and its query. Enterprise or Education only.",
      inputShape: { matterId, holdId },
      run: async (input) => {
        const args = z.object({ matterId, holdId }).parse(input);
        const hold = await service.getHold(args.matterId, args.holdId);
        return { summary: `${hold.name ?? args.holdId} (${hold.corpus ?? "unknown"})`, data: hold };
      },
    },
    {
      name: "gws_vault_holds_create",
      surface: "vault",
      access: "write",
      edition: "enterprise",
      description:
        "Create a hold over accounts or one organizational unit. The query options must match the corpus: terms for Gmail and Groups, coveredData for Voice, shared drives for Drive. Enterprise or Education only.",
      inputShape: createHoldShape,
      run: async (input) => {
        const args = z.object(createHoldShape).parse(input);
        const scope = buildHoldScope(args);
        const query = buildHoldQuery(args.corpus, args);
        const hold = await service.createHold(args.matterId, {
          name: args.name,
          corpus: args.corpus,
          ...scope,
          query,
        });
        const covered = args.accountEmails?.length
          ? `${args.accountEmails.length} account${args.accountEmails.length === 1 ? "" : "s"}`
          : `organizational unit ${args.orgUnitId}`;
        return {
          summary: `Created ${args.corpus} hold ${hold.name ?? args.name} over ${covered}`,
          data: hold,
        };
      },
    },
    {
      name: "gws_vault_holds_update",
      surface: "vault",
      access: "write",
      edition: "enterprise",
      description:
        "Rename a hold, replace its scope, or replace its query. The API replaces the whole hold, so the current one is read first and the corpus drives which query options are accepted. Enterprise or Education only.",
      inputShape: updateHoldShape,
      run: async (input) => {
        const args = z.object(updateHoldShape).parse(input);
        const { matterId: id, holdId: hold, name, accountEmails, orgUnitId } = args;
        const query: HoldQueryInput = {
          terms: args.terms,
          startTime: args.startTime,
          endTime: args.endTime,
          includeRooms: args.includeRooms,
          includeSharedDriveFiles: args.includeSharedDriveFiles,
          coveredData: args.coveredData,
          query: args.query,
        };
        const result = await service.updateHold(id, hold, {
          ...(name === undefined ? {} : { name }),
          ...(accountEmails === undefined && orgUnitId === undefined
            ? {}
            : {
                scope: {
                  ...(accountEmails === undefined ? {} : { accountEmails }),
                  ...(orgUnitId === undefined ? {} : { orgUnitId }),
                },
              }),
          ...(isEmptyQuery(query) ? {} : { query }),
        });
        return { summary: `Updated hold ${hold}`, data: result };
      },
    },
    {
      name: "gws_vault_holds_delete",
      surface: "vault",
      access: "destructive",
      edition: "enterprise",
      description:
        "Delete a hold. Anything it protected stops being preserved beyond the tenant's retention rules. Enterprise or Education only.",
      confirmNote: "the hold is released and data it covered is no longer preserved by it",
      inputShape: { matterId, holdId, confirm: z.boolean().optional() },
      run: async (input) => {
        const args = z.object({ matterId, holdId, confirm: z.boolean().optional() }).parse(input);
        const hold = await service.deleteHold(args.matterId, args.holdId);
        return {
          summary: `Deleted hold ${hold.name ?? args.holdId}; its data is no longer preserved`,
          data: hold,
        };
      },
    },
    {
      name: "gws_vault_holds_add_accounts",
      surface: "vault",
      access: "write",
      edition: "enterprise",
      description:
        "Add accounts to an existing hold, by email or Admin SDK id. Enterprise or Education only.",
      inputShape: addAccountsShape,
      run: async (input) => {
        const args = z.object(addAccountsShape).parse(input);
        if (!args.emails?.length && !args.accountIds?.length) {
          throw new ToolError(
            "invalid_request",
            "No accounts were supplied.",
            "Pass emails or accountIds.",
          );
        }
        const result = await service.addHeldAccounts(args.matterId, args.holdId, {
          ...(args.emails?.length ? { emails: args.emails } : {}),
          ...(args.accountIds?.length ? { accountIds: args.accountIds } : {}),
        });
        return {
          summary: `Added ${result.added.length} account${result.added.length === 1 ? "" : "s"} to hold ${args.holdId}`,
          data: result,
        };
      },
    },
    {
      name: "gws_vault_holds_remove_accounts",
      surface: "vault",
      access: "destructive",
      edition: "enterprise",
      description:
        "Remove accounts from a hold. Their data stops being preserved by this hold, so the result names them. Enterprise or Education only.",
      confirmNote: "the accounts leave the hold and their data is no longer preserved by it",
      inputShape: removeAccountsShape,
      run: async (input) => {
        const args = z.object(removeAccountsShape).parse(input);
        const result = await service.removeHeldAccounts(
          args.matterId,
          args.holdId,
          args.accountIds,
        );
        return {
          summary: `Removed ${args.accountIds.length} account${
            args.accountIds.length === 1 ? "" : "s"
          } from hold ${args.holdId}: ${args.accountIds.join(", ")}; their data is no longer preserved`,
          data: result,
        };
      },
    },
    {
      name: "gws_vault_saved_queries_list",
      surface: "vault",
      access: "read",
      edition: "enterprise",
      description: "List the saved queries in a matter. Enterprise or Education only.",
      inputShape: { matterId, ...pageShape },
      run: async (input) => {
        const args = z.object({ matterId, ...pageShape }).parse(input);
        const result = await service.listSavedQueries(args.matterId, args);
        return {
          summary: `${result.items.length} saved quer${result.items.length === 1 ? "y" : "ies"}${
            result.nextPageToken ? ", more available" : ""
          }`,
          data: result,
        };
      },
    },
    {
      name: "gws_vault_saved_queries_get",
      surface: "vault",
      access: "read",
      edition: "enterprise",
      description: "Read one saved query with its corpus and terms. Enterprise or Education only.",
      inputShape: { matterId, savedQueryId },
      run: async (input) => {
        const args = z.object({ matterId, savedQueryId }).parse(input);
        const saved = await service.getSavedQuery(args.matterId, args.savedQueryId);
        return { summary: saved.displayName ?? args.savedQueryId, data: saved };
      },
    },
    {
      name: "gws_vault_saved_queries_create",
      surface: "vault",
      access: "write",
      edition: "enterprise",
      description:
        "Save a search in a matter so it can be run again without retyping the query. Enterprise or Education only.",
      inputShape: createSavedQueryShape,
      run: async (input) => {
        const args = z.object(createSavedQueryShape).parse(input);
        const { matterId: id, displayName, searchMethod, ...query } = args;
        const saved = await service.createSavedQuery(id, {
          displayName,
          query: buildQuery({ ...query, ...(searchMethod ? { method: searchMethod } : {}) }),
        });
        return {
          summary: `Saved query ${saved.displayName ?? displayName}${
            saved.savedQueryId ? ` (${saved.savedQueryId})` : ""
          }`,
          data: saved,
        };
      },
    },
    {
      name: "gws_vault_saved_queries_delete",
      surface: "vault",
      access: "write",
      edition: "enterprise",
      description:
        "Delete a saved query definition. It can be recreated from the same search. Enterprise or Education only.",
      inputShape: { matterId, savedQueryId },
      run: async (input) => {
        const args = z.object({ matterId, savedQueryId }).parse(input);
        await service.deleteSavedQuery(args.matterId, args.savedQueryId);
        return {
          summary: `Deleted saved query ${args.savedQueryId}`,
          data: { savedQueryId: args.savedQueryId },
        };
      },
    },
    {
      name: "gws_vault_exports_list",
      surface: "vault",
      access: "read",
      edition: "enterprise",
      description:
        "List a matter's exports with their status, so a stalled job is visible without polling one by one. Enterprise or Education only.",
      inputShape: { matterId, ...pageShape },
      run: async (input) => {
        const args = z.object({ matterId, ...pageShape }).parse(input);
        const result = await service.listExports(args.matterId, args);
        return {
          summary: `${result.items.length} export${result.items.length === 1 ? "" : "s"}${
            result.nextPageToken ? ", more available" : ""
          }`,
          data: result,
        };
      },
    },
    {
      name: "gws_vault_exports_get",
      surface: "vault",
      access: "read",
      edition: "enterprise",
      description:
        "Read one export: status, progress counters and the Cloud Storage sink once Vault has written to it. Enterprise or Education only.",
      inputShape: { matterId, exportId },
      run: async (input) => {
        const args = z.object({ matterId, exportId }).parse(input);
        const item = await service.getExport(args.matterId, args.exportId);
        return {
          summary: `Export ${args.exportId}: ${item.status ?? "unknown"}`,
          data: item,
        };
      },
    },
    {
      name: "gws_vault_exports_create",
      surface: "vault",
      access: "destructive",
      edition: "enterprise",
      description:
        "Start an export. Vault writes the matched data to the Cloud Storage sink it reports on the export once processing starts; the job is asynchronous, so poll it with gws_vault_exports_wait. Enterprise or Education only.",
      confirmNote:
        "an export job starts, Vault writes a copy of the matched data to Cloud Storage, and that copy stays until it is deleted",
      inputShape: { ...createExportShape, confirm: z.boolean().optional() },
      run: async (input) => {
        const args = z
          .object({ ...createExportShape, confirm: z.boolean().optional() })
          .parse(input);
        const {
          matterId: id,
          name,
          searchMethod,
          exportFormat,
          region,
          exportOptions,
          confirm: _c,
          ...query
        } = args;
        const options = buildExportOptions({
          corpus: query.corpus,
          ...(exportFormat ? { exportFormat } : {}),
          ...(region ? { region } : {}),
          ...(exportOptions ? { options: exportOptions } : {}),
        });
        const created = await service.createExport(id, {
          name,
          query: buildQuery({ ...query, ...(searchMethod ? { method: searchMethod } : {}) }),
          ...(Object.keys(options).length > 0 ? { exportOptions: options } : {}),
        });
        return {
          summary: `Export ${created.id ?? "(pending)"} created for matter ${id}; Vault writes its output to the Cloud Storage sink reported on the export. Poll with gws_vault_exports_wait.`,
          data: created,
        };
      },
    },
    {
      name: "gws_vault_exports_delete",
      surface: "vault",
      access: "destructive",
      edition: "enterprise",
      description:
        "Delete an export record. Files Vault already wrote to Cloud Storage stay in the bucket. Enterprise or Education only.",
      confirmNote:
        "the export record is removed; files already written to Cloud Storage stay there",
      inputShape: { matterId, exportId, confirm: z.boolean().optional() },
      run: async (input) => {
        const args = z.object({ matterId, exportId, confirm: z.boolean().optional() }).parse(input);
        await service.deleteExport(args.matterId, args.exportId);
        return {
          summary: `Deleted export ${args.exportId}; any files already written stay in the bucket`,
          data: { exportId: args.exportId },
        };
      },
    },
    {
      name: "gws_vault_exports_wait",
      surface: "vault",
      access: "read",
      edition: "enterprise",
      description:
        "Poll an export until it is COMPLETED or FAILED, or until this call's poll budget runs out. A running result reports the status, progress and elapsed time without claiming completion; call again to keep waiting. Enterprise or Education only.",
      inputShape: exportWaitShape,
      run: async (input) => {
        const args = z.object(exportWaitShape).parse(input);
        const result = await service.waitForExport(args.matterId, args.exportId, {
          maxPolls: args.maxPolls ?? 5,
          delayMs: (args.delaySeconds ?? 2) * 1000,
        });
        const waited = `${Math.round(result.elapsedMs / 1000)}s, ${result.polls} poll${
          result.polls === 1 ? "" : "s"
        }`;
        if (result.state === "completed") {
          const stats = result.export?.stats as
            | { exportedArtifactCount?: unknown; sizeInBytes?: unknown }
            | undefined;
          return {
            summary: `Export ${args.exportId} completed after ${waited}${
              stats?.exportedArtifactCount === undefined
                ? ""
                : `; ${String(stats.exportedArtifactCount)} artifacts`
            }`,
            data: result,
          };
        }
        if (result.state === "failed") {
          return {
            summary: `Export ${args.exportId} failed after ${waited}; the API does not report a failure reason, so check the matter in the Vault UI`,
            data: result,
          };
        }
        return {
          summary: `Export ${args.exportId} is still ${result.export?.status ?? "running"} after ${waited}; ${result.detail ?? "no progress reported"}`,
          data: result,
        };
      },
    },
    {
      name: "gws_vault_matters_count",
      surface: "vault",
      access: "read",
      edition: "enterprise",
      description:
        "Count the artifacts a query matches before exporting. Google runs the count as an operation; poll it with gws_vault_operations_wait. Enterprise or Education only.",
      inputShape: { matterId, ...exportQueryShape },
      run: async (input) => {
        const args = z.object({ matterId, ...exportQueryShape }).parse(input);
        const { matterId: id, searchMethod, ...query } = args;
        const result = await service.countArtifacts(
          id,
          buildQuery({ ...query, ...(searchMethod ? { method: searchMethod } : {}) }),
        );
        return {
          summary: result.operationName
            ? `Count started (${result.operationName}); poll it with gws_vault_operations_wait`
            : "Count started, but Google returned no operation name",
          data: result,
        };
      },
    },
    {
      name: "gws_vault_operations_wait",
      surface: "vault",
      access: "read",
      edition: "enterprise",
      description:
        "Poll a Vault long-running operation, such as an artifact count, until it finishes or the poll budget runs out; a running result reports state and elapsed time. Enterprise or Education only.",
      inputShape: operationWaitShape,
      run: async (input) => {
        const args = z.object(operationWaitShape).parse(input);
        const result = await service.waitForOperation(args.operationName, {
          maxPolls: args.maxPolls ?? 5,
          delayMs: (args.delaySeconds ?? 2) * 1000,
        });
        const waited = `${Math.round(result.elapsedMs / 1000)}s, ${result.polls} poll${
          result.polls === 1 ? "" : "s"
        }`;
        if (result.state === "completed") {
          return { summary: `Operation completed after ${waited}`, data: result };
        }
        if (result.state === "failed") {
          return {
            summary: `Operation failed after ${waited}: ${result.error?.message ?? "no reason reported"}`,
            data: result,
          };
        }
        return {
          summary: `Operation still running after ${waited}; ${result.detail ?? "no progress reported"}`,
          data: result,
        };
      },
    },
  ];
}

/** True when the caller supplied none of the hold query shortcuts. */
function isEmptyQuery(query: HoldQueryInput): boolean {
  return Object.values(query).every((value) => value === undefined);
}
