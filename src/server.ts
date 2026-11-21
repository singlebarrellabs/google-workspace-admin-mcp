import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AppConfig } from "./auth/config.js";
import type { EditionProbe } from "./auth/edition.js";
import type { StoredToken } from "./auth/token-store.js";
import type { AnyToolSpec } from "./catalog.js";
import { AuditLog } from "./safety/audit.js";
import { requireConfirm, toolsForMode } from "./safety/policy.js";
import type { CloudSearchService } from "./services/cloud-search.js";
import type { GroupSettingsService } from "./services/group-settings.js";
import type { LicensingService } from "./services/licensing.js";
import type { ReportsService } from "./services/reports.js";
import type { ResourcesService } from "./services/resources.js";
import type { TransferService } from "./services/transfer.js";
import type { VaultService } from "./services/vault.js";
import { cloudSearchTools } from "./tools/cloud-search.js";
import type { DirectoryServices } from "./tools/directory.js";
import { directoryTools } from "./tools/directory.js";
import { groupSettingsTools } from "./tools/group-settings.js";
import { licensingTools } from "./tools/licensing.js";
import { reportsTools } from "./tools/reports.js";
import { resourceTools } from "./tools/resources.js";
import { systemTools } from "./tools/system.js";
import { transferTools } from "./tools/transfer.js";
import { vaultTools } from "./tools/vault.js";
import { mapGoogleError, ToolError } from "./util/errors.js";
import { VERSION } from "./version.js";

export interface ServerDeps {
  config: AppConfig;
  token?: StoredToken;
  vault?: VaultService;
  cloudSearch?: CloudSearchService;
  transfer?: TransferService;
  resources?: ResourcesService;
  groupSettings?: GroupSettingsService;
  licensing?: LicensingService;
  /** Built by main when GWS_PASSTHROUGH is on; absent means no passthrough tool. */
  passthrough?: AnyToolSpec[];
  directory?: DirectoryServices;
  edition?: EditionProbe;
  reports?: ReportsService;
}

export function buildServer(deps: ServerDeps): { server: McpServer; tools: string[] } {
  const { config, token } = deps;
  const audit = new AuditLog(config.auditPath);
  const specs: AnyToolSpec[] = [
    ...systemTools({ config, token, edition: deps.edition }),
    ...(deps.directory ? directoryTools(deps.directory) : []),
    ...(deps.vault ? vaultTools(deps.vault) : []),
    ...(deps.cloudSearch ? cloudSearchTools(deps.cloudSearch) : []),
    ...(deps.transfer ? transferTools(deps.transfer) : []),
    ...(deps.resources ? resourceTools(deps.resources) : []),
    ...(deps.groupSettings ? groupSettingsTools(deps.groupSettings) : []),
    ...(deps.licensing ? licensingTools(deps.licensing) : []),
    ...(deps.passthrough ?? []),
    ...(deps.reports ? reportsTools(deps.reports) : []),
  ];

  const registered = toolsForMode(specs, config.mode);
  const server = new McpServer({ name: "google-workspace-admin-mcp", version: VERSION });

  for (const spec of registered) {
    server.registerTool(
      spec.name,
      { description: spec.description, inputSchema: spec.inputShape },
      async (input: unknown) => {
        const started = Date.now();
        let parsed: Record<string, unknown> = {};
        try {
          parsed = z.object(spec.inputShape).parse(input ?? {}) as Record<string, unknown>;
          requireConfirm(spec, parsed);
          const result = await spec.run(parsed, { dryRun: false });
          await audit.append({
            tool: spec.name,
            access: result.access ?? spec.access,
            outcome: "ok",
            durationMs: Date.now() - started,
            args: parsed,
          });
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ summary: result.summary, data: result.data }),
              },
            ],
          };
        } catch (error) {
          const toolError = mapGoogleError(error, spec.surface);
          await audit
            .append({
              tool: spec.name,
              access: spec.access,
              outcome: "error",
              durationMs: Date.now() - started,
              args: parsed,
              error: { category: toolError.category, message: toolError.message },
            })
            .catch(() => undefined);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(toolError.toJSON()) }],
            isError: true,
          };
        }
      },
    );
  }

  return { server, tools: registered.map((spec) => spec.name) };
}

export { ToolError };
