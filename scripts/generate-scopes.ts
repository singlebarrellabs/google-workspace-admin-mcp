#!/usr/bin/env node
/**
 * Writes the scope list into docs/SETUP.md from ADMIN_SCOPES, so the documented
 * list cannot drift from the requested one. `--check` exits non-zero instead of
 * writing, which is what CI runs.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ADMIN_SCOPES } from "../src/auth/config.js";
import { extractScopeBlock, renderScopeBlock, replaceScopeBlock } from "../src/docs/scopes.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const path = join(root, "docs", "SETUP.md");
const markdown = readFileSync(path, "utf8");
const expected = renderScopeBlock(ADMIN_SCOPES);

if (process.argv.includes("--check")) {
  const actual = extractScopeBlock(markdown);
  if (actual !== expected) {
    process.stderr.write("docs/SETUP.md scope list is out of date. Run: npm run docs:scopes\n");
    process.exitCode = 1;
  }
} else {
  writeFileSync(path, replaceScopeBlock(markdown, ADMIN_SCOPES));
  process.stdout.write(`updated ${path}\n`);
}
