import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { AnyToolSpec } from "../catalog.js";

/**
 * A stand-in for any service. Tool factories only close over their dependency;
 * they do not call it while building specs, so a proxy is enough to enumerate
 * the registry without a tenant.
 */
// biome-ignore lint/suspicious/noExplicitAny: a universal stand-in has no shape.
const anything: any = new Proxy(() => {}, {
  get: (_target, property) => (property === Symbol.toPrimitive ? () => "" : anything),
  apply: () => anything,
  construct: () => anything,
});

/** Every tool module in the tools directory, built without a network client. */
export async function loadToolSpecs(toolsDir: string): Promise<AnyToolSpec[]> {
  const files = readdirSync(toolsDir)
    .filter((file) => file.endsWith(".ts"))
    .sort();

  const specs: AnyToolSpec[] = [];
  for (const file of files) {
    const module = (await import(pathToFileURL(join(toolsDir, file)).href)) as Record<
      string,
      unknown
    >;
    for (const [name, exported] of Object.entries(module)) {
      if (name.endsWith("Tools") && typeof exported === "function") {
        specs.push(...(exported as (dependency: unknown) => AnyToolSpec[])(anything));
      }
    }
  }
  return specs;
}

export interface TableRow {
  name: string;
  surface: string;
  mutating: boolean;
}

/** Reads the markdown tool table. Notes are ignored on purpose. */
export function parseToolsTable(markdown: string): TableRow[] {
  const rows: TableRow[] = [];
  for (const line of markdown.split("\n")) {
    const match = /^\| `([a-z0-9_]+)` \| ([a-z-]+) \| (yes|no) \|/.exec(line);
    if (!match) continue;
    rows.push({ name: match[1], surface: match[2], mutating: match[3] === "yes" });
  }
  return rows;
}

export function readToolsTable(path: string): TableRow[] {
  return parseToolsTable(readFileSync(path, "utf8"));
}

/**
 * A registered tool with no row is the failure the table exists to catch. A row
 * with no tool is allowed: passthrough tools are registered only when enabled,
 * and a surface can be documented before its branch merges.
 */
export function missingRows(specs: AnyToolSpec[], rows: TableRow[]): string[] {
  const byName = new Map(rows.map((row) => [row.name, row]));
  const problems: string[] = [];

  for (const spec of specs) {
    const row = byName.get(spec.name);
    if (!row) {
      problems.push(`${spec.name} is registered but has no row in docs/TOOLS.md`);
      continue;
    }
    if (row.surface !== spec.surface) {
      problems.push(`${spec.name} says surface ${spec.surface}, the table says ${row.surface}`);
    }
    if (row.mutating !== (spec.access !== "read")) {
      problems.push(
        `${spec.name} is ${spec.access}, the table says mutating: ${row.mutating ? "yes" : "no"}`,
      );
    }
  }

  return problems;
}
