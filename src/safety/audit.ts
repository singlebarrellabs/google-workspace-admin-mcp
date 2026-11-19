import { appendFile, chmod, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { ToolError } from "../util/errors.js";
import { redact } from "../util/redact.js";

export interface AuditEntry {
  timestamp: string;
  tool: string;
  access: string;
  outcome: "ok" | "error";
  durationMs: number;
  args?: unknown;
  error?: { category: string; message: string };
}

export class AuditLog {
  constructor(private readonly path: string) {}

  async append(entry: Omit<AuditEntry, "timestamp">): Promise<void> {
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      ...entry,
      args: entry.args === undefined ? undefined : redact(entry.args),
    });

    try {
      await mkdir(dirname(this.path), { recursive: true });
      await appendFile(this.path, `${line}\n`, { mode: 0o600 });
      await chmod(this.path, 0o600);
    } catch (error) {
      throw new ToolError(
        "unknown",
        `Could not write the audit log at ${this.path}: ${(error as Error).message}`,
        "Fix the path or permissions; the call is refused rather than run unaudited.",
      );
    }
  }
}
