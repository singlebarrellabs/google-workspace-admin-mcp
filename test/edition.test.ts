import { OAuth2Client } from "google-auth-library";
import nock from "nock";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/auth/config.js";
import { EditionProbe } from "../src/auth/edition.js";
import { systemTools } from "../src/tools/system.js";

function probe(): EditionProbe {
  const auth = new OAuth2Client({
    clientId: "client-id.apps.googleusercontent.com",
    clientSecret: "placeholder",
  });
  auth.setCredentials({ access_token: "test-token", expiry_date: Date.now() + 3_600_000 });
  return new EditionProbe(auth);
}

function forbidden(reason: string, message = "Not Authorized") {
  nock("https://vault.googleapis.com")
    .get("/v1/matters")
    .query(true)
    .reply(403, { error: { code: 403, message, errors: [{ reason }] } });
}

afterEach(() => {
  nock.cleanAll();
});

describe("edition probe", () => {
  it("reports enterprise when Vault answers", async () => {
    nock("https://vault.googleapis.com")
      .get("/v1/matters")
      .query({ pageSize: 1 })
      .reply(200, { matters: [] });

    await expect(probe().report()).resolves.toMatchObject({
      source: "vault.matters.list",
      state: "enterprise",
    });
  });

  it("reports not_enterprise when the tenant is not entitled", async () => {
    forbidden("forbidden", "Vault is not available for your edition");

    await expect(probe().report()).resolves.toMatchObject({ state: "not_enterprise" });
  });

  it("stays unknown when the Vault API is not enabled in the project", async () => {
    forbidden("accessNotConfigured");

    const report = await probe().report();
    expect(report.state).toBe("unknown");
    expect(report.detail).toContain("not enabled");
  });

  it("stays unknown when the admin lacks the Vault privilege", async () => {
    forbidden("insufficientPermissions", "The caller does not have permission");

    const report = await probe().report();
    expect(report.state).toBe("unknown");
    expect(report.detail).toContain("no Vault privilege");
  });

  it("probes once per process", async () => {
    const scope = nock("https://vault.googleapis.com")
      .get("/v1/matters")
      .query(true)
      .once()
      .reply(200, { matters: [] });

    const instance = probe();
    const first = await instance.report();
    const second = await instance.report();

    expect(first).toEqual(second);
    expect(scope.isDone()).toBe(true);
  });
});

describe("auth status", () => {
  const config = { ...loadConfig({}), tokenPath: "/tmp/token.json", auditPath: "/tmp/audit.jsonl" };

  it("surfaces the edition report and its source", async () => {
    const [status] = systemTools({
      config,
      token: { refresh_token: "placeholder" },
      edition: {
        report: async () => ({
          source: "vault.matters.list",
          state: "not_enterprise" as const,
          detail: "Vault requires an Enterprise edition.",
        }),
      },
    });

    const result = await status.run({}, { dryRun: false });
    const data = result.data as { editionCapability: { state: string; source: string } };
    expect(data.editionCapability.state).toBe("not_enterprise");
    expect(data.editionCapability.source).toBe("vault.matters.list");
  });

  it("says why no probe ran when there is no token", async () => {
    const [status] = systemTools({ config, token: undefined });

    const result = await status.run({}, { dryRun: false });
    const data = result.data as { editionCapability: { state: string; detail: string } };
    expect(data.editionCapability.state).toBe("unknown");
    expect(data.editionCapability.detail).toContain("No token is stored");
  });

  it("reports a failing probe as unknown rather than failing the tool", async () => {
    const [status] = systemTools({
      config,
      token: { refresh_token: "placeholder" },
      edition: {
        report: async () => {
          throw new Error("socket hang up");
        },
      },
    });

    const result = await status.run({}, { dryRun: false });
    const data = result.data as { editionCapability: { state: string; detail: string } };
    expect(data.editionCapability.state).toBe("unknown");
    expect(data.editionCapability.detail).toContain("socket hang up");
  });
});
