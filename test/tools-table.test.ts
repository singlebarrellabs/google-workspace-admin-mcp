import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadToolSpecs, missingRows, parseToolsTable, readToolsTable } from "../src/docs/tools.js";

describe("tool table", () => {
  it("has a row for every registered tool, with matching surface and gate", async () => {
    const specs = await loadToolSpecs(join("src", "tools"));
    const rows = readToolsTable(join("docs", "TOOLS.md"));

    expect(specs.length).toBeGreaterThan(0);
    expect(missingRows(specs, rows)).toEqual([]);
  });

  it("reads name, surface and mutating flag from a row", () => {
    const rows = parseToolsTable(
      [
        "| Tool | Surface | Mutating | Notes |",
        "| --- | --- | --- | --- |",
        "| `gws_users_list` | directory | no | Pages users. |",
        "| `gws_users_suspend` | directory | yes | Destructive. |",
        "not a row",
      ].join("\n"),
    );

    expect(rows).toEqual([
      { name: "gws_users_list", surface: "directory", mutating: false },
      { name: "gws_users_suspend", surface: "directory", mutating: true },
    ]);
  });

  it("names a missing row, a wrong surface and a wrong gate", () => {
    const specs = [
      { name: "gws_a", surface: "directory", access: "read" },
      { name: "gws_b", surface: "reports", access: "write" },
      { name: "gws_c", surface: "vault", access: "read" },
    ] as never;

    const problems = missingRows(specs, [
      { name: "gws_a", surface: "reports", mutating: false },
      { name: "gws_b", surface: "reports", mutating: false },
    ]);

    expect(problems).toEqual([
      "gws_a says surface directory, the table says reports",
      "gws_b is write, the table says mutating: no",
      "gws_c is registered but has no row in docs/TOOLS.md",
    ]);
  });
});
