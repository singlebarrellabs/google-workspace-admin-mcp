import { readFileSync } from "node:fs";

/**
 * The published version, read from the package manifest at run time. A copied
 * literal here goes stale on every release, and `--version` then disagrees with
 * what npm installed.
 */
export const VERSION = (
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    version: string;
  }
).version;
