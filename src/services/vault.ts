import type { OAuth2Client } from "google-auth-library";
import { google, type vault_v1 } from "googleapis";
import { mapGoogleError, ToolError } from "../util/errors.js";
import { buildHoldQuery, buildHoldScope, type Corpus, type HoldQueryInput } from "./vault-query.js";

export type { Corpus, HoldQueryInput } from "./vault-query.js";
export { CORPORA } from "./vault-query.js";

export interface PageArgs {
  pageSize?: number;
  pageToken?: string;
}

export interface ListMattersArgs extends PageArgs {
  state?: "OPEN" | "CLOSED" | "DELETED";
  view?: "BASIC" | "FULL";
}

export interface MatterRow {
  matterId?: string;
  name?: string;
  description?: string;
  state?: string;
  matterRegion?: string;
  /** Present with view FULL; says who the matter is shared with. */
  permissions?: Array<{ accountId?: string; role?: string }>;
}

export interface HoldRow {
  holdId?: string;
  name?: string;
  corpus?: string;
  updateTime?: string;
  accounts?: Array<{
    accountId?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    holdTime?: string;
  }>;
  orgUnit?: { orgUnitId?: string; holdTime?: string };
  query?: Record<string, unknown>;
}

export interface SavedQueryRow {
  savedQueryId?: string;
  displayName?: string;
  createTime?: string;
  query?: Record<string, unknown>;
}

export interface ExportRow {
  id?: string;
  name?: string;
  matterId?: string;
  status?: string;
  createTime?: string;
  query?: Record<string, unknown>;
  exportOptions?: Record<string, unknown>;
  stats?: Record<string, unknown>;
  cloudStorageSink?: unknown;
}

export interface OperationView {
  name?: string;
  done?: boolean;
  metadata?: unknown;
  response?: unknown;
  error?: { code?: number; message?: string };
}

export interface ExportWaitResult {
  state: "running" | "completed" | "failed";
  exportId: string;
  polls: number;
  elapsedMs: number;
  export?: ExportRow;
  /** Progress from the export's stats while it is unfinished. */
  detail?: string;
}

export interface OperationWaitResult {
  state: "running" | "completed" | "failed";
  operationName: string;
  polls: number;
  elapsedMs: number;
  result?: unknown;
  error?: { code?: number; message?: string };
  detail?: string;
}

export interface HoldUpdate {
  name?: string;
  scope?: { accountEmails?: string[]; orgUnitId?: string };
  query?: HoldQueryInput;
}

export interface WaitOptions {
  /** How many polls this call may make, including the first. */
  maxPolls: number;
  /** Millisecond gap between polls. */
  delayMs: number;
}

export interface VaultServiceOptions {
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/**
 * Google Vault. Enterprise and Education only; every call runs as the signed-in
 * administrator, so a 403 usually means the matter is not shared rather than
 * that the tenant lacks Vault.
 *
 * `matters.update` and `holds.update` are PUTs, so a partial change is applied
 * by reading the resource and sending the merged body back.
 */
export class VaultService {
  private readonly client: vault_v1.Vault;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(auth: OAuth2Client, options: VaultServiceOptions = {}) {
    this.client = google.vault({ version: "v1", auth });
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? (() => Date.now());
  }

  async listMatters(
    args: ListMattersArgs,
  ): Promise<{ items: MatterRow[]; nextPageToken?: string }> {
    try {
      const response = await this.client.matters.list({
        pageSize: args.pageSize ?? 100,
        ...(args.pageToken ? { pageToken: args.pageToken } : {}),
        ...(args.state ? { state: args.state } : {}),
        ...(args.view ? { view: args.view } : {}),
      });
      return {
        items: (response.data.matters ?? []).map(toMatterRow),
        ...(response.data.nextPageToken ? { nextPageToken: response.data.nextPageToken } : {}),
      };
    } catch (error) {
      throw mapVaultError(error);
    }
  }

  async getMatter(matterId: string, view?: "BASIC" | "FULL"): Promise<MatterRow> {
    try {
      const response = await this.client.matters.get({
        matterId,
        ...(view ? { view } : {}),
      });
      return toMatterRow(response.data);
    } catch (error) {
      throw mapVaultError(error, matterId);
    }
  }

