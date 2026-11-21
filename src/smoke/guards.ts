/**
 * Hard refusals for smoke runs. Each guard throws rather than warning: a smoke
 * run that continues past a failed guard is the leak the guard exists to stop.
 */

export class SmokeRefusal extends Error {
  readonly code: string;
  readonly nextStep?: string;

  constructor(code: string, message: string, nextStep?: string) {
    super(message);
    this.name = "SmokeRefusal";
    this.code = code;
    this.nextStep = nextStep;
  }
}

const CI_VARIABLES = [
  "CI",
  "GITHUB_ACTIONS",
  "GITLAB_CI",
  "BUILDKITE",
  "CIRCLECI",
  "TRAVIS",
  "TF_BUILD",
  "JENKINS_URL",
  "TEAMCITY_VERSION",
] as const;

/** A pipeline must never hold a tenant credential, so it never runs smoke. */
export function assertNotCi(env: NodeJS.ProcessEnv = process.env): void {
  const found = CI_VARIABLES.filter((name) => {
    const value = env[name];
    return value !== undefined && value !== "" && value !== "0" && value !== "false";
  });

  if (found.length > 0) {
    throw new SmokeRefusal(
      "ci_environment",
      `Refusing to run smoke inside CI (${found.join(", ")} is set). No pipeline holds a tenant credential.`,
      "Run smoke on the operator's machine, or on a schedule there.",
    );
  }
}

export function parseAllowlist(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

/**
 * The signed-in tenant must be one the operator has explicitly allowed. A
 * write run signs in to the sandbox instead, which is kept out of the
 * production allowlist on purpose.
 */
export function assertDomainAllowlisted(
  domain: string,
  allowlist: string[],
  sandboxDomain?: string,
): void {
  if (allowlist.length === 0) {
    throw new SmokeRefusal(
      "allowlist_missing",
      "SMOKE_ALLOWED_DOMAINS is not set, so no tenant is allowed to be touched.",
      "Set it in the gitignored .env.smoke file to the domain you are testing.",
    );
  }

  const normalised = domain.trim().toLowerCase();
  if (sandboxDomain && normalised === sandboxDomain.trim().toLowerCase()) return;
  if (!allowlist.includes(normalised)) {
    throw new SmokeRefusal(
      "domain_not_allowlisted",
      `The signed-in tenant is not in SMOKE_ALLOWED_DOMAINS, so the run stops before any surface call.`,
      "Add the tenant's primary domain to SMOKE_ALLOWED_DOMAINS if this is the intended tenant.",
    );
  }
}

/** The tenant domain can only be read from the API, so a caller may supply it. */
export function resolveTenantDomain(
  env: NodeJS.ProcessEnv,
  discovered: string | undefined,
): string {
  const declared = (env.SMOKE_TENANT_DOMAIN ?? "").trim().toLowerCase();
  const found = discovered?.trim().toLowerCase();

  if (found && declared && found !== declared) {
    throw new SmokeRefusal(
      "domain_mismatch",
      `SMOKE_TENANT_DOMAIN is ${declared}, but the signed-in tenant reports ${found}.`,
      "Fix the value or sign in to the intended tenant.",
    );
  }

  const domain = found ?? declared;
  if (!domain) {
    throw new SmokeRefusal(
      "domain_unknown",
      "The tenant domain could not be established, so the allowlist cannot be checked.",
      "Set SMOKE_TENANT_DOMAIN to the tenant's primary domain.",
    );
  }

  return domain;
}

export interface WriteGuard {
  sandboxDomain: string;
}

/**
 * Mutating smoke runs in a sandbox tenant only, and that tenant must be a
 * different domain from the allowlisted production one.
 */
export function assertWriteSandbox(
  env: NodeJS.ProcessEnv,
  allowlist: string[],
  interactive: boolean,
): WriteGuard {
  if (env.SMOKE_WRITE !== "1") {
    throw new SmokeRefusal(
      "write_not_enabled",
      "Mutating smoke requires SMOKE_WRITE=1.",
      "Leave it unset for read-only smoke; a write run always needs a sandbox tenant.",
    );
  }

  const sandbox = (env.SMOKE_SANDBOX_DOMAIN ?? "").trim().toLowerCase();
  if (!sandbox) {
    throw new SmokeRefusal(
      "sandbox_missing",
      "Mutating smoke requires SMOKE_SANDBOX_DOMAIN, a tenant used only for this purpose.",
      "Create a trial tenant, add its domain to the allowlist, and set SMOKE_SANDBOX_DOMAIN to it.",
    );
  }

  if (allowlist.includes(sandbox)) {
    throw new SmokeRefusal(
      "sandbox_is_production",
      "SMOKE_SANDBOX_DOMAIN is also in SMOKE_ALLOWED_DOMAINS, so a write run would touch production.",
      "Use a separate trial tenant, and keep its domain out of the production allowlist.",
    );
  }

  if (!interactive) {
    throw new SmokeRefusal(
      "confirmation_required",
      "A write run needs an interactive terminal to confirm the sandbox tenant.",
      "Run it from a terminal; unattended runs are read-only.",
    );
  }

  return { sandboxDomain: sandbox };
}

/** Raw output is never the default and never available to a pipeline. */
export function assertRawAllowed(env: NodeJS.ProcessEnv, interactive: boolean): void {
  assertNotCi(env);
  if (!interactive) {
    throw new SmokeRefusal(
      "raw_requires_terminal",
      "Writing unredacted output requires an interactive terminal.",
      "Run without --raw; redacted output is the default.",
    );
  }
}

/**
 * Reports live under one gitignored directory. If that directory is not
 * ignored, a report could be committed by accident, so the run refuses.
 */
export function assertReportLocation(gitignore: string): void {
  const ignored = gitignore
    .split("\n")
    .map((line) => line.trim())
    .some(
      (line) =>
        line === ".smoke/" || line === ".smoke" || line === "/.smoke/" || line === "/.smoke",
    );

  if (!ignored) {
    throw new SmokeRefusal(
      "report_dir_not_ignored",
      ".smoke/ is not gitignored, so a report could be committed.",
      "Add .smoke/ to .gitignore before running smoke.",
    );
  }
}
