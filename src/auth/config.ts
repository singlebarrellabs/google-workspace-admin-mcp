import { homedir } from "node:os";
import { join } from "node:path";
// Note: the scope set is admin-only by construction. A user-content scope here
// would break the project's central guarantee, and the test suite asserts it.

export const ADMIN_SCOPES = [
  "https://www.googleapis.com/auth/admin.directory.user",
  "https://www.googleapis.com/auth/admin.directory.user.security",
  "https://www.googleapis.com/auth/admin.directory.group",
  "https://www.googleapis.com/auth/admin.directory.group.member",
  "https://www.googleapis.com/auth/admin.directory.orgunit",
  "https://www.googleapis.com/auth/admin.directory.device.mobile",
  "https://www.googleapis.com/auth/admin.directory.rolemanagement",
  "https://www.googleapis.com/auth/admin.directory.domain",
  "https://www.googleapis.com/auth/admin.directory.customer.readonly",
  "https://www.googleapis.com/auth/admin.directory.resource.calendar",
  "https://www.googleapis.com/auth/admin.reports.audit.readonly",
  "https://www.googleapis.com/auth/admin.reports.usage.readonly",
  "https://www.googleapis.com/auth/admin.datatransfer",
  // Alert Center is not a surface: Google requires a service account with
  // domain-wide delegation, so apps.alerts can never be granted to this server.
  "https://www.googleapis.com/auth/apps.licensing",
  "https://www.googleapis.com/auth/ediscovery",
  "https://www.googleapis.com/auth/cloud_search.query",
  "https://www.googleapis.com/auth/apps.groups.settings",
] as const;

const USER_CONTENT =
  /(^|\/)(gmail|drive|documents|spreadsheets|presentations|calendar|chat|meet|keep|tasks|forms|youtube|classroom)(\.|\/|$)/i;

export interface AppConfig {
  mode: "readonly" | "write";
  passthrough: boolean;
  clientId?: string;
  clientSecret?: string;
  tokenPath: string;
  auditPath: string;
  scopes: string[];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const stateDir =
    env.GWS_STATE_DIR ?? join(homedir(), ".local", "state", "google-workspace-admin-mcp");
  const mode = env.GWS_MODE === "write" ? "write" : "readonly";

  return {
    mode,
    passthrough: env.GWS_PASSTHROUGH === "on",
    clientId: env.GWS_CLIENT_ID,
    clientSecret: env.GWS_CLIENT_SECRET,
    tokenPath: env.GWS_TOKEN_PATH ?? join(stateDir, "token.json"),
    auditPath: env.GWS_AUDIT_LOG ?? join(stateDir, "audit.jsonl"),
    scopes: [...ADMIN_SCOPES],
  };
}

/** Fails if a user-content scope ever enters the requested set. */
export function assertAdminOnlyScopes(scopes: string[]): void {
  const offending = scopes.filter((scope) => USER_CONTENT.test(scope));
  if (offending.length > 0) {
    throw new Error(`User-content scopes are a permanent non-goal, found: ${offending.join(", ")}`);
  }
}