  async createMatter(args: {
    name: string;
    description?: string;
    matterRegion?: "ANY" | "US" | "EUROPE";
  }): Promise<MatterRow> {
    try {
      const response = await this.client.matters.create({
        requestBody: {
          name: args.name,
          ...(args.description ? { description: args.description } : {}),
          ...(args.matterRegion ? { matterRegion: args.matterRegion } : {}),
        },
      });
      return toMatterRow(response.data);
    } catch (error) {
      throw mapVaultError(error);
    }
  }

  /**
   * `matters.update` is a PUT. The current matter is read first so a name
   * change cannot blank the description or move the matter's region.
   */
  async updateMatter(
    matterId: string,
    patch: { name?: string; description?: string },
  ): Promise<{ matter: MatterRow; previous: MatterRow }> {
    if (patch.name === undefined && patch.description === undefined) {
      throw new ToolError(
        "invalid_request",
        "No matter fields were supplied to change.",
        "Pass name or description.",
      );
    }

    const previous = await this.getMatter(matterId);
    try {
      const response = await this.client.matters.update({
        matterId,
        requestBody: {
          ...(previous.name ? { name: previous.name } : {}),
          ...(previous.description ? { description: previous.description } : {}),
          ...(previous.matterRegion ? { matterRegion: previous.matterRegion } : {}),
          ...(patch.name === undefined ? {} : { name: patch.name }),
          ...(patch.description === undefined ? {} : { description: patch.description }),
        },
      });
      return { matter: toMatterRow(response.data), previous };
    } catch (error) {
      throw mapVaultError(error, matterId);
    }
  }

  async closeMatter(matterId: string): Promise<MatterRow> {
    try {
      const response = await this.client.matters.close({
        matterId,
        requestBody: {},
      });
      return toMatterRow((response.data.matter ?? {}) as vault_v1.Schema$Matter);
    } catch (error) {
      throw mapVaultError(error, matterId);
    }
  }

  async reopenMatter(matterId: string): Promise<MatterRow> {
    try {
      const response = await this.client.matters.reopen({
        matterId,
        requestBody: {},
      });
      return toMatterRow((response.data.matter ?? {}) as vault_v1.Schema$Matter);
    } catch (error) {
      throw mapVaultError(error, matterId);
    }
  }

  async deleteMatter(matterId: string): Promise<MatterRow> {
    try {
      const response = await this.client.matters.delete({ matterId });
      return toMatterRow(response.data);
    } catch (error) {
      throw mapVaultError(error, matterId);
    }
  }

  async undeleteMatter(matterId: string): Promise<MatterRow> {
    try {
      const response = await this.client.matters.undelete({
        matterId,
        requestBody: {},
      });
      return toMatterRow(response.data);
    } catch (error) {
      throw mapVaultError(error, matterId);
    }
  }

  async listHolds(
    matterId: string,
    args: PageArgs & { view?: "BASIC" | "FULL" },
  ): Promise<{ items: HoldRow[]; nextPageToken?: string }> {
    try {
      const response = await this.client.matters.holds.list({
        matterId,
        pageSize: args.pageSize ?? 100,
        ...(args.pageToken ? { pageToken: args.pageToken } : {}),
        ...(args.view ? { view: args.view } : {}),
      });
      return {
        items: (response.data.holds ?? []).map(toHoldRow),
        ...(response.data.nextPageToken ? { nextPageToken: response.data.nextPageToken } : {}),
      };
    } catch (error) {
      throw mapVaultError(error, matterId);
    }
  }

  async getHold(matterId: string, holdId: string): Promise<HoldRow> {
    try {
      const response = await this.client.matters.holds.get({ matterId, holdId });
      return toHoldRow(response.data);
    } catch (error) {
      throw mapVaultError(error, matterId);
    }
  }

  async createHold(matterId: string, hold: vault_v1.Schema$Hold): Promise<HoldRow> {
    try {
      const response = await this.client.matters.holds.create({
        matterId,
        requestBody: hold,
      });
      return toHoldRow(response.data);
    } catch (error) {
      throw mapVaultError(error, matterId);
    }
  }

