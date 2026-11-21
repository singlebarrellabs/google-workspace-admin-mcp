export type ErrorCategory =
  | "edition_unavailable"
  | "permission_denied"
  | "not_found"
  | "rate_limited"
  | "auth_required"
  | "invalid_request"
  | "unknown";

export class ToolError extends Error {
  readonly category: ErrorCategory;
  readonly nextStep?: string;

  constructor(category: ErrorCategory, message: string, nextStep?: string) {
    super(message);
    this.name = "ToolError";
    this.category = category;
    this.nextStep = nextStep;
  }

  toJSON(): { category: ErrorCategory; message: string; nextStep?: string } {
    return {
      category: this.category,
      message: this.message,
      ...(this.nextStep ? { nextStep: this.nextStep } : {}),
    };
  }
}

interface GoogleErrorShape {
  response?: {
    status?: number;
    data?: {
      error?:
        | string
        | {
            code?: number;
            message?: string;
            errors?: Array<{ reason?: string; message?: string }>;
          };
    };
  };
  code?: number;
  message?: string;
}

const ENTERPRISE_SURFACES = new Set(["vault", "cloud-search"]);

function reasons(err: GoogleErrorShape): string[] {
  const body = err.response?.data?.error;
  if (typeof body === "string") return [body];
  return (body?.errors ?? []).map((e) => e.reason ?? "").filter(Boolean);
}

function statusOf(err: GoogleErrorShape): number | undefined {
  const body = err.response?.data?.error;
  const fromBody = typeof body === "object" ? body?.code : undefined;
  return err.response?.status ?? err.code ?? fromBody;
}

/**
 * Maps a googleapis/gaxios failure to an actionable category. `surface` lets an
 * entitlement rejection on Vault or Cloud Search read as an edition problem
 * rather than a permission problem.
 */
export function mapGoogleError(error: unknown, surface?: string): ToolError {
  if (error instanceof ToolError) return error;

  const err = (error ?? {}) as GoogleErrorShape;
  const status = statusOf(err);
  const why = reasons(err);
  const detail = err.message ?? "";

  const enterpriseSurface = Boolean(surface && ENTERPRISE_SURFACES.has(surface));

  // Entitlement is judged on the message: Vault answers a tenant without it
  // with "Customer does not have Vault installed", and a missing privilege with
  // a permission message. The reason code is "forbidden" for both.
  const entitlement = enterpriseSurface && status === 403 && isEditionText(detail);

  if (entitlement) {
    return new ToolError(
      "edition_unavailable",
      `${surface} requires Google Workspace Enterprise or Education. This tenant does not have it.`,
      surface === "vault"
        ? "Use the directory or reports tools for the same task; Vault is only on Enterprise or Education."
        : "Use the Cloud Search tools only on an Enterprise or Education tenant; see docs/SETUP.md.",
    );
  }

  // A disabled API is a project setting, not an edition problem. The edition
  // probe asks for this reason first so it reports "unknown" rather than
  // "not enterprise".
  if (why.includes("accessNotConfigured")) {
    return new ToolError(
      "invalid_request",
      `The ${surface} API is not enabled in this Cloud project: ${detail || "accessNotConfigured"}.`,
      "Enable the API in the Google Cloud console, then retry.",
    );
  }

  if (status === 403) {
    return new ToolError(
      "permission_denied",
      `The signed-in administrator is not allowed to do this: ${detail || "permission denied"}.`,
      "Grant the required admin role or Vault privilege, then retry.",
    );
  }

  if (status === 404) {
    return new ToolError("not_found", detail || "The requested resource does not exist.");
  }

  if (status === 429) {
    return new ToolError(
      "rate_limited",
      "Google rate-limited the request.",
      "Wait for the retry delay reported by the API, then retry.",
    );
  }

  if (status === 400) {
    return new ToolError("invalid_request", detail || "Google rejected the request as invalid.");
  }

  return new ToolError("unknown", detail || "The API call failed for an unclassified reason.");
}

function isEditionText(text: string): boolean {
  return /edition|entitlement|not available|requires google workspace|not installed|does not have .*installed|must be enabled|is not enabled for/i.test(
    text,
  );
}
