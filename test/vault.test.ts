import { OAuth2Client } from "google-auth-library";
import nock from "nock";
import { afterEach, describe, expect, it } from "vitest";
import { VaultService } from "../src/services/vault.js";
import {
  buildExportOptions,
  buildHoldQuery,
  buildHoldScope,
  buildQuery,
} from "../src/services/vault-query.js";
import { vaultTools } from "../src/tools/vault.js";

function auth(): OAuth2Client {
  const client = new OAuth2Client({
    clientId: "client-id.apps.googleusercontent.com",
    clientSecret: "placeholder",
  });
  client.setCredentials({ access_token: "test-token", expiry_date: Date.now() + 3_600_000 });
  return client;
}

function service(): VaultService {
  const clock = { at: 0 };
  return new VaultService(auth(), {
    now: () => clock.at,
    sleep: async (ms) => {
      clock.at += ms;
    },
  });
}

function tool<T extends { run: (input: unknown, ctx: { dryRun: boolean }) => Promise<unknown> }>(
  name: string,
): T {
  const found = vaultTools(service()).find((spec) => spec.name === name);
  if (!found) throw new Error(`${name} not built`);
  return found as unknown as T;
}

function failure(error: unknown): { category: string; message: string; nextStep?: string } {
  return error as { category: string; message: string; nextStep?: string };
}

afterEach(() => {
  nock.cleanAll();
});

describe("matters", () => {
  it("lists matters with their state and asks for permission detail when asked", async () => {
    const scope = nock("https://vault.googleapis.com")
      .get("/v1/matters")
      .query((query) => {
        expect(String(query.view)).toBe("FULL");
        expect(String(query.pageSize)).toBe("25");
        return true;
      })
      .reply(200, {
        matters: [
          {
            matterId: "m1",
            name: "Case 2026-014",
            state: "OPEN",
            matterPermissions: [
              { accountId: "a1", role: "OWNER" },
              { accountId: "a2", role: "COLLABORATOR" },
            ],
          },
        ],
        nextPageToken: "page-2",
      });

    const result = await service().listMatters({ pageSize: 25, view: "FULL" });

    expect(scope.isDone()).toBe(true);
    expect(result.items[0]).toEqual({
      matterId: "m1",
      name: "Case 2026-014",
      state: "OPEN",
      permissions: [
        { accountId: "a1", role: "OWNER" },
        { accountId: "a2", role: "COLLABORATOR" },
      ],
    });
    expect(result.nextPageToken).toBe("page-2");
  });

  it("names the matter when it is not shared with the administrator", async () => {
    nock("https://vault.googleapis.com")
      .get("/v1/matters/m9")
      .query(true)
      .reply(403, {
        error: {
          code: 403,
          message: "The caller does not have permission",
          errors: [{ reason: "forbidden" }],
        },
      });

    const error = failure(
      await service()
        .getMatter("m9")
        .catch((caught) => caught),
    );

    expect(error.category).toBe("permission_denied");
    expect(error.message).toContain("Matter m9 is not visible");
    expect(error.message).toContain("View All Matters");
    expect(error.nextStep).toContain("share the matter");
  });

  it("reads an edition rejection as edition_unavailable with another surface to use", async () => {
    nock("https://vault.googleapis.com")
      .get("/v1/matters")
      .query(true)
      .reply(403, {
        error: {
          code: 403,
          message: "Vault is not available for your edition",
          errors: [{ reason: "accessNotConfigured" }],
        },
      });

    const error = failure(
      await service()
        .listMatters({})
        .catch((caught) => caught),
    );

    expect(error.category).toBe("edition_unavailable");
    expect(error.message).toContain("Vault requires Google Workspace Enterprise or Education");
    expect(error.nextStep).toContain("directory");
  });

  it("reads Google's 'not installed' answer as an edition problem", async () => {
    nock("https://vault.googleapis.com")
      .get("/v1/matters")
      .query(true)
      .reply(403, {
        error: {
          code: 403,
          message: "Customer does not have Vault installed.",
          errors: [{ reason: "forbidden" }],
        },
      });

    const error = failure(
      await service()
        .listMatters({})
        .catch((caught) => caught),
    );

    expect(error.category).toBe("edition_unavailable");
    expect(error.nextStep).toContain("directory or reports");
  });

  it("keeps a missing privilege as permission_denied and quotes Google", async () => {
    nock("https://vault.googleapis.com")
      .get("/v1/matters/m1")
      .query(true)
      .reply(403, {
        error: {
          code: 403,
          message: "The caller does not have permission",
          errors: [{ reason: "forbidden" }],
        },
      });

    const error = failure(
      await service()
        .getMatter("m1")
        .catch((caught) => caught),
    );

    expect(error.category).toBe("permission_denied");
    expect(error.message).toContain("Google said: The caller does not have permission");
  });

  it("creates a matter with a requested region", async () => {
    const scope = nock("https://vault.googleapis.com")
      .post("/v1/matters", { name: "Case 2026-015", matterRegion: "US" })
      .query(true)
      .reply(200, { matterId: "m2", name: "Case 2026-015", state: "OPEN" });

    const matter = await service().createMatter({ name: "Case 2026-015", matterRegion: "US" });

    expect(scope.isDone()).toBe(true);
    expect(matter.matterId).toBe("m2");
  });

  it("updates a matter with a read then a full PUT, keeping the region", async () => {
    nock("https://vault.googleapis.com").get("/v1/matters/m1").query(true).reply(200, {
      matterId: "m1",
      name: "Old name",
      description: "Kept",
      matterRegion: "EUROPE",
    });

    const put = nock("https://vault.googleapis.com")
      .put("/v1/matters/m1", {
        name: "New name",
        description: "Kept",
        matterRegion: "EUROPE",
      })
      .query(true)
      .reply(200, {
        matterId: "m1",
        name: "New name",
        description: "Kept",
        matterRegion: "EUROPE",
      });

    const result = await service().updateMatter("m1", { name: "New name" });

    expect(put.isDone()).toBe(true);
    expect(result.previous.name).toBe("Old name");
    expect(result.matter.matterRegion).toBe("EUROPE");
  });

  it("refuses an update with nothing to change", async () => {
    await expect(service().updateMatter("m1", {})).rejects.toMatchObject({
      category: "invalid_request",
    });
  });

  it("closes and reopens a matter", async () => {
    nock("https://vault.googleapis.com")
      .post("/v1/matters/m1:close")
      .query(true)
      .reply(200, { matter: { matterId: "m1", state: "CLOSED" } });
    nock("https://vault.googleapis.com")
      .post("/v1/matters/m1:reopen")
      .query(true)
      .reply(200, { matter: { matterId: "m1", state: "OPEN" } });

    expect((await service().closeMatter("m1")).state).toBe("CLOSED");
    expect((await service().reopenMatter("m1")).state).toBe("OPEN");
  });

  it("deletes and undeletes a matter", async () => {
    nock("https://vault.googleapis.com")
      .delete("/v1/matters/m1")
      .query(true)
      .reply(200, { matterId: "m1", state: "DELETED" });
    nock("https://vault.googleapis.com")
      .post("/v1/matters/m1:undelete")
      .query(true)
      .reply(200, { matterId: "m1", state: "OPEN" });

    expect((await service().deleteMatter("m1")).state).toBe("DELETED");
    expect((await service().undeleteMatter("m1")).state).toBe("OPEN");
  });
});

