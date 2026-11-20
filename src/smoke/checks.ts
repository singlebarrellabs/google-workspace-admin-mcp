import type { Surface } from "../catalog.js";

export interface SmokeCheck {
  /** Stable id, also the name of the recorded shape file. */
  id: string;
  surface: Surface;
  tool: string;
  args: Record<string, unknown>;
  /** Environment variables that must be present before the check can run. */
  requires?: string[];
}

/**
 * One representative read per surface. Every entry is data: a surface that
 * lands later starts being smoked as soon as its tool is registered, and an
 * absent tool is reported as skipped rather than failing the run.
 */
export const SMOKE_CHECKS: SmokeCheck[] = [
  {
    id: "auth-status",
    surface: "system",
    tool: "gws_auth_status",
    args: {},
  },
  {
    id: "directory-users",
    surface: "directory",
    tool: "gws_users_list",
    args: { maxResults: 1 },
  },
  {
    id: "directory-domains",
    surface: "directory",
    tool: "gws_domains_list",
    args: {},
  },
  {
    id: "reports-login",
    surface: "reports",
    tool: "gws_activities_list",
    args: { applicationName: "login", maxResults: 1 },
  },
  {
    id: "alerts-list",
    surface: "alerts",
    tool: "gws_alerts_list",
    args: { pageSize: 1 },
  },
  {
    id: "vault-matters",
    surface: "vault",
    tool: "gws_vault_matters_list",
    args: { pageSize: 1 },
  },
  {
    id: "cloud-search-sources",
    surface: "cloud-search",
    tool: "gws_cloud_search_sources_list",
    args: {},
  },
  {
    id: "transfer-list",
    surface: "transfer",
    tool: "gws_transfers_list",
    args: { maxResults: 1 },
  },
  {
    id: "licensing-list",
    surface: "licensing",
    tool: "gws_licenses_list",
    args: { productId: "Google-Apps", maxResults: 1 },
  },
  {
    id: "resources-buildings",
    surface: "resources",
    tool: "gws_buildings_list",
    args: { maxResults: 1 },
  },
  {
    id: "groups-settings",
    surface: "groups-settings",
    tool: "gws_group_settings_get",
    args: { groupEmail: "$SMOKE_GROUP" },
    requires: ["SMOKE_GROUP"],
  },
];

export type CheckStatus = "ok" | "skipped" | "unavailable" | "denied" | "drift" | "error";

/** Error categories that are a tenant fact, not a drift or a failure. */
export function classifyError(category: string | undefined): CheckStatus {
  if (category === "edition_unavailable") return "unavailable";
  if (category === "permission_denied") return "denied";
  return "error";
}

/** Substitutes `$NAME` values from the environment, refusing when one is unset. */
export function resolveCheckArgs(
  check: SmokeCheck,
  env: NodeJS.ProcessEnv,
): { args: Record<string, unknown> } | { missing: string[] } {
  const missing = (check.requires ?? []).filter((name) => !env[name]);

  const args: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(check.args)) {
    if (typeof value === "string" && value.startsWith("$")) {
      const name = value.slice(1);
      if (!env[name]) {
        if (!missing.includes(name)) missing.push(name);
        continue;
      }
      args[key] = env[name];
      continue;
    }
    args[key] = value;
  }

  return missing.length > 0 ? { missing } : { args };
}