  /**
   * `holds.update` is a PUT. Scope and query are replaced, so the current hold
   * is read first, the patch is built against its corpus, and the merged body
   * is sent back.
   */
  async updateHold(
    matterId: string,
    holdId: string,
    patch: HoldUpdate,
  ): Promise<{ hold: HoldRow; previous: HoldRow }> {
    if (patch.name === undefined && !patch.scope && !patch.query) {
      throw new ToolError(
        "invalid_request",
        "No hold fields were supplied to change.",
        "Pass name, a scope, or query options.",
      );
    }

    const previous = await this.getHold(matterId, holdId);
    const corpus = (previous.corpus ?? "MAIL") as Corpus;
    const scope = patch.scope
      ? buildHoldScope({ corpus, ...patch.scope })
      : previous.accounts?.length
        ? { accounts: previous.accounts.map((account) => accountIdOf(account)) }
        : previous.orgUnit?.orgUnitId
          ? { orgUnit: { orgUnitId: previous.orgUnit.orgUnitId } }
          : {};
    const query = patch.query
      ? buildHoldQuery(corpus, patch.query)
      : (previous.query as vault_v1.Schema$CorpusQuery | undefined);

    try {
      const response = await this.client.matters.holds.update({
        matterId,
        holdId,
        requestBody: {
          ...(previous.name ? { name: previous.name } : {}),
          ...(patch.name === undefined ? {} : { name: patch.name }),
          corpus,
          ...scope,
          ...(query ? { query } : {}),
        },
      });
      return { hold: toHoldRow(response.data), previous };
    } catch (error) {
      throw mapVaultError(error, matterId);
    }
  }

  async deleteHold(matterId: string, holdId: string): Promise<HoldRow> {
    try {
      const response = await this.client.matters.holds.delete({ matterId, holdId });
      return toHoldRow(response.data);
    } catch (error) {
      throw mapVaultError(error, matterId);
    }
  }

  async addHeldAccounts(
    matterId: string,
    holdId: string,
    account: { emails?: string[]; accountIds?: string[] },
  ): Promise<{
    added: Array<{
      accountId?: string;
      email?: string;
      status?: { code?: number; message?: string };
    }>;
  }> {
    try {
      const response = await this.client.matters.holds.addHeldAccounts({
        matterId,
        holdId,
        requestBody: {
          ...(account.emails?.length ? { emails: account.emails } : {}),
          ...(account.accountIds?.length ? { accountIds: account.accountIds } : {}),
        },
      });
      return {
        added: (response.data.responses ?? []).map((entry) => ({
          ...(entry.account?.accountId ? { accountId: entry.account.accountId } : {}),
          ...(entry.account?.email ? { email: entry.account.email } : {}),
          ...(entry.status
            ? {
                status: {
                  ...(entry.status.code === undefined || entry.status.code === null
                    ? {}
                    : { code: entry.status.code }),
                  ...(entry.status.message ? { message: entry.status.message } : {}),
                },
              }
            : {}),
        })),
      };
    } catch (error) {
      throw mapVaultError(error, matterId);
    }
  }

  async removeHeldAccounts(
    matterId: string,
    holdId: string,
    accountIds: string[],
  ): Promise<{ removed: Array<{ accountId?: string; code?: number; message?: string }> }> {
    try {
      const response = await this.client.matters.holds.removeHeldAccounts({
        matterId,
        holdId,
        requestBody: { accountIds },
      });
      return {
        removed: (response.data.statuses ?? []).map((status) => ({
          ...(status.code === undefined || status.code === null ? {} : { code: status.code }),
          ...(status.message ? { message: status.message } : {}),
        })),
      };
    } catch (error) {
      throw mapVaultError(error, matterId);
    }
  }

  async listSavedQueries(
    matterId: string,
    args: PageArgs,
  ): Promise<{ items: SavedQueryRow[]; nextPageToken?: string }> {
    try {
      const response = await this.client.matters.savedQueries.list({
        matterId,
        pageSize: args.pageSize ?? 100,
        ...(args.pageToken ? { pageToken: args.pageToken } : {}),
      });
      return {
        items: (response.data.savedQueries ?? []).map(toSavedQueryRow),
        ...(response.data.nextPageToken ? { nextPageToken: response.data.nextPageToken } : {}),
      };
    } catch (error) {
      throw mapVaultError(error, matterId);
    }
  }

