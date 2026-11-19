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

  const entitlement =
    why.some((r) => r === "accessNotConfigured" || r === "forbidden") &&
    Boolean(surface && ENTERPRISE_SURFACES.has(surface));

  if (entitlement || (status === 403 && isEditionText(detail))) {
    return new ToolError(
      "edition_unavailable",
      `${surface} requires Google Workspace Enterprise or Education. This tenant does not have it.`,
      "Use the Vault or Cloud Search tools only on an Enterprise or Education tenant; see docs/SETUP.md.",
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
  return /edition|entitlement|not available for your|requires google workspace/i.test(text);
}