describe("holds", () => {
  it("creates a Gmail hold over accounts with terms", async () => {
    const scope = nock("https://vault.googleapis.com")
      .post("/v1/matters/m1/holds", {
        name: "Hold on jdoe",
        corpus: "MAIL",
        accounts: [{ email: "user-1@example.com" }],
        query: { mailQuery: { terms: "to:user-2@example.com" } },
      })
      .query(true)
      .reply(200, {
        holdId: "h1",
        name: "Hold on jdoe",
        corpus: "MAIL",
        accounts: [{ accountId: "a1", email: "user-1@example.com" }],
      });

    const hold = await service().createHold("m1", {
      name: "Hold on jdoe",
      corpus: "MAIL",
      ...buildHoldScope({ corpus: "MAIL", accountEmails: ["user-1@example.com"] }),
      query: buildHoldQuery("MAIL", { terms: "to:user-2@example.com" }),
    });

    expect(scope.isDone()).toBe(true);
    expect(hold.holdId).toBe("h1");
    expect(hold.accounts?.[0]?.email).toBe("user-1@example.com");
  });

  it("keeps an org unit hold out of the accounts field", async () => {
    const scope = nock("https://vault.googleapis.com")
      .post("/v1/matters/m1/holds", {
        name: "Hold on Engineering",
        corpus: "DRIVE",
        orgUnit: { orgUnitId: "ou-1" },
        query: { driveQuery: { includeSharedDriveFiles: true } },
      })
      .query(true)
      .reply(200, { holdId: "h2", name: "Hold on Engineering", corpus: "DRIVE" });

    await service().createHold("m1", {
      name: "Hold on Engineering",
      corpus: "DRIVE",
      ...buildHoldScope({ corpus: "DRIVE", orgUnitId: "ou-1" }),
      query: buildHoldQuery("DRIVE", { includeSharedDriveFiles: true }),
    });

    expect(scope.isDone()).toBe(true);
  });

  it("refuses accounts and an org unit together", () => {
    expect(() =>
      buildHoldScope({ corpus: "MAIL", accountEmails: ["user-1@example.com"], orgUnitId: "ou-1" }),
    ).toThrow(/either accounts or an organizational unit/);
  });

  it("refuses a Groups hold over an org unit", () => {
    expect(() => buildHoldScope({ corpus: "GROUPS", orgUnitId: "ou-1" })).toThrow(
      /Groups hold covers accounts/,
    );
  });

  it("refuses a Voice hold with no covered data", () => {
    expect(() => buildHoldQuery("VOICE", {})).toThrow(/needs coveredData/);
  });

  it("refuses a query option that does not apply to the corpus", () => {
    expect(() => buildHoldQuery("DRIVE", { terms: "budget" })).toThrow(
      /does not apply to a DRIVE hold|do not apply to a DRIVE hold/,
    );
  });

  it("updates a hold with a read then a full PUT against its corpus", async () => {
    nock("https://vault.googleapis.com")
      .get("/v1/matters/m1/holds/h1")
      .query(true)
      .reply(200, {
        holdId: "h1",
        name: "Hold on jdoe",
        corpus: "MAIL",
        accounts: [{ accountId: "a1", email: "user-1@example.com" }],
        query: { mailQuery: { terms: "old" } },
      });

    const put = nock("https://vault.googleapis.com")
      .put("/v1/matters/m1/holds/h1", {
        name: "Hold on jdoe",
        corpus: "MAIL",
        accounts: [{ accountId: "a1" }],
        query: { mailQuery: { terms: "new" } },
      })
      .query(true)
      .reply(200, { holdId: "h1", name: "Hold on jdoe", corpus: "MAIL" });

    const result = await service().updateHold("m1", "h1", { query: { terms: "new" } });

    expect(put.isDone()).toBe(true);
    expect(result.previous.query).toEqual({ mailQuery: { terms: "old" } });
  });

  it("refuses to put a Groups hold on an org unit during an update", async () => {
    nock("https://vault.googleapis.com")
      .get("/v1/matters/m1/holds/h3")
      .query(true)
      .reply(200, {
        holdId: "h3",
        corpus: "GROUPS",
        accounts: [{ accountId: "a1" }],
        query: { groupsQuery: { terms: "x" } },
      });

    await expect(
      service().updateHold("m1", "h3", { scope: { orgUnitId: "ou-1" } }),
    ).rejects.toMatchObject({ category: "invalid_request" });
  });

  it("adds and removes held accounts", async () => {
    const add = nock("https://vault.googleapis.com")
      .post("/v1/matters/m1/holds/h1:addHeldAccounts", {
        emails: ["user-2@example.com"],
      })
      .query(true)
      .reply(200, {
        responses: [
          {
            account: { accountId: "a2", email: "user-2@example.com" },
            status: { code: 0 },
          },
        ],
      });

    const removed = nock("https://vault.googleapis.com")
      .post("/v1/matters/m1/holds/h1:removeHeldAccounts", { accountIds: ["a2"] })
      .query(true)
      .reply(200, { statuses: [{ code: 0 }] });

    const added = await service().addHeldAccounts("m1", "h1", {
      emails: ["user-2@example.com"],
    });
    const gone = await service().removeHeldAccounts("m1", "h1", ["a2"]);

    expect(add.isDone()).toBe(true);
    expect(added.added[0]?.email).toBe("user-2@example.com");
    expect(removed.isDone()).toBe(true);
    expect(gone.removed).toEqual([{ code: 0 }]);
  });

  it("deletes a hold", async () => {
    const scope = nock("https://vault.googleapis.com")
      .delete("/v1/matters/m1/holds/h1")
      .query(true)
      .reply(200, { holdId: "h1", name: "Hold on jdoe", corpus: "MAIL" });

    await service().deleteHold("m1", "h1");

    expect(scope.isDone()).toBe(true);
  });
});

