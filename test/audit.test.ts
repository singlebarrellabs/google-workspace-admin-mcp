import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AuditLog } from "../src/safety/audit.js";

async function tempLog(): Promise<{ path: string; log: AuditLog }> {
  const dir = await mkdtemp(join(tmpdir(), "gws-audit-"));
  const path = join(dir, "audit.jsonl");
  return { path, log: new AuditLog(path) };
}

describe("audit log", () => {
  it("writes one JSON line per call, owner-readable only", async () => {
    const { path, log } = await tempLog();
    await log.append({
      tool: "gws_users_list",
      access: "read",
      outcome: "ok",
      durationMs: 12,
      args: { userKey: "user@example.com" },
    });

    const lines = (await readFile(path, "utf8")).trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).tool).toBe("gws_users_list");

    const mode = (await stat(path)).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("redacts credentials before writing", async () => {
    const { path, log } = await tempLog();
    await log.append({
      tool: "gws_auth_status",
      access: "read",
      outcome: "ok",
      durationMs: 1,
      args: { access_token: "ya29.secret-value", client_secret: "shh" },
    });

    const raw = await readFile(path, "utf8");
    expect(raw).not.toContain("ya29.secret-value");
    expect(raw).not.toContain("shh");
    expect(raw).toContain("[redacted]");
  });

  it("records the error category on failure", async () => {
    const { path, log } = await tempLog();
    await log.append({
      tool: "gws_users_suspend",
      access: "destructive",
      outcome: "error",
      durationMs: 3,
      args: {},
      error: { category: "permission_denied", message: "not allowed" },
    });

    const entry = JSON.parse((await readFile(path, "utf8")).trim());
    expect(entry.outcome).toBe("error");
    expect(entry.error.category).toBe("permission_denied");
  });
});
