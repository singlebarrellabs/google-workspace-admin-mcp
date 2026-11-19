import type { AppConfig } from "../auth/config.js";
import type { StoredToken } from "../auth/token-store.js";
import type { ToolSpec } from "../catalog.js";

export interface AuthStatusDeps {
  config: AppConfig;
  token: StoredToken | undefined;
}

/**
 * Reports what is actually configured and reachable. Edition capability is not
 * probed yet, so it is reported as unknown rather than guessed.
 */
export function systemTools({ config, token }: AuthStatusDeps): ToolSpec[] {
  return [
    {
      name: "gws_auth_status",
      surface: "system",
      access: "read",
      edition: "all",
      description:
        "Report the credential state: whether a client and token are configured, token expiry, granted scopes, write mode, and passthrough availability.",
      inputShape: {},
      run: async () => {
        const expiry = token?.expiry_date ? new Date(token.expiry_date) : undefined;
        const expired = expiry ? expiry.getTime() < Date.now() : undefined;

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
            editionCapability: "unknown: not probed",
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
