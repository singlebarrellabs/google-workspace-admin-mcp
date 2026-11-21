import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_SCOPES, assertAdminOnlyScopes } from "../src/auth/config.js";
import { extractScopeBlock, renderScopeBlock, replaceScopeBlock } from "../src/docs/scopes.js";
import { classifyError, resolveCheckArgs, SMOKE_CHECKS } from "../src/smoke/checks.js";
import {
  assertDomainAllowlisted,
  assertNotCi,
  assertRawAllowed,
  assertReportLocation,
  assertWriteSandbox,
  parseAllowlist,
  resolveTenantDomain,
  SmokeRefusal,
} from "../src/smoke/guards.js";
import { Redactor } from "../src/smoke/redact.js";
import { findLeaks, renderJson, renderMarkdown, writeReports } from "../src/smoke/report.js";
import { diffShapes, shapeOf } from "../src/smoke/shape.js";

describe("redaction", () => {
  it("gives the same value the same placeholder throughout a run", () => {
    const redactor = new Redactor("acme.example");

    const first = redactor.data({ primaryEmail: "jane.doe@acme.example" });
    const second = redactor.data({ owner: "jane.doe@acme.example" });

    expect((first as { primaryEmail: string }).primaryEmail).toBe("user-1@example.com");
    expect((second as { owner: string }).owner).toBe("user-1@example.com");
  });

  it("keeps enums, numbers, booleans and dates because they carry no identity", () => {
    const redactor = new Redactor("acme.example");

    expect(
      redactor.data({
        state: "OPEN",
        count: 42,
        suspended: false,
        createTime: "2026-11-20T10:00:00Z",
        kind: "admin#directory#user",
      }),
    ).toEqual({
      state: "OPEN",
      count: 42,
      suspended: false,
      createTime: "2026-11-20T10:00:00Z",
      kind: "admin#directory#user",
    });
  });

  it("keeps structure-bearing strings readable", () => {
    const redactor = new Redactor("acme.example");

    expect(
      redactor.data({
        scopes: ["https://www.googleapis.com/auth/ediscovery"],
        editionCapability: { source: "probe", state: "unknown", detail: "not probed" },
        tokenPath: ["", "Users", "someone", ".local/state/token.json"].join("/"),
      }),
    ).toEqual({
      scopes: ["https://www.googleapis.com/auth/ediscovery"],
      editionCapability: { source: "probe", state: "unknown", detail: "not probed" },
      tokenPath: "path-1/.local/state/token.json",
    });
  });

  it("redacts identifiers, names and the tenant domain", () => {
    const redactor = new Redactor("acme.example");
    const out = redactor.data({
      matterId: "a1b2c3d4e5f6",
      displayName: "Case 2026-014",
      orgUnitPath: "/Engineering",
      customerDomain: "acme.example",
    }) as Record<string, string>;

    expect(out.matterId).toBe("matter-id-1");
    expect(out.displayName).toBe("text-1");
    expect(out.orgUnitPath).toBe("text-2");
    expect(out.customerDomain).toBe("domain-1");
  });

  it("redacts an email wherever it appears in free text", () => {
    const redactor = new Redactor("acme.example");
    const text = redactor.text("user jane.doe@acme.example was suspended by admin@acme.example");

    expect(text).not.toContain("acme.example");
    expect(text).toContain("user-1@example.com");
    expect(text).toContain("user-2@example.com");
  });

  it("leaves placeholders alone when redaction runs twice", () => {
    const redactor = new Redactor("acme.example");
    const once = redactor.data({ primaryEmail: "jane.doe@acme.example" }) as {
      primaryEmail: string;
    };
    const twice = redactor.data(once) as { primaryEmail: string };

    expect(twice.primaryEmail).toBe("user-1@example.com");
  });
});