describe("saved queries", () => {
  it("creates one with a corpus and derived search method", async () => {
    const scope = nock("https://vault.googleapis.com")
      .post("/v1/matters/m1/savedQueries", {
        displayName: "Mail from jdoe",
        query: {
          corpus: "MAIL",
          terms: "from:user-1@example.com",
          method: "ACCOUNT",
          accountInfo: { emails: ["user-2@example.com"] },
        },
      })
      .query(true)
      .reply(200, {
        savedQueryId: "sq1",
        displayName: "Mail from jdoe",
        query: { corpus: "MAIL" },
      });

    const saved = await service().createSavedQuery("m1", {
      displayName: "Mail from jdoe",
      query: buildQuery({
        corpus: "MAIL",
        terms: "from:user-1@example.com",
        accountEmails: ["user-2@example.com"],
      }),
    });

    expect(scope.isDone()).toBe(true);
    expect(saved.savedQueryId).toBe("sq1");
  });

  it("lists, reads and deletes saved queries", async () => {
    nock("https://vault.googleapis.com")
      .get("/v1/matters/m1/savedQueries")
      .query(true)
      .reply(200, { savedQueries: [{ savedQueryId: "sq1", displayName: "One" }] });
    nock("https://vault.googleapis.com")
      .get("/v1/matters/m1/savedQueries/sq1")
      .query(true)
      .reply(200, { savedQueryId: "sq1", displayName: "One" });
    const deletion = nock("https://vault.googleapis.com")
      .delete("/v1/matters/m1/savedQueries/sq1")
      .query(true)
      .reply(200, {});

    expect((await service().listSavedQueries("m1", {})).items[0]?.displayName).toBe("One");
    expect((await service().getSavedQuery("m1", "sq1")).savedQueryId).toBe("sq1");
    await service().deleteSavedQuery("m1", "sq1");
    expect(deletion.isDone()).toBe(true);
  });

  it("refuses a query with two search entities", () => {
    expect(() =>
      buildQuery({
        corpus: "MAIL",
        accountEmails: ["user-1@example.com"],
        orgUnitId: "ou-1",
      }),
    ).toThrow(/searches one entity/);
  });
});

