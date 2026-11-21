import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_SCOPES } from "../src/auth/config.js";

const snapshot = JSON.parse(readFileSync(join("docs", "api", "scopes.json"), "utf8")) as Record<
  string,
  string[]
>;

const published = new Set(Object.values(snapshot).flat());

describe("requested scopes against the published API documents", () => {
  it("requests only scopes an enabled API actually publishes", () => {
    const unknown = ADMIN_SCOPES.filter((scope) => !published.has(scope));

    expect(unknown).toEqual([]);
  });

  it("does not request a scope Google refuses to a user token", () => {
    // Alert Center publishes apps.alerts but requires a service account with
    // domain-wide delegation; requesting it fails the entire consent.
    expect(ADMIN_SCOPES).not.toContain("https://www.googleapis.com/auth/apps.alerts");
  });

  it("uses the Groups Settings scope the API publishes", () => {
    expect(snapshot.groupssettings).toContain(
      "https://www.googleapis.com/auth/apps.groups.settings",
    );
    expect(ADMIN_SCOPES).toContain("https://www.googleapis.com/auth/apps.groups.settings");
  });

  it("has a snapshot for every API the surfaces call", () => {
    expect(Object.keys(snapshot).sort()).toEqual([
      "admin",
      "alertcenter",
      "cloudsearch",
      "datatransfer",
      "groupssettings",
      "licensing",
      "reports",
      "vault",
    ]);
    for (const [api, scopes] of Object.entries(snapshot)) {
      expect(scopes.length, `${api} has no scopes`).toBeGreaterThan(0);
    }
  });
});
