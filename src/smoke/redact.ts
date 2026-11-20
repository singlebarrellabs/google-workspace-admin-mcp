const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const HOME_PATH = /\/(?:Users|home)\/[^\s"'/]+/g;

const ENUM_LIKE = /^[A-Z][A-Z0-9_]*$/;
const NUMBER_LIKE = /^-?\d+(\.\d+)?$/;
const BOOLEAN_LIKE = /^(true|false)$/;
const DATE_LIKE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z?([+-]\d{2}:\d{2})?)?$/;
const API_CONSTANT = /^[a-z][a-z0-9]*#[A-Za-z0-9#._]+$/;

const ID_KEY = /(^|[._])(id|ids|[a-z]+Id|etag|selfLink)$/i;
const EMAIL_KEY = /email/i;
const TEXT_KEY =
  /(name|description|title|subject|summary|snippet|text|orgUnitPath|customerDomain|domain)/i;

/**
 * Replaces tenant values with stable placeholders. Stability matters: a report
 * is diagnosable only if `user-1` is the same account everywhere in it.
 */
export class Redactor {
  private readonly places = new Map<string, string>();
  private readonly counts = new Map<string, number>();

  constructor(private readonly tenantDomain?: string) {}

  /** Targeted redaction for free text such as an error message. */
  text(value: string): string {
    // Emails go first: redacting the domain first would turn an address into
    // "user@domain-1", which is no longer recognisable as an email.
    let out = value.replace(EMAIL, (match) =>
      isPlaceholderEmail(match) ? match : this.placeholder("email", match),
    );

    if (this.tenantDomain) {
      out = out.replace(new RegExp(escapeRegExp(this.tenantDomain), "gi"), () =>
        this.placeholder("domain", this.tenantDomain ?? ""),
      );
    }

    out = out.replace(HOME_PATH, (match) => this.placeholder("path", match));

    return out;
  }

  /** Structural redaction for a tool's `data` payload. */
  data(value: unknown, key = ""): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value === "number" || typeof value === "boolean") return value;

    if (typeof value === "string") return this.string(value, key);
    if (Array.isArray(value)) return value.map((item) => this.data(item, key));

    if (typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
        out[childKey] = this.data(child, childKey);
      }
      return out;
    }

    return "[unprintable]";
  }

  private string(value: string, key: string): string {
    if (value.includes("@") && value.match(EMAIL)) {
      return value.replace(EMAIL, (match) =>
        isPlaceholderEmail(match) ? match : this.placeholder("email", match),
      );
    }

    if (this.tenantDomain && value.toLowerCase().includes(this.tenantDomain.toLowerCase())) {
      return this.text(value);
    }

    if (key && EMAIL_KEY.test(key)) return this.placeholder("email", value);
    if (key && ID_KEY.test(key)) return this.placeholder(idKind(key), value);
    if (key && TEXT_KEY.test(key)) return this.placeholder("text", value);

    if (
      ENUM_LIKE.test(value) ||
      NUMBER_LIKE.test(value) ||
      BOOLEAN_LIKE.test(value) ||
      DATE_LIKE.test(value) ||
      API_CONSTANT.test(value)
    ) {
      return value;
    }

    // Anything else is not identity by itself: keep it readable, but still scrub
    // an email, the tenant domain or a home path that appears inside it. The
    // pre-write leak scan is the backstop if this misses something.
    return this.text(value);
  }

  private placeholder(kind: string, value: string): string {
    const cacheKey = `${kind}\u0000${value.toLowerCase()}`;
    const existing = this.places.get(cacheKey);
    if (existing) return existing;

    const count = (this.counts.get(kind) ?? 0) + 1;
    this.counts.set(kind, count);
    const label = kind === "email" ? `user-${count}@example.com` : `${kind}-${count}`;
    this.places.set(cacheKey, label);
    return label;
  }
}

function idKind(key: string): string {
  const bare = key
    .replace(/s$/, "")
    .replace(/Id$/, "")
    .replace(/([A-Z])/g, "-$1")
    .toLowerCase();
  return bare.length > 0 ? `${bare}-id` : "resource-id";
}

function isPlaceholderEmail(value: string): boolean {
  return value.toLowerCase().endsWith("@example.com");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