describe("exports", () => {
  it("creates an export with a query and a per-corpus format", async () => {
    const options = buildExportOptions({ corpus: "MAIL", exportFormat: "MBOX", region: "US" });
    expect(options).toEqual({ region: "US", mailOptions: { exportFormat: "MBOX" } });

    const scope = nock("https://vault.googleapis.com")
      .post("/v1/matters/m1/exports", {
        name: "Export for review",
        query: {
          corpus: "MAIL",
          terms: "subject:budget",
          method: "ACCOUNT",
          accountInfo: { emails: ["user-1@example.com"] },
        },
        exportOptions: { region: "US", mailOptions: { exportFormat: "MBOX" } },
      })
      .query(true)
      .reply(200, { id: "e1", name: "Export for review", status: "IN_PROGRESS" });

    const created = await service().createExport("m1", {
      name: "Export for review",
      query: buildQuery({
        corpus: "MAIL",
        terms: "subject:budget",
        accountEmails: ["user-1@example.com"],
      }),
      exportOptions: options,
    });

    expect(scope.isDone()).toBe(true);
    expect(created.id).toBe("e1");
  });

  it("refuses a format for a corpus that has none", () => {
    expect(() => buildExportOptions({ corpus: "DRIVE", exportFormat: "MBOX" })).toThrow(
      /no exportFormat option/,
    );
  });

  it("polls an export to completion and reports the elapsed time", async () => {
    nock("https://vault.googleapis.com")
      .get("/v1/matters/m1/exports/e1")
      .query(true)
      .reply(200, {
        id: "e1",
        status: "IN_PROGRESS",
        stats: { exportedArtifactCount: "10", totalArtifactCount: "40" },
      });
    nock("https://vault.googleapis.com")
      .get("/v1/matters/m1/exports/e1")
      .query(true)
      .reply(200, {
        id: "e1",
        status: "COMPLETED",
        stats: { exportedArtifactCount: "40", totalArtifactCount: "40" },
      });

    const result = await service().waitForExport("m1", "e1", { maxPolls: 5, delayMs: 1000 });

    expect(result.state).toBe("completed");
    expect(result.polls).toBe(2);
    expect(result.elapsedMs).toBe(1000);
  });

  it("stops at the poll budget without claiming completion", async () => {
    nock("https://vault.googleapis.com")
      .get("/v1/matters/m1/exports/e1")
      .query(true)
      .reply(200, {
        id: "e1",
        status: "IN_PROGRESS",
        stats: { exportedArtifactCount: "10", totalArtifactCount: "40" },
      });

    const result = await service().waitForExport("m1", "e1", { maxPolls: 1, delayMs: 1000 });

    expect(result.state).toBe("running");
    expect(result.export?.status).toBe("IN_PROGRESS");
    expect(result.detail).toContain("10 of 40");
  });

  it("reports a failed export with its identifier", async () => {
    nock("https://vault.googleapis.com")
      .get("/v1/matters/m1/exports/e1")
      .query(true)
      .reply(200, { id: "e1", status: "FAILED" });

    const result = await service().waitForExport("m1", "e1", { maxPolls: 3, delayMs: 0 });

    expect(result.state).toBe("failed");
    expect(result.exportId).toBe("e1");
  });

  it("lists exports and reads one", async () => {
    nock("https://vault.googleapis.com")
      .get("/v1/matters/m1/exports")
      .query(true)
      .reply(200, { exports: [{ id: "e1", status: "IN_PROGRESS" }] });
    nock("https://vault.googleapis.com")
      .get("/v1/matters/m1/exports/e1")
      .query(true)
      .reply(200, { id: "e1", status: "COMPLETED" });

    expect((await service().listExports("m1", {})).items[0]?.status).toBe("IN_PROGRESS");
    expect((await service().getExport("m1", "e1")).status).toBe("COMPLETED");
  });

  it("deletes an export", async () => {
    const scope = nock("https://vault.googleapis.com")
      .delete("/v1/matters/m1/exports/e1")
      .query(true)
      .reply(200, {});

    await service().deleteExport("m1", "e1");

    expect(scope.isDone()).toBe(true);
  });
});

