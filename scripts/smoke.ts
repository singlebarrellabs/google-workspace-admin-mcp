#!/usr/bin/env node
/**
 * Opt-in smoke runner. It drives the real server over stdio, so the tool
 * registry, the confirm gate and the audit log are exercised exactly as a
 * client would. Nothing here runs in CI: the guards refuse first.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  classifyError,
  resolveCheckArgs,
  SMOKE_CHECKS,
  type SmokeCheck,
} from "../src/smoke/checks.js";
import {
  assertDomainAllowlisted,
  assertNotCi,
  assertRawAllowed,
  assertReportLocation,
  assertWriteSandbox,
  parseAllowlist,
  resolveTenantDomain,
  SmokeRefusal,
} from "../src/smoke/guards.js";
import { Redactor } from "../src/smoke/redact.js";
import { type CheckResult, type SmokeRun, writeReports } from "../src/smoke/report.js";
import { type Drift, diffShapes, shapeOf } from "../src/smoke/shape.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

interface Options {
  status: boolean;
  auto: boolean;
  record: boolean;
  raw: boolean;
  write: boolean;
}

function parseOptions(argv: string[]): Options {
  return {
    status: argv.includes("--status"),
    auto: argv.includes("--auto"),
    record: argv.includes("--record"),
    raw: argv.includes("--raw"),
    write: argv.includes("--write"),
  };
}

/**
 * `.env.smoke` is gitignored and never overrides an explicit environment
 * variable, so a shell export wins.
 */
function loadEnvFile(env: NodeJS.ProcessEnv): void {
  const path = join(REPO_ROOT, ".env.smoke");
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;

    const key = trimmed.slice(0, eq).trim();
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!env[key]) env[key] = value;
  }
}

interface ToolReply {
  ok: boolean;
  data?: unknown;
  category?: string;
  message?: string;
}

async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolReply> {
  const response = (await client.callTool({ name, arguments: args })) as {
    content?: Array<{ type: string; text?: string }>;
    isError?: boolean;
  };
  const text = response.content?.find((entry) => entry.type === "text")?.text ?? "{}";
  const parsed = JSON.parse(text) as {
    data?: unknown;
    category?: string;
    message?: string;
  };

  return response.isError
    ? {
        ok: false,
        ...(parsed.category ? { category: parsed.category } : {}),
        ...(parsed.message ? { message: parsed.message } : {}),
      }
    : { ok: true, data: parsed.data };
}

/** The tenant domain comes from the API; nothing can check it before a read. */
async function discoverDomain(client: Client, tools: string[]): Promise<string | undefined> {
  if (tools.includes("gws_domains_list")) {
    const reply = await callTool(client, "gws_domains_list", {});
    const items = (reply.data as { items?: Array<{ domainName?: string; isPrimary?: boolean }> })
      ?.items;
    const primary = items?.find((item) => item.isPrimary) ?? items?.[0];
    if (primary?.domainName) return primary.domainName;
  }

  if (tools.includes("gws_users_list")) {
    const reply = await callTool(client, "gws_users_list", { maxResults: 1 });
    const users = (reply.data as { items?: Array<{ primaryEmail?: string }> })?.items;
    const email = users?.[0]?.primaryEmail;
    if (email?.includes("@")) return email.split("@")[1];
  }

  return undefined;
}

function shapePath(check: SmokeCheck): string {
  return join(REPO_ROOT, "smoke", "shapes", `${check.id}.json`);
}

function readShape(check: SmokeCheck): ReturnType<typeof shapeOf> | undefined {
  const path = shapePath(check);
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as ReturnType<typeof shapeOf>;
}