describe("shape drift", () => {
  it("records types and key presence only", () => {
    const shape = shapeOf({ users: [{ primaryEmail: "x@example.com", suspended: false }] });

    expect(shape).toEqual({
      kind: "object",
      fields: {
        users: {
          kind: "array",
          items: {
            kind: "object",
            fields: {
              primaryEmail: { kind: "string" },
              suspended: { kind: "boolean" },
            },
          },
        },
      },
    });
  });

  it("reports a missing, an unexpected and a changed field by path", () => {
    const expected = shapeOf({ user: { primaryEmail: "x@example.com", suspended: false } });
    const observed = shapeOf({ user: { primaryEmail: "y@example.com", isAdmin: true } });

    const drift = diffShapes(expected, observed);

    expect(drift).toEqual(
      expect.arrayContaining([
        { path: "data.user.suspended", expected: "boolean", observed: "absent" },
        { path: "data.user.isAdmin", expected: "absent", observed: "boolean" },
      ]),
    );
  });

  it("treats a null optional field as optionality, not drift", () => {
    const expected = shapeOf({ description: "kept" });
    const observed = shapeOf({ description: null });

    expect(diffShapes(expected, observed)).toEqual([]);
  });

  it("merges array element shapes so a mixed array still shows both fields", () => {
    const shape = shapeOf([{ a: "x" }, { b: 1 }]);

    expect(shape).toEqual({
      kind: "array",
      items: {
        kind: "object",
        fields: { a: { kind: "string" }, b: { kind: "number" } },
      },
    });
  });
});

describe("guards", () => {
  it("refuses in CI", () => {
    expect(() => assertNotCi({ CI: "true" })).toThrow(SmokeRefusal);
    expect(() => assertNotCi({ GITHUB_ACTIONS: "true" })).toThrow(/pipeline/i);
    expect(() => assertNotCi({})).not.toThrow();
  });

  it("requires an allowlist before touching a tenant", () => {
    expect(parseAllowlist(" acme.example , beta.example ")).toEqual([
      "acme.example",
      "beta.example",
    ]);
    expect(() => assertDomainAllowlisted("acme.example", [])).toThrow(/SMOKE_ALLOWED_DOMAINS/);
    expect(() => assertDomainAllowlisted("other.example", ["acme.example"])).toThrow(
      /not in SMOKE_ALLOWED_DOMAINS/,
    );
    expect(() => assertDomainAllowlisted("acme.example", ["acme.example"])).not.toThrow();
  });

  it("accepts the sandbox as a signed-in tenant without allowlisting production", () => {
    expect(() =>
      assertDomainAllowlisted("sandbox.example", ["acme.example"], "sandbox.example"),
    ).not.toThrow();
  });

  it("refuses a write run without a sandbox distinct from production", () => {
    expect(() => assertWriteSandbox({}, [], true)).toThrow(/SMOKE_WRITE/);
    expect(() => assertWriteSandbox({ SMOKE_WRITE: "1" }, [], true)).toThrow(
      /SMOKE_SANDBOX_DOMAIN/,
    );
    expect(() =>
      assertWriteSandbox(
        { SMOKE_WRITE: "1", SMOKE_SANDBOX_DOMAIN: "acme.example" },
        ["acme.example"],
        true,
      ),
    ).toThrow(/production/);
    expect(
      assertWriteSandbox(
        { SMOKE_WRITE: "1", SMOKE_SANDBOX_DOMAIN: "sandbox.example" },
        ["acme.example"],
        true,
      ),
    ).toEqual({ sandboxDomain: "sandbox.example" });
  });

  it("refuses raw output without a terminal", () => {
    expect(() => assertRawAllowed({}, false)).toThrow(/interactive terminal/);
    expect(() => assertRawAllowed({ CI: "true" }, true)).toThrow(/CI/);
    expect(() => assertRawAllowed({}, true)).not.toThrow();
  });

  it("refuses to run when reports are not gitignored", () => {
    expect(() => assertReportLocation("node_modules\n")).toThrow(/not gitignored/);
    expect(() => assertReportLocation("node_modules\n.smoke/\n")).not.toThrow();
  });

  it("refuses a declared domain that disagrees with the tenant", () => {
    const mismatch = (() => {
      try {
        resolveTenantDomain({ SMOKE_TENANT_DOMAIN: "a.example" }, "b.example");
        return undefined;
      } catch (error) {
        return error as SmokeRefusal;
      }
    })();
    expect(mismatch?.code).toBe("domain_mismatch");
    expect(resolveTenantDomain({}, "b.example")).toBe("b.example");
    expect(() => resolveTenantDomain({}, undefined)).toThrow(/could not be established/);
  });
});

