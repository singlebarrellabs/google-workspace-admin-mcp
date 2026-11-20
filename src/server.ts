import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AppConfig } from "./auth/config.js";
import type { StoredToken } from "./auth/token-store.js";
import type { AnyToolSpec } from "./catalog.js";
import { AuditLog } from "./safety/audit.js";
import { requireConfirm, toolsForMode } from "./safety/policy.js";
import type { DirectoryServices } from "./tools/directory.js";
import { directoryTools } from "./tools/directory.js";
import { systemTools } from "./tools/system.js";
import { mapGoogleError, ToolError } from "./util/errors.js";

export interface ServerDeps {
  config: AppConfig;
  token?: StoredToken;
  directory?: DirectoryServices;
}

export function buildServer(deps: ServerDeps): { server: McpServer; tools: string[] } {
  const { config, token } = deps;
  const audit = new AuditLog(config.auditPath);
  const specs: AnyToolSpec[] = [
    ...systemTools({ config, token }),
    ...(deps.directory ? directoryTools(deps.directory) : []),
  ];

  const registered = toolsForMode(specs, config.mode);
  const server = new McpServer({ name: "google-workspace-admin-mcp", version: "0.1.0" });

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
            access: spec.access,
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
