import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CheckStatus } from "./checks.js";
import { SmokeRefusal } from "./guards.js";
import type { Drift } from "./shape.js";

export interface CheckResult {
  id: string;
  surface: string;
  tool: string;
  status: CheckStatus;
  durationMs: number;
  drift?: Drift[];
  error?: { category?: string; message?: string };
  note?: string;
}

export interface SmokeRun {
  startedAt: string;
  finishedAt: string;
  mode: "read" | "write";
  checks: CheckResult[];
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const HOME_PATH = /\/(?:Users|home)\/[^\s"'/]+/;
const TOKEN_SHAPED = /(ya29\.|1\/\/|AIza|ghp_|github_pat_|sk-|xox[baprs]-)/;

/**
 * The last gate before a report is written. It returns descriptions, never the
 * offending value, because the report is what gets shared.
 */
export function findLeaks(rendered: string, tenantDomain?: string): string[] {
  const leaks: string[] = [];

  for (const match of rendered.match(EMAIL) ?? []) {
    if (!match.toLowerCase().endsWith("@example.com")) {
      leaks.push("an email address that is not a placeholder");
      break;
    }
  }
  EMAIL.lastIndex = 0;

  if (tenantDomain && rendered.toLowerCase().includes(tenantDomain.toLowerCase())) {
    leaks.push("the tenant domain");
  }
  if (HOME_PATH.test(rendered)) leaks.push("an absolute home path");
  if (TOKEN_SHAPED.test(rendered)) leaks.push("a token-shaped string");

  return leaks;
}

export function renderJson(run: SmokeRun): string {
  return `${JSON.stringify(run, null, 2)}\n`;
}

export function renderMarkdown(run: SmokeRun): string {
  const lines: string[] = [
    "# Smoke report",
    "",
    `- Started: ${run.startedAt}`,
    `- Finished: ${run.finishedAt}`,
    `- Mode: ${run.mode}`,
    "",
    "| Check | Surface | Tool | Result | Detail |",
    "| --- | --- | --- | --- | --- |",
  ];

  for (const check of run.checks) {
    lines.push(
      `| ${check.id} | ${check.surface} | ${check.tool} | ${check.status} | ${detailOf(check)} |`,
    );
  }

  const drifted = run.checks.filter((check) => (check.drift?.length ?? 0) > 0);
  if (drifted.length > 0) {
    lines.push("", "## Shape drift", "");
    for (const check of drifted) {
      for (const drift of check.drift ?? []) {
        lines.push(
          `- ${check.id}: \`${drift.path}\` expected ${drift.expected}, observed ${drift.observed}`,
        );
      }
    }
  }

  return `${lines.join("\n")}\n`;
}

function detailOf(check: CheckResult): string {
  if (check.note) return check.note;
  if (check.error?.message) {
    return `${check.error.category ?? "error"}: ${check.error.message}`;
  }
  if (check.drift?.length) {
    return `${check.drift.length} drift${check.drift.length === 1 ? "" : "s"}: ${check.drift
      .slice(0, 3)
      .map((drift) => `${drift.path} ${drift.expected}→${drift.observed}`)
      .join(", ")}`;
  }
  return "";
}

/**
 * Writes the two report files into a fresh timestamped directory, owner-only.
 * Nothing is written when the rendered text still contains a leak.
 */
export function writeReports(
  root: string,
  run: SmokeRun,
  tenantDomain: string | undefined,
  timestamp = new Date().toISOString(),
): { directory: string; jsonPath: string; markdownPath: string } {
  const json = renderJson(run);
  const markdown = renderMarkdown(run);

  const leaks = [...findLeaks(json, tenantDomain), ...findLeaks(markdown, tenantDomain)];
  if (leaks.length > 0) {
    throw new SmokeRefusal(
      "redaction_miss",
      `Refusing to write a report that still contains ${[...new Set(leaks)].join(", ")}.`,
      "Fix the redactor before sharing anything from this run.",
    );
  }

  const directory = join(root, timestamp.replace(/[:.]/g, "-"));
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);

  const jsonPath = join(directory, "report.json");
  const markdownPath = join(directory, "summary.md");
  writeFileSync(jsonPath, json, { mode: 0o600 });
  writeFileSync(markdownPath, markdown, { mode: 0o600 });
  chmodSync(jsonPath, 0o600);
  chmodSync(markdownPath, 0o600);

  return { directory, jsonPath, markdownPath };
}
