import type { OAuth2Client } from "google-auth-library";
import { type admin_reports_v1, google } from "googleapis";
import { mapGoogleError, ToolError } from "../util/errors.js";

const DAY_MS = 86_400_000;

/** Default window when a caller supplies no time range at all. */
const DEFAULT_WINDOW_DAYS = 7;

/** A page of activities can expand into many rows; cap what one call returns. */
const MAX_ROWS = 500;

const PARAMETER_REFERENCE = {
  customer:
    "https://developers.google.com/workspace/admin/reports/v1/reference/usage-ref-appendix-a/customers",
  user: "https://developers.google.com/workspace/admin/reports/v1/reference/usage-ref-appendix-a/users",
  entity:
    "https://developers.google.com/workspace/admin/reports/v1/reference/usage-ref-appendix-a/entities",
} as const;

export interface ActivityRow {
  time?: string;
  applicationName: string;
  eventName: string;
  actor?: string;
  actorKey?: string;
  ipAddress?: string;
  eventStatus?: string;
  errorCode?: string;
  parameters: Record<string, string>;
}

/**
 * The applications the Reports API accepts as a path value. It is a closed
 * enum; an unknown name is a 400 from the API, so it is rejected here first.
 */
export const ACTIVITY_APPLICATIONS = [
  "access_transparency",
  "admin",
  "calendar",
  "chat",
  "drive",
  "gcp",
  "gmail",
  "gplus",
  "groups",
  "groups_enterprise",
  "jamboard",
  "login",
  "meet",
  "mobile",
  "rules",
  "saml",
  "token",
  "user_accounts",
  "context_aware_access",
  "chrome",
  "data_studio",
  "keep",
  "vault",
  "gemini_in_workspace_apps",
  "classroom",
  "assignments",
  "cloud_search",
  "tasks",
  "data_migration",
  "meet_hardware",
  "directory_sync",
  "ldap",
  "profile",
  "access_evaluation",
  "admin_data_action",
  "contacts",
  "takeout",
  "graduation",
  "voice",
  "chrome_sync",
  "workspace_studio",
  "gemini_notebook",
] as const;

export type ActivityApplication = (typeof ACTIVITY_APPLICATIONS)[number];

export interface ListActivitiesArgs {
  applicationName: string;
  userKey?: string;
  startTime?: string;
  endTime?: string;
  eventName?: string;
  actorIpAddress?: string;
  filters?: string;
  orgUnitID?: string;
  maxResults?: number;
  pageToken?: string;
}

export interface ListActivitiesResult {
  items: ActivityRow[];
  nextPageToken?: string;
  appliedTimeRange: { startTime: string; endTime: string; defaulted: boolean };
  rowsTruncated?: boolean;
}

export interface UsageRow {
  date?: string;
  entityType?: string;
  entityId?: string;
  entityEmail?: string;
  parameters: Record<string, unknown>;
}

export interface UsageReportResult {
  items: UsageRow[];
  nextPageToken?: string;
  empty: boolean;
  parametersRequested: string[];
  parametersObserved: string[];
  parameterReference: string;
  warnings: Array<{ code?: string; message?: string }>;
}

export interface UsageArgs {
  date: string;
  parameters?: string[];
  pageToken?: string;
}

export interface UserUsageArgs extends UsageArgs {
  userKey: string;
  filters?: string;
  maxResults?: number;
  orgUnitID?: string;
  groupIdFilter?: string;
}

export interface EntityUsageArgs extends UsageArgs {
  entityType: "gplus_communities";
  entityKey: string;
}

/**
 * Reports API coverage. Every call is read-only; this surface registers no
 * mutating tool in any mode.
 */
export class ReportsService {
  private readonly client: admin_reports_v1.Admin;

  constructor(auth: OAuth2Client) {
    this.client = google.admin({ version: "reports_v1", auth });
  }