describe("artifact count", () => {
  it("starts a count and polls its operation to completion", async () => {
    const count = nock("https://vault.googleapis.com")
      .post("/v1/matters/m1:count", {
        query: { corpus: "MAIL", terms: "subject:budget" },
      })
      .query(true)
      .reply(200, { name: "operations/count-1" });

    const started = await service().countArtifacts(
      "m1",
      buildQuery({ corpus: "MAIL", terms: "subject:budget" }),
    );
    expect(count.isDone()).toBe(true);
    expect(started.operationName).toBe("operations/count-1");

    nock("https://vault.googleapis.com")
      .get("/v1/operations/count-1")
      .query(true)
      .reply(200, {
        name: "operations/count-1",
        done: true,
        response: { totalCount: "42" },
      });

    const result = await service().waitForOperation("operations/count-1", {
      maxPolls: 3,
      delayMs: 0,
    });

    expect(result.state).toBe("completed");
    expect(result.result).toEqual({ totalCount: "42" });
  });

  it("reports an unfinished operation without claiming success", async () => {
    nock("https://vault.googleapis.com")
      .get("/v1/operations/count-1")
      .query(true)
      .reply(200, { name: "operations/count-1", done: false });

    const result = await service().waitForOperation("operations/count-1", {
      maxPolls: 1,
      delayMs: 0,
    });

    expect(result.state).toBe("running");
  });
});

describe("tool registration", () => {
  it("marks every Vault tool as Enterprise only", () => {
    const specs = vaultTools(service());

    expect(specs.length).toBe(26);
    expect(new Set(specs.map((spec) => spec.name)).size).toBe(specs.length);
    expect(specs.every((spec) => spec.edition === "enterprise")).toBe(true);
  });

  it("gives every destructive tool a confirm note and a confirm argument", () => {
    const specs = vaultTools(service());
    const destructive = specs.filter((spec) => spec.access === "destructive");

    expect(destructive.map((spec) => spec.name).sort()).toEqual([
      "gws_vault_exports_create",
      "gws_vault_exports_delete",
      "gws_vault_holds_delete",
      "gws_vault_holds_remove_accounts",
      "gws_vault_matters_delete",
    ]);
    for (const spec of destructive) {
      expect("confirmNote" in spec ? spec.confirmNote : "").not.toBe("");
      expect(spec.inputShape.confirm).toBeDefined();
    }
  });

  it("runs a tool end to end through its spec", async () => {
    nock("https://vault.googleapis.com")
      .get("/v1/matters")
      .query(true)
      .reply(200, { matters: [{ matterId: "m1", name: "One", state: "OPEN" }] });

    const spec = tool<{
      run: (input: unknown, ctx: { dryRun: boolean }) => Promise<{ summary: string }>;
    }>("gws_vault_matters_list");
    const result = await spec.run({}, { dryRun: false });

    expect(result.summary).toBe("1 matter");
  });
});
