import { describe, expect, it } from "vitest";
import { mapGoogleError } from "../src/util/errors.js";

function googleError(status: number, reason: string, message: string) {
  return {
    response: { status, data: { error: { code: status, message, errors: [{ reason, message }] } } },
    message,
  };
}

describe("error mapping", () => {
  it("treats an entitlement rejection on Vault as an edition problem", () => {
    const err = mapGoogleError(googleError(403, "forbidden", "Vault is not available"), "vault");
    expect(err.category).toBe("edition_unavailable");
    expect(err.message).toContain("Enterprise");
  });

  it("uses the product name in an edition message", () => {
    const err = mapGoogleError(
      googleError(403, "forbidden", "Customer does not have Vault installed."),
      "vault",
    );

    expect(err.message).toContain("Google Vault");
  });

  it("treats a 403 on Directory as a permission problem", () => {
    const err = mapGoogleError(googleError(403, "forbidden", "Not Authorized"), "directory");
    expect(err.category).toBe("permission_denied");
    expect(err.nextStep).toContain("admin role");
  });

  it("maps 404", () => {
    expect(mapGoogleError(googleError(404, "notFound", "Resource Not Found")).category).toBe(
      "not_found",
    );
  });

  it("maps 429 with the retry hint", () => {
    const err = mapGoogleError(googleError(429, "rateLimitExceeded", "Too many requests"));
    expect(err.category).toBe("rate_limited");
    expect(err.nextStep).toMatch(/retry/i);
  });

  it("maps 400 to invalid_request", () => {
    expect(mapGoogleError(googleError(400, "badRequest", "Bad Request")).category).toBe(
      "invalid_request",
    );
  });

  it("passes through a ToolError unchanged", () => {
    const original = mapGoogleError(new Error("boom"));
    expect(mapGoogleError(original)).toBe(original);
  });

  it("does not claim not_found for an unknown failure", () => {
    expect(mapGoogleError(new Error("socket hang up")).category).toBe("unknown");
  });
});
