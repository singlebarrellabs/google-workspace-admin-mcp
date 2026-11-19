const SECRET_KEY =
  /(token|secret|password|authorization|cookie|credential|api[_-]?key|private[_-]?key|access[_-]?key)|^key$/i;
const SECRET_VALUE = /^(ya29\.|1\/\/|AIza|ghp_|github_pat_|sk-|xox[baprs]-)|^[A-Za-z0-9_-]{32,}$/;

/** Fields whose names say they carry credentials. */
export function isSecretKey(key: string): boolean {
  return SECRET_KEY.test(key);
}

/** Values that look like credentials regardless of the field they arrived in. */
export function isSecretValue(value: string): boolean {
  return SECRET_VALUE.test(value);
}

export const REDACTED = "[redacted]";

/**
 * Replaces credential-shaped values, keeping the structure of the payload so an
 * audit entry stays diagnosable. Depth is capped so a cyclic or runaway object
 * cannot hang the caller.
 */
export function redact(input: unknown, depth = 0): unknown {
  if (depth > 8) return "[depth-limit]";
  if (input === null || input === undefined) return input;

  if (typeof input === "string") {
    return isSecretValue(input) ? REDACTED : input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => redact(item, depth + 1));
  }

  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      out[key] = isSecretKey(key) ? REDACTED : redact(value, depth + 1);
    }
    return out;
  }

  return input;
}