  async listActivities(args: ListActivitiesArgs): Promise<ListActivitiesResult> {
    const range = resolveTimeRange(args);
    guardGmailRange(args.applicationName, range);

    try {
      const response = await this.client.activities.list({
        customerId: "my_customer",
        applicationName: args.applicationName,
        userKey: args.userKey ?? "all",
        startTime: range.startTime,
        endTime: range.endTime,
        maxResults: args.maxResults ?? 100,
        ...(args.eventName ? { eventName: args.eventName } : {}),
        ...(args.actorIpAddress ? { actorIpAddress: args.actorIpAddress } : {}),
        ...(args.filters ? { filters: args.filters } : {}),
        ...(args.orgUnitID ? { orgUnitID: args.orgUnitID } : {}),
        ...(args.pageToken ? { pageToken: args.pageToken } : {}),
      });

      const activities = response.data.items ?? [];
      const rows = activities.flatMap(flattenActivity);
      const truncated = rows.length > MAX_ROWS;

      return {
        items: truncated ? rows.slice(0, MAX_ROWS) : rows,
        ...(truncated ? { rowsTruncated: true } : {}),
        ...(response.data.nextPageToken ? { nextPageToken: response.data.nextPageToken } : {}),
        appliedTimeRange: range,
      };
    } catch (error) {
      throw mapGoogleError(error, "reports");
    }
  }

  async customerUsage(args: UsageArgs): Promise<UsageReportResult> {
    return this.usage("customer", PARAMETER_REFERENCE.customer, args.parameters ?? [], () =>
      this.client.customerUsageReports.get({
        customerId: "my_customer",
        date: args.date,
        ...(args.parameters?.length ? { parameters: args.parameters.join(",") } : {}),
        ...(args.pageToken ? { pageToken: args.pageToken } : {}),
      }),
    );
  }

  async userUsage(args: UserUsageArgs): Promise<UsageReportResult> {
    return this.usage("user", PARAMETER_REFERENCE.user, args.parameters ?? [], () =>
      this.client.userUsageReport.get({
        customerId: "my_customer",
        userKey: args.userKey,
        date: args.date,
        maxResults: args.maxResults ?? 100,
        ...(args.parameters?.length ? { parameters: args.parameters.join(",") } : {}),
        ...(args.filters ? { filters: args.filters } : {}),
        ...(args.orgUnitID ? { orgUnitID: args.orgUnitID } : {}),
        ...(args.groupIdFilter ? { groupIdFilter: args.groupIdFilter } : {}),
        ...(args.pageToken ? { pageToken: args.pageToken } : {}),
      }),
    );
  }

  async entityUsage(args: EntityUsageArgs): Promise<UsageReportResult> {
    return this.usage("entity", PARAMETER_REFERENCE.entity, args.parameters ?? [], () =>
      this.client.entityUsageReports.get({
        customerId: "my_customer",
        entityType: args.entityType,
        entityKey: args.entityKey,
        date: args.date,
        ...(args.parameters?.length ? { parameters: args.parameters.join(",") } : {}),
        ...(args.pageToken ? { pageToken: args.pageToken } : {}),
      }),
    );
  }

  private async usage(
    kind: "customer" | "user" | "entity",
    reference: string,
    requested: string[],
    call: () => Promise<{ data: admin_reports_v1.Schema$UsageReports }>,
  ): Promise<UsageReportResult> {
    try {
      const response = await call();
      const reports = response.data.usageReports ?? [];
      const items = reports.map(toUsageRow);
      const observed = [...new Set(items.flatMap((row) => Object.keys(row.parameters)))].sort();

      return {
        items,
        empty: items.length === 0,
        parametersRequested: requested,
        parametersObserved: observed,
        parameterReference: reference,
        warnings: (response.data.warnings ?? []).map((warning) => ({
          ...(warning.code ? { code: warning.code } : {}),
          ...(warning.message ? { message: warning.message } : {}),
        })),
        ...(response.data.nextPageToken ? { nextPageToken: response.data.nextPageToken } : {}),
      };
    } catch (error) {
      throw mapGoogleError(error, kind === "entity" ? "reports" : `reports:${kind}`);
    }
  }
}

