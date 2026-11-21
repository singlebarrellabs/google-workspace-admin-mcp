#!/usr/bin/env node
/**
 * Appends a row for any registered tool that docs/TOOLS.md does not cover.
 * Existing rows are never rewritten: their notes are the reviewed part, and a
 * generator cannot invent them. `npm test` fails when a row is still missing.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadToolSpecs, readToolsTable } from "../src/docs/tools.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const path = join(root, "docs", "TOOLS.md");
const markdown = readFileSync(path, "utf8");
const rows = readToolsTable(path);
const known = new Set(rows.map((row) => row.name));

const specs = (await loadToolSpecs(join(root, "src", "tools"))).sort((a, b) =>
  a.name.localeCompare(b.name),
);
const missing = specs.filter((spec) => !known.has(spec.name));

if (missing.length === 0) {
  process.stdout.write("docs/TOOLS.md already covers every registered tool\n");
} else {
  const added = missing.map(
    (spec) =>
      `| \`${spec.name}\` | ${spec.surface} | ${spec.access === "read" ? "no" : "yes"} | TODO: describe the tool. |`,
  );
  const marker = "\n## Conventions";
  const at = markdown.indexOf(marker);
  if (at === -1) throw new Error("docs/TOOLS.md is missing its Conventions heading");

  writeFileSync(path, `${markdown.slice(0, at)}\n${added.join("\n")}${markdown.slice(at)}`);
  process.stdout.write(`added ${added.length} row${added.length === 1 ? "" : "s"} to ${path}\n`);
}
