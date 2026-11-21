import { OAuth2Client } from "google-auth-library";
import nock from "nock";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/auth/config.js";
import type { AnyToolSpec } from "../src/catalog.js";
import { ALLOWLIST, type AllowlistedMethod } from "../src/passthrough/allowlist.js";
import { passthroughTools } from "../src/passthrough/dispatch.js";
import { buildServer } from "../src/server.js";

function auth(): OAuth2Client {
  const client = new OAuth2Client({
    clientId: "client-id.apps.googleusercontent.com",
    clientSecret: "placeholder",
  });
  client.setCredentials({ access_token: "test-token", expiry_date: Date.now() + 3_600_000 });
  return client;
}

function tools(mode: "readonly" | "write", allowlist?: AllowlistedMethod[]): AnyToolSpec[] {
  return passthroughTools({ auth: auth(), mode, ...(allowlist ? { allowlist } : {}) });
}

function spec(mode: "readonly" | "write", name: string, allowlist?: AllowlistedMethod[]) {
  const found = tools(mode, allowlist).find((candidate) => candidate.name === name);
  if (!found) throw new Error(`${name} not built`);
  return found;
}

const WRITE_ENTRY: AllowlistedMethod[] = [
  { api: "directory", method: "users.get", access: "read" },
  { api: "directory", method: "users.patch", access: "write" },
];

afterEach(() => {
  nock.cleanAll();
});

describe("passthrough registration", () => {
  it("is absent unless it is built", () => {
    const { server } = buildServer({
      config: { ...loadConfig({}), tokenPath: "/tmp/t.json", auditPath: "/tmp/a.jsonl" },
    });

    expect(toolNames(server).filter((name) => name.startsWith("gws_passthrough_"))).toEqual([]);
  });

  it("builds one tool per allowlisted API", () => {
    const names = tools("readonly").map((entry) => entry.name);
    const apis = [...new Set(ALLOWLIST.map((entry) => entry.api))].sort();

    expect(names.sort()).toEqual(apis.map((api) => `gws_passthrough_${api}`).sort());
  });

  it("registers passthrough in read-only mode, because reads must stay reachable", () => {
    const specs = tools("readonly");
    const { server } = buildServer({
      config: { ...loadConfig({}), tokenPath: "/tmp/t.json", auditPath: "/tmp/a.jsonl" },
      passthrough: specs,
    });

    expect(toolNames(server)).toContain("gws_passthrough_directory");
  });

  it("refuses an allowlist entry without a classification", () => {
    expect(() =>
      tools("write", [{ api: "directory", method: "users.get", access: "maybe" as never }]),
    ).toThrow(/read\/write classification/);
  });
});

describe("passthrough dispatch", () => {
  it("rejects an unknown method and lists the permitted ones", async () => {
    const error = await spec("readonly", "gws_passthrough_directory")
      .run({ method: "groups.delete" }, { dryRun: false })
      .catch((caught: unknown) => caught as { message: string; nextStep?: string });

    expect(error.message).toContain("groups.delete is not allowlisted");
    expect(error.nextStep).toContain("users.list");
    expect(error.nextStep).toContain("orgunits.list");
  });

  it("executes an allowlisted read method and returns its body", async () => {
    const scope = nock("https://admin.googleapis.com")
      .get("/admin/directory/v1/users")
      .query((query) => {
        expect(query.customer).toBe("my_customer");
        return true;
      })
      .reply(200, { users: [{ primaryEmail: "user-1@example.com" }] });

    const result = await spec("readonly", "gws_passthrough_directory").run(
      { method: "users.list", params: { customer: "my_customer" } },
      { dryRun: false },
    );

    expect(scope.isDone()).toBe(true);
    expect(result.summary).toBe("directory.users.list succeeded");
    expect(result.data).toEqual({ users: [{ primaryEmail: "user-1@example.com" }] });
    expect(result.access).toBe("read");
  });

  it("refuses a write method while the server is read-only", async () => {
    const readOnly = spec("readonly", "gws_passthrough_directory", WRITE_ENTRY);

    await expect(
      readOnly.run(
        { method: "users.patch", params: { userKey: "user-1@example.com" }, confirm: true },
        { dryRun: false },
      ),
    ).rejects.toMatchObject({
      category: "invalid_request",
      message: expect.stringContaining("write mode is disabled"),
    });
  });

  it("refuses a write method without confirmation", async () => {
    const writable = spec("write", "gws_passthrough_directory", WRITE_ENTRY);

    await expect(
      writable.run(
        { method: "users.patch", params: { userKey: "user-1@example.com" } },
        { dryRun: false },
      ),
    ).rejects.toMatchObject({
      category: "invalid_request",
      message: expect.stringContaining("changes tenant state"),
    });
  });

  it("executes a confirmed write method and reports write access", async () => {
    const scope = nock("https://admin.googleapis.com")
      .patch("/admin/directory/v1/users/user-1%40example.com", { suspended: true })
      .query(true)
      .reply(200, { primaryEmail: "user-1@example.com", suspended: true });

    const result = await spec("write", "gws_passthrough_directory", WRITE_ENTRY).run(
      {
        method: "users.patch",
        params: { userKey: "user-1@example.com", requestBody: { suspended: true } },
        confirm: true,
      },
      { dryRun: false },
    );

    expect(scope.isDone()).toBe(true);
    expect(result.access).toBe("write");
    expect(result.data).toEqual({ primaryEmail: "user-1@example.com", suspended: true });
  });

  it("maps an API failure through the shared error mapper", async () => {
    nock("https://admin.googleapis.com")
      .get("/admin/directory/v1/users/missing")
      .query(true)
      .reply(404, { error: { code: 404, message: "Resource Not Found: userKey" } });

    await expect(
      spec("readonly", "gws_passthrough_directory").run(
        { method: "users.get", params: { userKey: "missing" } },
        { dryRun: false },
      ),
    ).rejects.toMatchObject({ category: "not_found" });
  });

  it("reports a method that is allowlisted but not callable", async () => {
    await expect(
      spec("write", "gws_passthrough_directory", [
        { api: "directory", method: "users.notAMethod", access: "read" },
      ]).run({ method: "users.notAMethod" }, { dryRun: false }),
    ).rejects.toMatchObject({
      category: "invalid_request",
      message: expect.stringContaining("not callable"),
    });
  });
});

function toolNames(server: ReturnType<typeof buildServer>["server"]): string[] {
  const registry = (server as unknown as { _registeredTools?: Record<string, unknown> })
    ._registeredTools;
  return Object.keys(registry ?? {});
}
