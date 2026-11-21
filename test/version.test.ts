import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VERSION } from "../src/version.js";

describe("reported version", () => {
  it("matches the package manifest instead of a copied literal", () => {
    const manifest = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };

    expect(VERSION).toBe(manifest.version);
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
