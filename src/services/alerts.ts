import type { OAuth2Client } from "google-auth-library";
import { type alertcenter_v1beta1, google } from "googleapis";
import { mapGoogleError } from "../util/errors.js";

export const FEEDBACK_TYPES = ["NOT_USEFUL", "SOMEWHAT_USEFUL", "VERY_USEFUL"] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export interface AlertRow {
  alertId: string;
  type?: string;
  source?: string;
  createTime?: string;
  startTime?: string;
  endTime?: string;
  updateTime?: string;
  deleted?: boolean;
  securityInvestigationToolLink?: string;
  metadata?: {
    assignee?: string;
    severity?: string;
    status?: string;
    updateTime?: string;
  };
  data?: Record<string, unknown>;
}

export interface ListAlertsArgs {
  filter?: string;
  orderBy?: string;
  pageSize?: number;
  pageToken?: string;
}

export interface ListAlertsResult {
  items: AlertRow[];
  nextPageToken?: string;
}

export interface FeedbackResult {
  alertId: string;
  feedbackId?: string;
  type: string;
  createTime?: string;
}

/**
 * Alert Center coverage. Google generates these alerts itself, so this is the
 * cheapest investigation input: no detection rules and no extra setup.
 */
export class AlertsService {
  private readonly client: alertcenter_v1beta1.Alertcenter;

  constructor(auth: OAuth2Client) {
    this.client = google.alertcenter({ version: "v1beta1", auth });
  }

  async listAlerts(args: ListAlertsArgs): Promise<ListAlertsResult> {
    try {
      const response = await this.client.alerts.list({
        pageSize: args.pageSize ?? 50,
        ...(args.filter ? { filter: args.filter } : {}),
        ...(args.orderBy ? { orderBy: args.orderBy } : {}),
        ...(args.pageToken ? { pageToken: args.pageToken } : {}),
      });

      return {
        items: (response.data.alerts ?? []).map(toAlertRow),
        ...(response.data.nextPageToken ? { nextPageToken: response.data.nextPageToken } : {}),
      };
    } catch (error) {
      throw mapGoogleError(error, "alerts");
    }
  }

  async getAlert(alertId: string): Promise<AlertRow> {
    try {
      const response = await this.client.alerts.get({ alertId });
      return toAlertRow(response.data);
    } catch (error) {
      throw mapGoogleError(error, "alerts");
    }
  }

  async createFeedback(alertId: string, type: FeedbackType): Promise<FeedbackResult> {
    try {
      const response = await this.client.alerts.feedback.create({
        alertId,
        requestBody: { type },
      });
      const feedback = response.data;
      return {
        alertId,
        type: feedback.type ?? type,
        ...(feedback.feedbackId ? { feedbackId: feedback.feedbackId } : {}),
        ...(feedback.createTime ? { createTime: feedback.createTime } : {}),
      };
    } catch (error) {
      throw mapGoogleError(error, "alerts");
    }
  }

  /**
   * Marks an alert for deletion. It leaves Alert Center now and is purged after
   * 30 days, which is the window undelete works in.
   */
  async deleteAlert(alertId: string): Promise<{ alertId: string; markedForDeletion: true }> {
    try {
      await this.client.alerts.delete({ alertId });
      return { alertId, markedForDeletion: true };
    } catch (error) {
      throw mapGoogleError(error, "alerts");
    }
  }

  async undeleteAlert(alertId: string): Promise<{ alertId: string; restored: true }> {
    try {
      await this.client.alerts.undelete({ alertId, requestBody: {} });
      return { alertId, restored: true };
    } catch (error) {
      throw mapGoogleError(error, "alerts");
    }
  }
}

/** Sparse alerts stay sparse: absent fields are omitted, never rendered as null. */
function toAlertRow(alert: alertcenter_v1beta1.Schema$Alert): AlertRow {
  const metadata = alert.metadata;
  return {
    alertId: alert.alertId ?? "",
    ...(alert.type ? { type: alert.type } : {}),
    ...(alert.source ? { source: alert.source } : {}),
    ...(alert.createTime ? { createTime: alert.createTime } : {}),
    ...(alert.startTime ? { startTime: alert.startTime } : {}),
    ...(alert.endTime ? { endTime: alert.endTime } : {}),
    ...(alert.updateTime ? { updateTime: alert.updateTime } : {}),
    ...(alert.deleted === undefined || alert.deleted === null ? {} : { deleted: alert.deleted }),
    ...(alert.securityInvestigationToolLink
      ? { securityInvestigationToolLink: alert.securityInvestigationToolLink }
      : {}),
    ...(metadata
      ? {
          metadata: {
            ...(metadata.assignee ? { assignee: metadata.assignee } : {}),
            ...(metadata.severity ? { severity: metadata.severity } : {}),
            ...(metadata.status ? { status: metadata.status } : {}),
            ...(metadata.updateTime ? { updateTime: metadata.updateTime } : {}),
          },
        }
      : {}),
    ...(alert.data ? { data: alert.data } : {}),
  };
}
