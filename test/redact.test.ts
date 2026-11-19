import { describe, expect, it } from "vitest";
import { isSecretKey, isSecretValue, redact } from "../src/util/redact.js";

describe("redaction", () => {
  it("replaces credential-named fields", () => {
    const out = redact({ access_token: "whatever", nested: { client_secret: "x" } }) as Record<
      string,
      unknown
    >;
    expect(out.access_token).toBe("[redacted]");
    expect((out.nested as Record<string, unknown>).client_secret).toBe("[redacted]");
  });

  it("replaces credential-shaped values in innocuous fields", () => {
    const out = redact({ note: "ya29.a0AfH6SMBexample" }) as Record<string, unknown>;
    expect(out.note).toBe("[redacted]");
  });

  it("keeps ordinary values so the entry stays useful", () => {
    const out = redact({ userKey: "user@example.com", confirm: true }) as Record<string, unknown>;
    expect(out.userKey).toBe("user@example.com");
    expect(out.confirm).toBe(true);
  });

  it("recurses through arrays", () => {
    const out = redact([{ refresh_token: "abc" }, { name: "fine" }]) as Array<
      Record<string, unknown>
    >;
    expect(out[0].refresh_token).toBe("[redacted]");
    expect(out[1].name).toBe("fine");
  });

  it("stops at a depth cap instead of hanging on deep input", () => {
    let deep: Record<string, unknown> = { value: "leaf" };
    for (let i = 0; i < 20; i += 1) deep = { nested: deep };
    expect(JSON.stringify(redact(deep))).toContain("depth-limit");
  });

  it("classifies keys and values", () => {
    expect(isSecretKey("refresh_token")).toBe(true);
    expect(isSecretKey("userKey")).toBe(false);
    expect(isSecretValue("ghp_0123456789abcdefghij")).toBe(true);
    expect(isSecretValue("Engineering")).toBe(false);
  });
});
