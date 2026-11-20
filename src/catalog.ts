import type { ZodRawShape } from "zod";

export type Surface =
  | "directory"
  | "reports"
  | "vault"
  | "cloud-search"
  | "transfer"
  | "licensing"
  | "groups-settings"
  | "resources"
  | "system";

export type Access = "read" | "write" | "destructive";

export type Edition = "all" | "enterprise";

export interface ToolResult {
  summary: string;
  data?: unknown;
  /**
   * Effective access for a tool that can do both, such as passthrough. The
   * audit log records this instead of the registration class.
   */
  access?: Access;
}

export interface ToolContext {
  dryRun: boolean;
}

export interface ToolSpec {
  name: string;
  surface: Surface;
  access: Access;
  edition: Edition;
  description: string;
  inputShape: ZodRawShape;
  run: (input: unknown, ctx: ToolContext) => Promise<ToolResult>;
}

// A destructive tool must describe what it makes irreversible. The union below
// makes a destructive spec without a confirm note impossible to write.
export type ConfirmedToolSpec = ToolSpec & {
  access: "destructive";
  confirmNote: string;
};

export type AnyToolSpec = ToolSpec | ConfirmedToolSpec;

export function isConfirmed(spec: AnyToolSpec): spec is ConfirmedToolSpec {
  return spec.access === "destructive";
}

export function isMutating(spec: AnyToolSpec): boolean {
  return spec.access !== "read";
}
