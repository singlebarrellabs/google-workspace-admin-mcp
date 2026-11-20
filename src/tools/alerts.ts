import { z } from "zod";
import type { ConfirmedToolSpec, ToolSpec } from "../catalog.js";
import { type AlertsService, FEEDBACK_TYPES } from "../services/alerts.js";

const listShape = {
  filter: z
    .string()
    .optional()
    .describe(
      'Alert filter, for example "create_time >= \\"2026-11-01T00:00:00Z\\"" or type filters',
    ),
  orderBy: z
    .string()
    .optional()
    .describe('Sort order: "create_time desc", "create_time asc" or "update_time desc"'),
  pageSize: z.number().int().min(1).max(1000).optional().describe("Page size, default 50"),
  pageToken: z.string().optional().describe("Token from a previous call"),
};

const alertShape = {
  alertId: z.string().min(1).describe("Alert id from a list call"),
};

const feedbackShape = {
  alertId: z.string().min(1).describe("Alert id"),
  type: z.enum(FEEDBACK_TYPES).describe("Usefulness of the alert to you"),
};

const deleteShape = {
  alertId: z.string().min(1).describe("Alert id"),
  confirm: z
    .boolean()
    .optional()
    .describe("Must be true. The alert leaves Alert Center and is purged after 30 days"),
};

const undeleteShape = {
  alertId: z.string().min(1).describe("Alert id"),
  confirm: z.boolean().optional().describe("Must be true. The alert reappears for every admin"),
};

export function alertsTools(service: AlertsService): Array<ToolSpec | ConfirmedToolSpec> {
  return [
    {
      name: "gws_alerts_list",
      surface: "alerts",
      access: "read",
      edition: "all",
      description:
        "List Alert Center alerts, newest first by default, with an optional filter and page token. These are Google's own signals: phishing, suspicious sign-in, device compromise, DLP.",
      inputShape: listShape,
      run: async (input) => {
        const args = z.object(listShape).parse(input);
        const result = await service.listAlerts(args);
        return {
          summary: `${result.items.length} alert${result.items.length === 1 ? "" : "s"}${
            result.nextPageToken ? ", more available" : ""
          }`,
          data: result,
        };
      },
    },
    {
      name: "gws_alerts_get",
      surface: "alerts",
      access: "read",
      edition: "all",
      description:
        "Get one alert in full, including its type-specific data, severity, status, assignee and the Security Investigation Tool link when present.",
      inputShape: alertShape,
      run: async (input) => {
        const args = z.object(alertShape).parse(input);
        const alert = await service.getAlert(args.alertId);
        return {
          summary: `${alert.type ?? "alert"}${alert.metadata?.severity ? ` (${alert.metadata.severity})` : ""}`,
          data: alert,
        };
      },
    },
    {
      name: "gws_alerts_feedback_create",
      surface: "alerts",
      access: "write",
      edition: "all",
      description:
        "Record whether an alert was useful (NOT_USEFUL, SOMEWHAT_USEFUL, VERY_USEFUL). Google uses this feedback to tune what it raises for this tenant.",
      inputShape: feedbackShape,
      run: async (input) => {
        const args = z.object(feedbackShape).parse(input);
        const feedback = await service.createFeedback(args.alertId, args.type);
        return {
          summary: `Recorded ${feedback.type} feedback for alert ${args.alertId}`,
          data: feedback,
        };
      },
    },
    {
      name: "gws_alerts_delete",
      surface: "alerts",
      access: "destructive",
      edition: "all",
      description:
        "Mark an alert for deletion. It leaves Alert Center immediately and is purged after 30 days; until then it can be restored with undelete.",
      confirmNote:
        "the alert disappears from Alert Center for every admin now and is permanently purged after 30 days",
      inputShape: deleteShape,
      run: async (input) => {
        const args = z.object(deleteShape).parse(input);
        const result = await service.deleteAlert(args.alertId);
        return {
          summary: `Alert ${args.alertId} marked for deletion; purged in 30 days unless undeleted`,
          data: result,
        };
      },
    },
    {
      name: "gws_alerts_undelete",
      surface: "alerts",
      access: "destructive",
      edition: "all",
      description:
        "Restore an alert that was marked for deletion, as long as the 30-day purge window has not passed. This makes the alert visible to every admin again.",
      confirmNote: "the alert reappears in Alert Center for every admin",
      inputShape: undeleteShape,
      run: async (input) => {
        const args = z.object(undeleteShape).parse(input);
        const result = await service.undeleteAlert(args.alertId);
        return { summary: `Alert ${args.alertId} restored`, data: result };
      },
    },
  ];
}
