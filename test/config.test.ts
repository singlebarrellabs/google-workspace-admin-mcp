import { describe, expect, it } from "vitest";
import { ADMIN_SCOPES, assertAdminOnlyScopes, loadConfig } from "../src/auth/config.js";
import {
  ALLOWLIST,
  assertAllowlistClassified,
  permittedMethods,
} from "../src/passthrough/allowlist.js";

describe("scope set", () => {
  it("contains no user-content scope", () => {
    expect(() => assertAdminOnlyScopes([...ADMIN_SCOPES])).not.toThrow();
  });

  it("rejects a Gmail scope", () => {
    expect(() => assertAdminOnlyScopes(["https://www.googleapis.com/auth/gmail.readonly"])).toThrow(
      /non-goal/,
    );
  });

  it("rejects a Drive scope", () => {
    expect(() => assertAdminOnlyScopes(["https://www.googleapis.com/auth/drive"])).toThrow();
  });

  it("accepts the admin resource-calendar scope", () => {
    expect(() =>
      assertAdminOnlyScopes(["https://www.googleapis.com/auth/admin.directory.resource.calendar"]),
    ).not.toThrow();
  });
});

describe("config defaults", () => {
  it("defaults to read-only with passthrough off", () => {
    const config = loadConfig({});
    expect(config.mode).toBe("readonly");
    expect(config.passthrough).toBe(false);
  });

  it("enables write mode only on the exact value", () => {
    expect(loadConfig({ GWS_MODE: "write" }).mode).toBe("write");
    expect(loadConfig({ GWS_MODE: "Write" }).mode).toBe("readonly");
  });
});

describe("passthrough allowlist", () => {
  it("classifies every entry", () => {
    expect(() => assertAllowlistClassified(ALLOWLIST)).not.toThrow();
  });

  it("rejects an unclassified entry", () => {
    const bad = [{ api: "directory", method: "users.delete", access: "mystery" }] as never;
    expect(() => assertAllowlistClassified(bad)).toThrow(/classification/);
  });

  it("lists permitted methods per API and nothing else", () => {
    expect(permittedMethods("directory")).toContain("users.list");
    expect(permittedMethods("nope")).toEqual([]);
  });
});