function recordShape(check: SmokeCheck, data: unknown): string {
  const path = shapePath(check);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(shapeOf(data), null, 2)}\n`);
  return path;
}

async function runCheck(
  client: Client,
  check: SmokeCheck,
  env: NodeJS.ProcessEnv,
  registered: Set<string>,
  redactor: Redactor,
  record: boolean,
): Promise<CheckResult> {
  const started = Date.now();

  if (!registered.has(check.tool)) {
    return {
      id: check.id,
      surface: check.surface,
      tool: check.tool,
      status: "skipped",
      durationMs: 0,
      note: "tool is not registered in this build",
    };
  }

  const resolved = resolveCheckArgs(check, env);
  if ("missing" in resolved) {
    return {
      id: check.id,
      surface: check.surface,
      tool: check.tool,
      status: "skipped",
      durationMs: 0,
      note: `set ${resolved.missing.join(", ")} to run this check`,
    };
  }

  const reply = await callTool(client, check.tool, resolved.args);
  const durationMs = Date.now() - started;

  if (!reply.ok) {
    return {
      id: check.id,
      surface: check.surface,
      tool: check.tool,
      status: classifyError(reply.category),
      durationMs,
      ...(reply.message
        ? {
            error: {
              ...(reply.category ? { category: reply.category } : {}),
              message: redactor.text(reply.message),
            },
          }
        : {}),
    };
  }

  if (record) {
    const path = recordShape(check, reply.data);
    return {
      id: check.id,
      surface: check.surface,
      tool: check.tool,
      status: "ok",
      durationMs,
      note: `recorded shape to ${path.slice(REPO_ROOT.length + 1)}`,
    };
  }

  const expected = readShape(check);
  if (!expected) {
    return {
      id: check.id,
      surface: check.surface,
      tool: check.tool,
      status: "ok",
      durationMs,
      note: "no recorded shape; run with --record to start drift detection",
    };
  }

  const drift: Drift[] = diffShapes(expected, shapeOf(reply.data));
  return {
    id: check.id,
    surface: check.surface,
    tool: check.tool,
    status: drift.length > 0 ? "drift" : "ok",
    durationMs,
    ...(drift.length > 0 ? { drift } : {}),
  };
}

async function main(): Promise<number> {
  const options = parseOptions(process.argv.slice(2));
  const env = { ...process.env };

  assertNotCi(env);
  if (options.raw) assertRawAllowed(env, process.stdin.isTTY === true);
  assertReportLocation(readFileSync(join(REPO_ROOT, ".gitignore"), "utf8"));
  loadEnvFile(env);

  const allowlist = parseAllowlist(env.SMOKE_ALLOWED_DOMAINS);
  if (allowlist.length === 0) assertDomainAllowlisted("", allowlist);
  const sandbox = options.write
    ? assertWriteSandbox(env, allowlist, process.stdin.isTTY === true).sandboxDomain
    : (env.SMOKE_SANDBOX_DOMAIN ?? "").trim().toLowerCase() || undefined;

  // A declared tenant is checked before the server starts, so a typo cannot
  // reach even the domain-discovery read.
  const declared = (env.SMOKE_TENANT_DOMAIN ?? "").trim().toLowerCase();
  if (declared) assertDomainAllowlisted(declared, allowlist, sandbox);

  const mode = options.write ? "write" : "readonly";
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", join(REPO_ROOT, "src", "main.ts")],
    env: Object.fromEntries(
      Object.entries({ ...env, GWS_MODE: mode }).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    ),
    stderr: "inherit",
  });

  const client = new Client({ name: "google-workspace-admin-mcp-smoke", version: "0.0.0" });
  await client.connect(transport);

  try {
    const registered = new Set((await client.listTools()).tools.map((tool) => tool.name));
    const discovered = await discoverDomain(client, [...registered]);
    const domain = resolveTenantDomain(env, discovered);
    assertDomainAllowlisted(domain, allowlist, sandbox);

    const redactor = new Redactor(domain);

    if (options.status) {
      const reply = await callTool(client, "gws_auth_status", {});
      const rendered = JSON.stringify(
        redactor.data({ tenantDomain: domain, auth: reply.data }),
        null,
        2,
      );
      process.stdout.write(`${redactor.text(rendered)}\n`);
      return reply.ok ? 0 : 1;
    }

    const startedAt = new Date().toISOString();
    const checks: CheckResult[] = [];
    for (const check of SMOKE_CHECKS) {
      checks.push(await runCheck(client, check, env, registered, redactor, options.record));
    }

    const run: SmokeRun = {
      startedAt,
      finishedAt: new Date().toISOString(),
      mode: options.write ? "write" : "read",
      checks,
    };

    const written = options.record
      ? undefined
      : writeReports(join(REPO_ROOT, ".smoke"), run, domain);

    const failed = checks.filter((check) => check.status === "error" || check.status === "drift");
    const summary = checks
      .map(
        (check) => `${check.status.padEnd(11)} ${check.id}${check.note ? ` (${check.note})` : ""}`,
      )
      .join("\n");
    process.stdout.write(`${summary}\n`);
    if (written) process.stdout.write(`report: ${written.directory}\n`);

    return failed.length === 0 ? 0 : 1;
  } finally {
    await client.close();
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    if (error instanceof SmokeRefusal) {
      process.stderr.write(`refused (${error.code}): ${error.message}\n`);
      if (error.nextStep) process.stderr.write(`${error.nextStep}\n`);
      process.exitCode = 2;
      return;
    }
    process.stderr.write(`${(error as Error).message}\n`);
    process.exitCode = 1;
  });
