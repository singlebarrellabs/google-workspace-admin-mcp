#!/usr/bin/env node
/**
 * Snapshots the auth scopes each API publishes, so a wrong scope string is
 * caught by `npm test` instead of a failed consent screen.
 *
 * This is the only script here that needs the network, so it is not part of
 * `npm run check`: run it when a surface is added or an API changes.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APIS: Record<string, string> = {
  admin: "https://admin.googleapis.com/$discovery/rest?version=directory_v1",
  reports: "https://admin.googleapis.com/$discovery/rest?version=reports_v1",
  datatransfer: "https://admin.googleapis.com/$discovery/rest?version=datatransfer_v1",
  alertcenter: "https://alertcenter.googleapis.com/$discovery/rest?version=v1beta1",
  cloudsearch: "https://cloudsearch.googleapis.com/$discovery/rest?version=v1",
  groupssettings: "https://groupssettings.googleapis.com/$discovery/rest?version=v1",
  licensing: "https://licensing.googleapis.com/$discovery/rest?version=v1",
  vault: "https://vault.googleapis.com/$discovery/rest?version=v1",
};

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const path = join(root, "docs", "api", "scopes.json");

interface Discovery {
  auth?: { oauth2?: { scopes?: Record<string, unknown> } };
}

const snapshot: Record<string, string[]> = {};
for (const [api, url] of Object.entries(APIS)) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${api}: discovery returned ${response.status}`);
  const document = (await response.json()) as Discovery;
  snapshot[api] = Object.keys(document.auth?.oauth2?.scopes ?? {}).sort();
  process.stdout.write(`${api}: ${snapshot[api].length} scopes\n`);
}

const rendered = `${JSON.stringify(snapshot, null, 2)}\n`;
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, rendered);
process.stdout.write(`wrote ${path}\n`);

// A cheap guard against an empty or truncated snapshot.
if (!readFileSync(path, "utf8").includes("https://www.googleapis.com/auth/")) {
  throw new Error("snapshot has no scopes; refusing to keep it");
}