  async getSavedQuery(matterId: string, savedQueryId: string): Promise<SavedQueryRow> {
    try {
      const response = await this.client.matters.savedQueries.get({ matterId, savedQueryId });
      return toSavedQueryRow(response.data);
    } catch (error) {
      throw mapVaultError(error, matterId);
    }
  }

  async createSavedQuery(
    matterId: string,
    args: { displayName: string; query: vault_v1.Schema$Query },
  ): Promise<SavedQueryRow> {
    try {
      const response = await this.client.matters.savedQueries.create({
        matterId,
        requestBody: { displayName: args.displayName, query: args.query },
      });
      return toSavedQueryRow(response.data);
    } catch (error) {
      throw mapVaultError(error, matterId);
    }
  }

  async deleteSavedQuery(matterId: string, savedQueryId: string): Promise<void> {
    try {
      await this.client.matters.savedQueries.delete({ matterId, savedQueryId });
    } catch (error) {
      throw mapVaultError(error, matterId);
    }
  }

  async listExports(
    matterId: string,
    args: PageArgs,
  ): Promise<{ items: ExportRow[]; nextPageToken?: string }> {
    try {
      const response = await this.client.matters.exports.list({
        matterId,
        pageSize: args.pageSize ?? 100,
        ...(args.pageToken ? { pageToken: args.pageToken } : {}),
      });
      return {
        items: (response.data.exports ?? []).map(toExportRow),
        ...(response.data.nextPageToken ? { nextPageToken: response.data.nextPageToken } : {}),
      };
    } catch (error) {
      throw mapVaultError(error, matterId);
    }
  }

  async getExport(matterId: string, exportId: string): Promise<ExportRow> {
    try {
      const response = await this.client.matters.exports.get({ matterId, exportId });
      return toExportRow(response.data);
    } catch (error) {
      throw mapVaultError(error, matterId);
    }
  }

  async createExport(matterId: string, exportBody: vault_v1.Schema$Export): Promise<ExportRow> {
    try {
      const response = await this.client.matters.exports.create({
        matterId,
        requestBody: exportBody,
      });
      return toExportRow(response.data);
    } catch (error) {
      throw mapVaultError(error, matterId);
    }
  }

  /** Starts an artifact count; the count itself runs as an operation. */
  async countArtifacts(
    matterId: string,
    query: vault_v1.Schema$Query,
    view?: "BASIC" | "FULL",
  ): Promise<{ operationName?: string }> {
    try {
      const response = await this.client.matters.count({
        matterId,
        requestBody: {
          query,
          ...(view ? { view } : {}),
        },
      });
      return { ...(response.data.name ? { operationName: response.data.name } : {}) };
    } catch (error) {
      throw mapVaultError(error, matterId);
    }
  }

  async getOperation(operationName: string): Promise<OperationView> {
    try {
      const response = await this.client.operations.get({ name: operationName });
      return toOperationView(response.data);
    } catch (error) {
      throw mapVaultError(error);
    }
  }

  /**
   * Polls an export's own status. Vault does not expose an operation for an
   * export, so the export resource is the thing that reaches COMPLETED or
   * FAILED. The caller can resume with the same identifiers; nothing is
   * cancelled here.
   */
  async waitForExport(
    matterId: string,
    exportId: string,
    options: WaitOptions,
  ): Promise<ExportWaitResult> {
    const started = this.now();
    let polls = 0;
    let latest: ExportRow = {};

    for (;;) {
      polls += 1;
      latest = await this.getExport(matterId, exportId);

      if (latest.status === "COMPLETED") {
        return {
          state: "completed",
          exportId,
          polls,
          elapsedMs: this.now() - started,
          export: latest,
        };
      }

      if (latest.status === "FAILED") {
        return {
          state: "failed",
          exportId,
          polls,
          elapsedMs: this.now() - started,
          export: latest,
          detail: progressDetail(latest.stats),
        };
      }

      if (polls >= options.maxPolls) {
        return {
          state: "running",
          exportId,
          polls,
          elapsedMs: this.now() - started,
          export: latest,
          detail: progressDetail(latest.stats),
        };
      }

      await this.sleep(options.delayMs);
    }
  }

