import type { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { mapGoogleError } from "../util/errors.js";

export type EditionState = "enterprise" | "not_enterprise" | "unknown";

export interface EditionReport {
  /** Which call produced the answer, so the answer can be judged. */
  source: string;
  state: EditionState;
  detail: string;
}

/**
 * Infers whether the tenant has an Enterprise-class edition by asking Vault for
 * the smallest possible page. Vault is the cheapest surface that only those
 * editions can reach.
 *
 * The inference is deliberately conservative: an API that is not enabled, or an
 * admin without the Vault privilege, proves nothing about the edition, so both
 * report "unknown" instead of being read as an entitlement failure.
 */
export class EditionProbe {
  private cached?: Promise<EditionReport>;

  constructor(private readonly auth: OAuth2Client) {}

  /** Probes once per process and reuses the answer for every later caller. */
  report(): Promise<EditionReport> {
    this.cached ??= this.probe();
    return this.cached;
  }

  private async probe(): Promise<EditionReport> {
    const source = "vault.matters.list";
    try {
      await google.vault({ version: "v1", auth: this.auth }).matters.list({ pageSize: 1 });
      return {
        source,
        state: "enterprise",
        detail: "Vault answered, so this tenant has an Enterprise-class edition.",
      };
    } catch (error) {
      const reason = firstReason(error);
      if (reason === "accessNotConfigured") {
        return {
          source,
          state: "unknown",
          detail:
            "The Vault API is not enabled in this Cloud project, so the edition cannot be inferred.",
        };
      }

      const mapped = mapGoogleError(error, "vault");
      if (mapped.category === "edition_unavailable") {
        return { source, state: "not_enterprise", detail: mapped.message };
      }
      if (mapped.category === "permission_denied") {
        return {
          source,
          state: "unknown",
          detail:
            "Vault is enabled but this admin has no Vault privilege, so the edition cannot be inferred.",
        };
      }
      return { source, state: "unknown", detail: mapped.message };
    }
  }
}

function firstReason(error: unknown): string | undefined {
  const body = (error as { response?: { data?: { error?: unknown } } }).response?.data?.error;
  if (!body || typeof body === "string") return undefined;
  const errors = (body as { errors?: Array<{ reason?: string }> }).errors ?? [];
  return errors.map((entry) => entry.reason).find(Boolean);
}