describe("checks", () => {
  it("maps edition and permission rejections to a tenant fact, not a failure", () => {
    expect(classifyError("edition_unavailable")).toBe("unavailable");
    expect(classifyError("permission_denied")).toBe("denied");
    expect(classifyError("unknown")).toBe("error");
    expect(classifyError(undefined)).toBe("error");
  });

  it("substitutes environment values and names what is missing", () => {
    const withGroup = SMOKE_CHECKS.find((check) => check.id === "groups-settings");
    if (!withGroup) throw new Error("groups check missing");

    expect(resolveCheckArgs(withGroup, { SMOKE_GROUP: "team@example.com" })).toEqual({
      args: { groupEmail: "team@example.com" },
    });
    expect(resolveCheckArgs(withGroup, {})).toEqual({ missing: ["SMOKE_GROUP"] });
  });

  it("has unique ids and one check per surface except passthrough", () => {
    const ids = SMOKE_CHECKS.map((check) => check.id);
    const surfaces = new Set(SMOKE_CHECKS.map((check) => check.surface));

    expect(new Set(ids).size).toBe(ids.length);
    expect(surfaces).toEqual(
      new Set([
        "system",
        "directory",
        "reports",
        "vault",
        "cloud-search",
        "transfer",
        "licensing",
        "resources",
        "groups-settings",
      ]),
    );
  });
});

describe("report", () => {
  const run = {
    startedAt: "2026-11-20T10:00:00Z",
    finishedAt: "2026-11-20T10:00:05Z",
    mode: "read" as const,
    checks: [
      {
        id: "directory-users",
        surface: "directory",
        tool: "gws_users_list",
        status: "ok" as const,
        durationMs: 120,
      },
    ],
  };

  it("finds leaks without repeating the leaked value", () => {
    const leaks = findLeaks(
      '{"owner":"someone@real-tenant.example","domain":"acme.example"}',
      "acme.example",
    );

    expect(leaks).toContain("an email address that is not a placeholder");
    expect(leaks).toContain("the tenant domain");
    expect(leaks.join(" ")).not.toContain("real-tenant");
    expect(leaks.join(" ")).not.toContain("someone@");
  });

  it("allows a report made only of placeholders", () => {
    expect(findLeaks('{"email":"user-1@example.com"}', "acme.example")).toEqual([]);
  });

  it("writes owner-only files into a fresh directory", () => {
    const root = mkdtempSync(join(tmpdir(), "smoke-report-"));

    const written = writeReports(root, run, "acme.example", "2026-11-20T10:00:00Z");

    expect(statSync(written.directory).mode & 0o777).toBe(0o700);
    expect(statSync(written.jsonPath).mode & 0o777).toBe(0o600);
    expect(statSync(written.markdownPath).mode & 0o777).toBe(0o600);
    expect(readFileSync(written.markdownPath, "utf8")).toContain("directory-users");
  });

  it("writes nothing when a rendered report still contains a leak", () => {
    const root = mkdtempSync(join(tmpdir(), "smoke-leak-"));
    const leaked = {
      ...run,
      checks: [
        {
          ...run.checks[0],
          note: "contact someone@real-tenant.example",
        },
      ],
    };

    expect(() => writeReports(root, leaked, "acme.example", "2026-11-20T10:00:00Z")).toThrow(
      SmokeRefusal,
    );
    expect(renderJson(leaked)).toContain("someone@real-tenant.example");
    expect(renderMarkdown(run)).not.toContain("@");
  });
});

describe("documented scopes", () => {
  it("match ADMIN_SCOPES exactly", () => {
    const markdown = readFileSync("docs/SETUP.md", "utf8");

    expect(extractScopeBlock(markdown)).toBe(renderScopeBlock(ADMIN_SCOPES));
  });

  it("replaces only the generated block", () => {
    const markdown = `# Docs\n\n${renderScopeBlock(["scope-a"])}\n\nTail\n`;

    expect(replaceScopeBlock(markdown, ["scope-b"])).toBe(
      `# Docs\n\n${renderScopeBlock(["scope-b"])}\n\nTail\n`,
    );
  });

  it("never requests a user-content scope", () => {
    expect(() => assertAdminOnlyScopes([...ADMIN_SCOPES])).not.toThrow();
  });
});