/**
 * A caller that omits both ends gets a short default window, and the result
 * says so: an unbounded query silently returning 180 days is a cost surprise.
 */
export function resolveTimeRange(args: Pick<ListActivitiesArgs, "startTime" | "endTime">): {
  startTime: string;
  endTime: string;
  defaulted: boolean;
} {
  const end = args.endTime ?? new Date().toISOString();
  const start =
    args.startTime ?? new Date(Date.parse(end) - DEFAULT_WINDOW_DAYS * DAY_MS).toISOString();
  return { startTime: start, endTime: end, defaulted: !args.startTime && !args.endTime };
}

/** Gmail activities reject a window wider than 30 days. */
function guardGmailRange(
  applicationName: string,
  range: { startTime: string; endTime: string },
): void {
  if (applicationName.toLowerCase() !== "gmail") return;
  const span = Date.parse(range.endTime) - Date.parse(range.startTime);
  if (Number.isNaN(span)) return;
  if (span > 30 * DAY_MS) {
    throw new ToolError(
      "invalid_request",
      "Gmail activities are limited to a 30-day window.",
      "Narrow startTime and endTime to at most 30 days apart, then retry.",
    );
  }
}

function flattenActivity(activity: admin_reports_v1.Schema$Activity): ActivityRow[] {
  const events = activity.events ?? [];
  const base = {
    ...(activity.id?.time ? { time: activity.id.time } : {}),
    applicationName: activity.id?.applicationName ?? "",
    ...(activity.actor?.email ? { actor: activity.actor.email } : {}),
    ...((activity.actor?.profileId ?? activity.actor?.key)
      ? { actorKey: activity.actor.profileId ?? activity.actor.key ?? "" }
      : {}),
    ...(activity.ipAddress ? { ipAddress: activity.ipAddress } : {}),
  };

  return events.map((event) => ({
    ...base,
    eventName: event.name ?? "",
    ...(event.status?.eventStatus ? { eventStatus: event.status.eventStatus } : {}),
    ...(event.status?.errorCode ? { errorCode: event.status.errorCode } : {}),
    parameters: flattenParameters(event.parameters ?? []),
  }));
}

/** Collapses the parameter array into a map of scalar values, dropping nested data. */
function flattenParameters(
  parameters: NonNullable<admin_reports_v1.Schema$Activity["events"]>[number]["parameters"],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const parameter of parameters ?? []) {
    if (!parameter.name) continue;
    const value =
      parameter.value ??
      scalarString(parameter.intValue) ??
      scalarString(parameter.boolValue) ??
      parameter.multiValue?.join(",");
    if (value !== undefined) out[parameter.name] = value;
  }
  return out;
}

function toUsageRow(report: admin_reports_v1.Schema$UsageReport): UsageRow {
  const parameters: Record<string, unknown> = {};
  for (const parameter of report.parameters ?? []) {
    if (!parameter.name) continue;
    const value =
      scalarString(parameter.intValue) ??
      (parameter.boolValue === null ? undefined : parameter.boolValue) ??
      parameter.stringValue ??
      parameter.datetimeValue ??
      parameter.msgValue?.map(stripEmpty);
    if (value !== undefined) parameters[parameter.name] = value;
  }

  const entityEmail = report.entity?.userEmail ?? report.entity?.profileId;

  return {
    ...(report.date ? { date: report.date } : {}),
    ...(report.entity?.type ? { entityType: report.entity.type } : {}),
    ...(report.entity?.entityId ? { entityId: report.entity.entityId } : {}),
    ...(entityEmail ? { entityEmail } : {}),
    parameters,
  };
}

function scalarString(value: string | number | boolean | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  return String(value);
}

function stripEmpty(entry: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(entry).filter(([, value]) => value !== undefined && value !== null),
  );
}
