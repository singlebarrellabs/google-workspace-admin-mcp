import { z } from "zod";
import type { ToolSpec } from "../catalog.js";
import type { ReportsService } from "../services/reports.js";

const activitiesShape = {
  applicationName: z
    .string()
    .min(1)
    .describe('Application that owns the events, for example "login", "admin", "token", "drive"'),
  userKey: z.string().optional().describe('User email or profile id; default is "all"'),
  startTime: z.string().optional().describe("RFC 3339 start, for example 2026-11-01T00:00:00Z"),
  endTime: z.string().optional().describe("RFC 3339 end; defaults to now"),
  eventName: z.string().optional().describe('Event to filter on, for example "login_success"'),
  actorIpAddress: z.string().optional().describe("Only events from this IPv4 or IPv6 address"),
  filters: z
    .string()
    .optional()
    .describe(
      'Event-parameter filters, for example "doc_id==12345". Operators are ==, <>, <, <=, >, >=',
    ),
  orgUnitID: z.string().optional().describe("Org unit id to restrict the report to"),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe("Activities per page, default 100"),
  pageToken: z.string().optional().describe("Token from a previous call"),
};

const usageCommon = {
  date: z.string().describe("Report date, yyyy-mm-dd. Usage data lags by about a day"),
  parameters: z
    .array(z.string())
    .optional()
    .describe('Parameters as "app:name", for example "gmail:num_emails_sent"'),
  pageToken: z.string().optional().describe("Token from a previous call"),
};

const userUsageShape = {
  ...usageCommon,
  userKey: z.string().min(1).describe('User email, profile id, or "all"'),
  filters: z
    .string()
    .optional()
    .describe('Parameter filters, for example "gmail:num_emails_sent>0"'),
  orgUnitID: z.string().optional().describe("Org unit id"),
  groupId: z.string().optional().describe("Group id to restrict the report to"),
  maxResults: z.number().int().min(1).max(1000).optional().describe("Rows per page, default 100"),
};

const entityUsageShape = {
  ...usageCommon,
  entityType: z.string().min(1).describe('Entity type, for example "gplus"'),
  entityKey: z.string().min(1).describe('Entity key: "all", or the entity id'),
};

export function reportsTools(service: ReportsService): ToolSpec[] {
  return [
    {
      name: "gws_activities_list",
      surface: "reports",
      access: "read",
      edition: "all",
      description:
        "List audit activities for one application as flat event rows (time, actor, event name, status, IP, flattened parameters). Omitting the time range applies the last 7 days and says so. One call returns at most 500 rows; use pageToken for more.",
      inputShape: activitiesShape,
      run: async (input) => {
        const args = z.object(activitiesShape).parse(input);
        const result = await service.listActivities(args);
        const range = result.appliedTimeRange.defaulted ? " (default 7-day range applied)" : "";
        return {
          summary: `${result.items.length} event row${result.items.length === 1 ? "" : "s"}${range}${
            result.rowsTruncated ? ", row cap reached" : ""
          }${result.nextPageToken ? ", more available" : ""}`,
          data: result,
        };
      },
    },
    {
      name: "gws_usage_customer_get",
      surface: "reports",
      access: "read",
      edition: "all",
      description:
        "Get the customer usage report for one date. Parameters are opt-in; the result lists the names observed in the response and links the reference for the full set. An empty report is reported as empty, not as an error.",
      inputShape: usageCommon,
      run: async (input) => {
        const args = z.object(usageCommon).parse(input);
        const result = await service.customerUsage(args);
        return { summary: usageSummary("customer", args.date, result), data: result };
      },
    },
    {
      name: "gws_usage_user_get",
      surface: "reports",
      access: "read",
      edition: "all",
      description:
        "Get the user usage report for one user on one date, with optional parameter filters and org unit or group scoping. An empty report is reported as empty, not as an error.",
      inputShape: userUsageShape,
      run: async (input) => {
        const args = z.object(userUsageShape).parse(input);
        const result = await service.userUsage(args);
        return { summary: usageSummary(`user ${args.userKey}`, args.date, result), data: result };
      },
    },
    {
      name: "gws_usage_entity_get",
      surface: "reports",
      access: "read",
      edition: "all",
      description:
        "Get the entity usage report for one entity type and key on one date. Entity reports cover shared-drive and similar usage; most tenants only need the customer and user reports.",
      inputShape: entityUsageShape,
      run: async (input) => {
        const args = z.object(entityUsageShape).parse(input);
        const result = await service.entityUsage(args);
        return {
          summary: usageSummary(`${args.entityType} ${args.entityKey}`, args.date, result),
          data: result,
        };
      },
    },
  ];
}

function usageSummary(
  subject: string,
  date: string,
  result: { empty: boolean; items: unknown[]; warnings: unknown[] },
): string {
  if (result.empty) return `No usage data for ${subject} on ${date}`;
  const rows = `${result.items.length} row${result.items.length === 1 ? "" : "s"}`;
  const warnings = result.warnings.length > 0 ? `, ${result.warnings.length} warning(s)` : "";
  return `${rows} for ${subject} on ${date}${warnings}`;
}
