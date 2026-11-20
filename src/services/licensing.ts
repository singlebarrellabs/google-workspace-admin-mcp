import type { OAuth2Client } from "google-auth-library";
import { google, type licensing_v1 } from "googleapis";
import { mapGoogleError, ToolError } from "../util/errors.js";

export interface LicenseRow {
  userId: string;
  productId?: string;
  skuId?: string;
  productName?: string;
  skuName?: string;
}

export interface ListAssignmentsArgs {
  productId: string;
  skuId?: string;
  maxResults?: number;
  pageToken?: string;
}

export interface AssignmentKey {
  productId: string;
  skuId: string;
  userId: string;
}

export interface AssignResult {
  assignment: LicenseRow;
  alreadyAssigned: boolean;
}

/**
 * Enterprise License Manager. Assigning consumes a paid seat and revoking ends
 * the user's access, so both are confirmation-gated at the tool layer.
 */
export class LicensingService {
  private readonly client: licensing_v1.Licensing;

  constructor(auth: OAuth2Client) {
    this.client = google.licensing({ version: "v1", auth });
  }

  async listAssignments(
    args: ListAssignmentsArgs,
  ): Promise<{ items: LicenseRow[]; nextPageToken?: string }> {
    try {
      const response = args.skuId
        ? await this.client.licenseAssignments.listForProductAndSku({
            productId: args.productId,
            skuId: args.skuId,
            customerId: "my_customer",
            maxResults: args.maxResults ?? 100,
            ...(args.pageToken ? { pageToken: args.pageToken } : {}),
          })
        : await this.client.licenseAssignments.listForProduct({
            productId: args.productId,
            customerId: "my_customer",
            maxResults: args.maxResults ?? 100,
            ...(args.pageToken ? { pageToken: args.pageToken } : {}),
          });

      return {
        items: (response.data.items ?? []).map(toLicenseRow),
        ...(response.data.nextPageToken ? { nextPageToken: response.data.nextPageToken } : {}),
      };
    } catch (error) {
      throw mapGoogleError(error, "licensing");
    }
  }

  async getAssignment(args: AssignmentKey): Promise<LicenseRow> {
    try {
      const response = await this.client.licenseAssignments.get(args);
      return toLicenseRow(response.data);
    } catch (error) {
      throw mapGoogleError(error, "licensing");
    }
  }

  async assign(args: AssignmentKey): Promise<AssignResult> {
    try {
      const response = await this.client.licenseAssignments.insert({
        productId: args.productId,
        skuId: args.skuId,
        requestBody: { userId: args.userId },
      });
      return { assignment: toLicenseRow(response.data), alreadyAssigned: false };
    } catch (error) {
      if (statusOf(error) === 409) {
        // The license is already held: report the existing assignment instead
        // of failing, which is what a caller retrying an assign expects.
        const assignment = await this.getAssignment(args);
        return { assignment, alreadyAssigned: true };
      }
      if (statusOf(error) === 412) {
        throw new ToolError(
          "invalid_request",
          `No license seats are available for ${args.productId}/${args.skuId}.`,
          "Free a seat with the revoke tool, or buy more before assigning.",
        );
      }
      throw mapGoogleError(error, "licensing");
    }
  }

  async revoke(args: AssignmentKey): Promise<LicenseRow> {
    try {
      const response = await this.client.licenseAssignments.delete(args);
      return toLicenseRow(response.data);
    } catch (error) {
      throw mapGoogleError(error, "licensing");
    }
  }
}

function statusOf(error: unknown): number | undefined {
  const response = (error as { response?: { status?: number } }).response;
  return response?.status ?? (error as { code?: number }).code;
}

function toLicenseRow(assignment: licensing_v1.Schema$LicenseAssignment): LicenseRow {
  return {
    userId: assignment.userId ?? "",
    ...(assignment.productId ? { productId: assignment.productId } : {}),
    ...(assignment.skuId ? { skuId: assignment.skuId } : {}),
    ...(assignment.productName ? { productName: assignment.productName } : {}),
    ...(assignment.skuName ? { skuName: assignment.skuName } : {}),
  };
}
