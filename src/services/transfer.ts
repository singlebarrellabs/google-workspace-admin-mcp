import type { OAuth2Client } from "google-auth-library";
import { type admin_datatransfer_v1, google } from "googleapis";
import { mapGoogleError } from "../util/errors.js";

export interface TransferRow {
  id?: string;
  oldOwnerUserId?: string;
  newOwnerUserId?: string;
  overallTransferStatusCode?: string;
  requestTime?: string;
  applications?: Array<{
    applicationId?: string;
    status?: string;
    params?: Record<string, string[]>;
  }>;
}

export interface ListTransfersArgs {
  status?: string;
  oldOwnerUserId?: string;
  newOwnerUserId?: string;
  maxResults?: number;
  pageToken?: string;
}

export interface InsertTransferArgs {
  oldOwnerUserId: string;
  newOwnerUserId: string;
  applications: Array<{ applicationId: string; parameters?: Record<string, string[]> }>;
}

/**
 * Data Transfer for offboarding. A transfer moves data between two accounts
 * and the old owner loses access to what moved, so insert is confirm-gated.
 */
export class TransferService {
  private readonly client: admin_datatransfer_v1.Admin;

  constructor(auth: OAuth2Client) {
    this.client = google.admin({ version: "datatransfer_v1", auth });
  }

  async listTransfers(args: ListTransfersArgs): Promise<{
    items: TransferRow[];
    nextPageToken?: string;
  }> {
    try {
      const response = await this.client.transfers.list({
        customerId: "my_customer",
        maxResults: args.maxResults ?? 100,
        ...(args.status ? { status: args.status } : {}),
        ...(args.oldOwnerUserId ? { oldOwnerUserId: args.oldOwnerUserId } : {}),
        ...(args.newOwnerUserId ? { newOwnerUserId: args.newOwnerUserId } : {}),
        ...(args.pageToken ? { pageToken: args.pageToken } : {}),
      });
      return {
        items: (response.data.dataTransfers ?? []).map(toTransferRow),
        ...(response.data.nextPageToken ? { nextPageToken: response.data.nextPageToken } : {}),
      };
    } catch (error) {
      throw mapGoogleError(error, "transfer");
    }
  }

  async getTransfer(dataTransferId: string): Promise<TransferRow> {
    try {
      const response = await this.client.transfers.get({ dataTransferId });
      return toTransferRow(response.data);
    } catch (error) {
      throw mapGoogleError(error, "transfer");
    }
  }

  async insertTransfer(args: InsertTransferArgs): Promise<TransferRow> {
    try {
      const response = await this.client.transfers.insert({
        requestBody: {
          oldOwnerUserId: args.oldOwnerUserId,
          newOwnerUserId: args.newOwnerUserId,
          applicationDataTransfers: args.applications.map((application) => ({
            applicationId: application.applicationId,
            ...(application.parameters
              ? {
                  applicationTransferParams: Object.entries(application.parameters).map(
                    ([key, value]) => ({ key, value }),
                  ),
                }
              : {}),
          })),
        },
      });
      return toTransferRow(response.data);
    } catch (error) {
      throw mapGoogleError(error, "transfer");
    }
  }
}

function toTransferRow(transfer: admin_datatransfer_v1.Schema$DataTransfer): TransferRow {
  return {
    ...(transfer.id ? { id: transfer.id } : {}),
    ...(transfer.oldOwnerUserId ? { oldOwnerUserId: transfer.oldOwnerUserId } : {}),
    ...(transfer.newOwnerUserId ? { newOwnerUserId: transfer.newOwnerUserId } : {}),
    ...(transfer.overallTransferStatusCode
      ? { overallTransferStatusCode: transfer.overallTransferStatusCode }
      : {}),
    ...(transfer.requestTime ? { requestTime: transfer.requestTime } : {}),
    ...(transfer.applicationDataTransfers?.length
      ? {
          applications: transfer.applicationDataTransfers.map((application) => ({
            ...(application.applicationId ? { applicationId: application.applicationId } : {}),
            ...(application.applicationTransferStatus
              ? { status: application.applicationTransferStatus }
              : {}),
            ...(application.applicationTransferParams?.length
              ? {
                  params: paramsToRecord(application.applicationTransferParams),
                }
              : {}),
          })),
        }
      : {}),
  };
}

function paramsToRecord(
  params: Array<{ key?: string | null; value?: string[] | null }>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const parameter of params) {
    if (!parameter.key) continue;
    out[parameter.key] = parameter.value ?? [];
  }
  return out;
}