  /** Polls a long-running operation, used by the artifact count. */
  async waitForOperation(
    operationName: string,
    options: WaitOptions,
  ): Promise<OperationWaitResult> {
    const started = this.now();
    let polls = 0;

    for (;;) {
      polls += 1;
      const operation = await this.getOperation(operationName);

      if (operation.done) {
        if (operation.error) {
          return {
            state: "failed",
            operationName,
            polls,
            elapsedMs: this.now() - started,
            error: {
              ...(operation.error.code === undefined ? {} : { code: operation.error.code }),
              ...(operation.error.message ? { message: operation.error.message } : {}),
            },
          };
        }
        return {
          state: "completed",
          operationName,
          polls,
          elapsedMs: this.now() - started,
          ...(operation.response === undefined ? {} : { result: operation.response }),
        };
      }

      if (polls >= options.maxPolls) {
        return {
          state: "running",
          operationName,
          polls,
          elapsedMs: this.now() - started,
          detail: progressDetail(operation.metadata),
        };
      }

      await this.sleep(options.delayMs);
    }
  }

  async deleteExport(matterId: string, exportId: string): Promise<void> {
    try {
      await this.client.matters.exports.delete({ matterId, exportId });
    } catch (error) {
      throw mapVaultError(error, matterId);
    }
  }
}

/**
 * A 403 on Vault is usually about the matter, not the tenant: the account must
 * have created the matter, have it shared with it, or hold View All Matters.
 * An edition rejection keeps its own category.
 */
function mapVaultError(error: unknown, matterId?: string): ToolError {
  if (error instanceof ToolError) return error;

  const mapped = mapGoogleError(error, "vault");
  const detail = messageOf(error);

  if (mapped.category === "edition_unavailable") {
    return new ToolError(
      "edition_unavailable",
      "Vault requires Google Workspace Enterprise or Education, and this tenant does not have it.",
      "Use the directory or reports tools for the same task; Vault is only available on Enterprise or Education.",
    );
  }

  if (mapped.category === "permission_denied") {
    return new ToolError(
      "permission_denied",
      `${
        matterId ? `Matter ${matterId} is not visible to the signed-in administrator. ` : ""
      }Vault access depends on the matter being shared with the administrator, or on the View All Matters privilege.${
        detail ? ` Google said: ${detail}.` : ""
      }`,
      "Ask a Vault administrator to share the matter, or grant the View All Matters privilege.",
    );
  }

  return mapped;
}

function statusOf(error: unknown): number | undefined {
  const err = (error ?? {}) as {
    response?: { status?: number; data?: { error?: { code?: number } } };
    code?: number;
  };
  return err.response?.status ?? err.code ?? err.response?.data?.error?.code;
}

function messageOf(error: unknown): string {
  const err = (error ?? {}) as { message?: string };
  return err.message ?? "";
}

function reasonsOf(error: unknown): string[] {
  const err = (error ?? {}) as {
    response?: { data?: { error?: { errors?: Array<{ reason?: string }> } } };
  };
  return (err.response?.data?.error?.errors ?? [])
    .map((entry) => entry.reason ?? "")
    .filter(Boolean);
}

function accountIdOf(account: { accountId?: string; email?: string }): {
  accountId?: string;
  email?: string;
} {
  return account.accountId
    ? { accountId: account.accountId }
    : account.email
      ? { email: account.email }
      : {};
}

function toMatterRow(matter: vault_v1.Schema$Matter): MatterRow {
  return {
    ...(matter.matterId ? { matterId: matter.matterId } : {}),
    ...(matter.name ? { name: matter.name } : {}),
    ...(matter.description ? { description: matter.description } : {}),
    ...(matter.state ? { state: matter.state } : {}),
    ...(matter.matterRegion ? { matterRegion: matter.matterRegion } : {}),
    ...(matter.matterPermissions?.length
      ? {
          permissions: matter.matterPermissions
            .filter((permission) => permission.accountId || permission.role)
            .map((permission) => ({
              ...(permission.accountId ? { accountId: permission.accountId } : {}),
              ...(permission.role ? { role: permission.role } : {}),
            })),
        }
      : {}),
  };
}

function toHoldRow(hold: vault_v1.Schema$Hold): HoldRow {
  return {
    ...(hold.holdId ? { holdId: hold.holdId } : {}),
    ...(hold.name ? { name: hold.name } : {}),
    ...(hold.corpus ? { corpus: hold.corpus } : {}),
    ...(hold.updateTime ? { updateTime: hold.updateTime } : {}),
    ...(hold.accounts?.length
      ? {
          accounts: hold.accounts.map((account) => ({
            ...(account.accountId ? { accountId: account.accountId } : {}),
            ...(account.email ? { email: account.email } : {}),
            ...(account.firstName ? { firstName: account.firstName } : {}),
            ...(account.lastName ? { lastName: account.lastName } : {}),
            ...(account.holdTime ? { holdTime: account.holdTime } : {}),
          })),
        }
      : {}),
    ...(hold.orgUnit?.orgUnitId || hold.orgUnit?.holdTime
      ? {
          orgUnit: {
            ...(hold.orgUnit.orgUnitId ? { orgUnitId: hold.orgUnit.orgUnitId } : {}),
            ...(hold.orgUnit.holdTime ? { holdTime: hold.orgUnit.holdTime } : {}),
          },
        }
      : {}),
    ...(hold.query ? { query: hold.query as unknown as Record<string, unknown> } : {}),
  };
}

function toSavedQueryRow(query: vault_v1.Schema$SavedQuery): SavedQueryRow {
  return {
    ...(query.savedQueryId ? { savedQueryId: query.savedQueryId } : {}),
    ...(query.displayName ? { displayName: query.displayName } : {}),
    ...(query.createTime ? { createTime: query.createTime } : {}),
    ...(query.query ? { query: query.query as unknown as Record<string, unknown> } : {}),
  };
}

function toExportRow(item: vault_v1.Schema$Export): ExportRow {
  return {
    ...(item.id ? { id: item.id } : {}),
    ...(item.name ? { name: item.name } : {}),
    ...(item.matterId ? { matterId: item.matterId } : {}),
    ...(item.status ? { status: item.status } : {}),
    ...(item.createTime ? { createTime: item.createTime } : {}),
    ...(item.query ? { query: item.query as unknown as Record<string, unknown> } : {}),
    ...(item.exportOptions
      ? { exportOptions: item.exportOptions as unknown as Record<string, unknown> }
      : {}),
    ...(item.stats ? { stats: item.stats as unknown as Record<string, unknown> } : {}),
    ...(item.cloudStorageSink ? { cloudStorageSink: item.cloudStorageSink } : {}),
  };
}

function toOperationView(operation: vault_v1.Schema$Operation): OperationView {
  return {
    ...(operation.name ? { name: operation.name } : {}),
    ...(operation.done === undefined || operation.done === null ? {} : { done: operation.done }),
    ...(operation.metadata ? { metadata: operation.metadata } : {}),
    ...(operation.response ? { response: operation.response } : {}),
    ...(operation.error
      ? {
          error: {
            ...(operation.error.code === undefined || operation.error.code === null
              ? {}
              : { code: operation.error.code }),
            ...(operation.error.message ? { message: operation.error.message } : {}),
          },
        }
      : {}),
  };
}

function exportIdOf(operation: OperationView): string | undefined {
  for (const candidate of [operation.metadata, operation.response]) {
    if (candidate && typeof candidate === "object") {
      const id = (candidate as { id?: unknown }).id;
      if (typeof id === "string" && id.length > 0) return id;
    }
  }
  return undefined;
}

function progressDetail(source: unknown): string {
  if (!source || typeof source !== "object") return "No progress is reported yet.";
  // Callers pass either an operation's metadata (stats nested) or an export's
  // own stats object (counters at the top level).
  const stats =
    (source as { stats?: Record<string, unknown> }).stats ?? (source as Record<string, unknown>);
  const exported = stats.exportedArtifactCount;
  const total = stats.totalArtifactCount;
  if (exported === undefined && total === undefined) return "No progress is reported yet.";
  return `Progress: ${String(exported ?? "0")} of ${String(total ?? "unknown")} artifacts.`;
}
