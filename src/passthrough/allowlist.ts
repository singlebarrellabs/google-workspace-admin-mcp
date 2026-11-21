export interface AllowlistedMethod {
  api: string;
  method: string;
  access: "read" | "write";
}

/**
 * Every method reachable through the passthrough tool. Adding a method means
 * classifying it; there is no wildcard and no inference.
 */
export const ALLOWLIST: AllowlistedMethod[] = [
  { api: "directory", method: "users.list", access: "read" },
  { api: "directory", method: "users.get", access: "read" },
  { api: "directory", method: "groups.list", access: "read" },
  { api: "directory", method: "orgunits.list", access: "read" },
  { api: "reports", method: "activities.list", access: "read" },
  { api: "vault", method: "matters.list", access: "read" },
  { api: "transfer", method: "transfers.list", access: "read" },
];

export function findMethod(api: string, method: string): AllowlistedMethod | undefined {
  return ALLOWLIST.find((entry) => entry.api === api && entry.method === method);
}

export function permittedMethods(api: string): string[] {
  return ALLOWLIST.filter((entry) => entry.api === api).map((entry) => entry.method);
}

export function assertAllowlistClassified(entries: AllowlistedMethod[] = ALLOWLIST): void {
  const unclassified = entries.filter(
    (entry) => entry.access !== "read" && entry.access !== "write",
  );
  if (unclassified.length > 0) {
    throw new Error(
      `Passthrough entries without a read/write classification: ${unclassified
        .map((e) => `${e.api}.${e.method}`)
        .join(", ")}`,
    );
  }
}
