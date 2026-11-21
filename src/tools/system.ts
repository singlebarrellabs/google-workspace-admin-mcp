import type { AppConfig } from "../auth/config.js";
import type { EditionProbe, EditionReport } from "../auth/edition.js";
import type { StoredToken } from "../auth/token-store.js";
import type { ToolSpec } from "../catalog.js";

export interface AuthStatusDeps {
  config: AppConfig;
  token: StoredToken | undefined;
  edition?: EditionProbe;
}

/**
 * Reports what is actually configured and reachable. Edition capability comes
 * from one cached Vault probe; without a token there is nothing to probe, so it
 * stays unknown rather than guessed.
 */
export function systemTools({ config, token, edition }: AuthStatusDeps): ToolSpec[] {
  return [
    {
      name: "gws_auth_status",
      surface: "system",
      access: "read",
      edition: "all",
      description:
        "Report the credential state: whether a client and token are configured, token expiry, granted scopes, write mode, and which edition is reachable. The edition answer comes from one cached Vault call and is labelled with its source.",
      inputShape: {},
      run: async () => {
        const expiry = token?.expiry_date ? new Date(token.expiry_date) : undefined;
        const expired = expiry ? expiry.getTime() < Date.now() : undefined;
        const editionReport = await readEdition(edition);

        return {
          summary: token
            ? `Authorized, token ${expired ? "expired" : "valid"}${expiry ? ` until ${expiry.toISOString()}` : ""}`
            : "No token stored. Run the auth command.",
          data: {
            credentialConfigured: Boolean(config.clientId && config.clientSecret),
            tokenStored: Boolean(token),
            refreshTokenPresent: Boolean(token?.refresh_token),
            tokenExpiry: expiry?.toISOString(),
            tokenExpired: expired,
            mode: config.mode,
            passthrough: config.passthrough,
            scopes: config.scopes,
            editionCapability: editionReport,
            tokenPath: config.tokenPath,
            auditPath: config.auditPath,
          },
        };
      },
    },
    {
      name: "gws_scopes_list",
      surface: "system",
      access: "read",
      edition: "all",
      description:
        "List the OAuth scopes this server requests. Every scope is admin-scoped; none grants access to another user's mail or files.",
      inputShape: {},
      run: async () => ({
        summary: `${config.scopes.length} admin scopes requested`,
        data: { scopes: config.scopes },
      }),
    },
  ];
}

/** A probe that cannot answer is reported as unknown, never as a failure of the status tool. */
async function readEdition(probe: EditionProbe | undefined): Promise<EditionReport> {
  if (!probe) {
    return {
      source: "none",
      state: "unknown",
      detail: "No token is stored, so no probe was attempted.",
    };
  }
  try {
    return await probe.report();
  } catch (error) {
    return {
      source: "vault.matters.list",
      state: "unknown",
      detail: `The probe failed: ${(error as Error).message}`,
    };
  }
}
