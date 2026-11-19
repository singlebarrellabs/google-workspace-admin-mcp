import { describe, expect, it } from "vitest";
import type { AnyToolSpec, ConfirmedToolSpec } from "../src/catalog.js";
import { parseMode, requireConfirm, toolsForMode } from "../src/safety/policy.js";

const read: AnyToolSpec = {
  name: "gws_read_thing",
  surface: "directory",
  access: "read",
  edition: "all",
  description: "read",
  inputShape: {},
  run: async () => ({ summary: "ok" }),
};

const destructive: ConfirmedToolSpec = {
  name: "gws_delete_thing",
  surface: "directory",
  access: "destructive",
  edition: "all",
  description: "delete",
  confirmNote: "the thing is gone",
  inputShape: {},
  run: async () => ({ summary: "ok" }),
};

describe("read-only gate", () => {
  it("keeps read tools and drops mutating ones", () => {
    expect(toolsForMode([read, destructive], "readonly")).toEqual([read]);
  });

  it("keeps everything in write mode", () => {
    expect(toolsForMode([read, destructive], "write")).toHaveLength(2);
  });
});

describe("confirm gate", () => {
  it("refuses a destructive tool without confirmation and names the effect", () => {
    expect(() => requireConfirm(destructive, {})).toThrow(/the thing is gone/);
  });

  it("allows a destructive tool with confirm true", () => {
    expect(() => requireConfirm(destructive, { confirm: true })).not.toThrow();
  });

  it("ignores confirm on read tools", () => {
    expect(() => requireConfirm(read, {})).not.toThrow();
  });
});

describe("mode parsing", () => {
  it("defaults to read-only", () => {
    expect(parseMode(undefined)).toBe("readonly");
    expect(parseMode("")).toBe("readonly");
  });

  it("accepts write", () => {
    expect(parseMode("write")).toBe("write");
  });

  it("rejects anything else instead of guessing", () => {
    expect(() => parseMode("write ")).toThrow();
  });
});
