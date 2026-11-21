import type { OAuth2Client } from "google-auth-library";
import { type admin_directory_v1, google } from "googleapis";
import { mapGoogleError } from "../util/errors.js";

export interface TokenRow {
  clientId?: string;
  displayText?: string;
  scopes?: string[];
  anonymous?: boolean;
  nativeApp?: boolean;
}

export interface VerificationCodeRow {
  userId?: string;
  verificationCode?: string;
}

/**
 * User security: third-party app grants, backup verification codes, and ending
 * sessions. These are the levers an admin reaches for when an account may be
 * compromised.
 */
export class UserSecurityService {
  private readonly client: admin_directory_v1.Admin;

  constructor(auth: OAuth2Client) {
    this.client = google.admin({ version: "directory_v1", auth });
  }

  async listTokens(userKey: string): Promise<TokenRow[]> {
    try {
      const response = await this.client.tokens.list({ userKey });
      return (response.data.items ?? []).map(toTokenRow);
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  /** Revokes one app's access. The user must consent again to restore it. */
  async deleteToken(userKey: string, clientId: string): Promise<void> {
    try {
      await this.client.tokens.delete({ userKey, clientId });
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  /**
   * Issues new backup codes, which replace any existing ones. The codes are
   * returned because the admin hands them over; they are a credential.
   */
  /**
   * `verificationCodes.generate` documents no response body, so the new codes
   * are read from `verificationCodes.list`, which does.
   */
  async generateVerificationCodes(userKey: string): Promise<VerificationCodeRow[]> {
    try {
      await this.client.verificationCodes.generate({ userKey });
      return await this.listVerificationCodes(userKey);
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  async listVerificationCodes(userKey: string): Promise<VerificationCodeRow[]> {
    try {
      const response = await this.client.verificationCodes.list({ userKey });
      return (response.data.items ?? []).map((code) => ({
        ...(code.userId ? { userId: code.userId } : {}),
        ...(code.verificationCode ? { verificationCode: code.verificationCode } : {}),
      }));
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  async invalidateVerificationCodes(userKey: string): Promise<void> {
    try {
      await this.client.verificationCodes.invalidate({ userKey });
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  async signOut(userKey: string): Promise<void> {
    try {
      await this.client.users.signOut({ userKey });
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }
}

function toTokenRow(token: admin_directory_v1.Schema$Token): TokenRow {
  return {
    ...(token.clientId ? { clientId: token.clientId } : {}),
    ...(token.displayText ? { displayText: token.displayText } : {}),
    ...(token.scopes?.length ? { scopes: token.scopes } : {}),
    ...(token.anonymous === undefined || token.anonymous === null
      ? {}
      : { anonymous: token.anonymous }),
    ...(token.nativeApp === undefined || token.nativeApp === null
      ? {}
      : { nativeApp: token.nativeApp }),
  };
}
