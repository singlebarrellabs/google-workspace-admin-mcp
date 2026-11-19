import type { AnyToolSpec } from "../catalog.js";
import { isMutating } from "../catalog.js";
import { ToolError } from "../util/errors.js";

export type Mode = "readonly" | "write";

/**
 * Read-only mode omits mutating tools at registration time. A tool that is not
 * registered cannot be called, so a model cannot argue its way into it.
 */
export function toolsForMode(specs: AnyToolSpec[], mode: Mode): AnyToolSpec[] {
  return mode === "write" ? specs : specs.filter((spec) => !isMutating(spec));
}

/**
 * Destructive tools need an explicit confirm argument. Without it, no API call
 * happens and the caller learns exactly what confirming would do.
 */
export function requireConfirm(spec: AnyToolSpec, input: Record<string, unknown>): void {
  if (spec.access !== "destructive") return;

  if (input.confirm === true) return;

  const note = "confirmNote" in spec ? spec.confirmNote : "This operation cannot be undone.";
  throw new ToolError(
    "invalid_request",
    `${spec.name} is irreversible: ${note}`,
    "Call again with confirm: true after checking the target.",
  );
}

export function parseMode(value: string | undefined): Mode {
  if (!value || value === "readonly" || value === "read-only") return "readonly";
  if (value === "write") return "write";
  throw new ToolError(
    "invalid_request",
    `GWS_MODE must be "readonly" or "write", got "${value}".`,
    "Unset it to keep the default read-only mode.",
  );
}
