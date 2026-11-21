# Smoke testing and tenant access

The server is verified two ways: fixtures in CI, and read-only smoke runs
against a tenant the operator controls. This document covers the second, and the
rules that keep tenant data out of the repository and out of shared output.

The current tenant is a proof-of-concept workspace: directory, reports, transfer,
licensing, groups settings and calendar resources have run live. Vault and Cloud
Search report `unavailable` there because the tenant has neither, so those two
surfaces are still fixture-only.

## Two verification tiers

| Tier | Runs | Needs a tenant | Covers |
| --- | --- | --- | --- |
| Fixtures | CI, every PR | no | request shape, parsing, error mapping, gates |
| Smoke | opt-in, by the operator | yes | that Google actually behaves the way the fixtures claim |

Fixtures are the contract. Smoke is the reality check. A PR that only adds smoke
coverage is not mergeable; a surface that ships fixture-only is normal.

## What works without tenant access

Everything except live verification:

- server skeleton, tool registry, result normalisation
- error mapper and edition detection, against synthetic entitlement failures
- token store, permission checks, refresh logic — the loopback flow is tested
  against a stub authorization server
- every surface's request construction and response parsing, from published API
  docs plus recorded fixtures
- the read-only gate, confirm gate, audit log, passthrough allowlist, and the
  non-goal test

## What requires a human with the tenant

Three runs, each a single command, each producing short output:

1. `google-workspace-admin-mcp auth` — first consent. Proves the OAuth client, the
   loopback callback and the token store work end to end. This is the only step
   that cannot be simulated, because it involves Google's own consent screen.
2. `npm run smoke:status` — prints the signed-in tenant, granted scopes,
   refresh-token expiry and per-surface availability. Redacted by default.
3. `npm run smoke:read` — one representative read call per surface. A surface
   whose tool is not in this revision is reported as skipped, not failed.

The output of 2 and 3 is what gets shared, and only after redaction.

## Configuration

Smoke reads a gitignored `.env.smoke`; an exported variable always wins.

| Variable | Purpose |
| --- | --- |
| `SMOKE_ALLOWED_DOMAINS` | Production domains a read run may touch, comma separated |
| `SMOKE_TENANT_DOMAIN` | The signed-in tenant, when you would rather not discover it |
| `SMOKE_GROUP` | A group address for the Groups Settings check |
| `SMOKE_SANDBOX_DOMAIN` | The trial tenant used for write runs |
| `SMOKE_WRITE` | Set to `1` for a mutating run; never set it on a schedule |

The runner drives the real server over stdio, so it exercises the same tool
registration, confirmation gate and audit log a client would. It never runs in
CI: every entry point refuses when `CI` or a provider equivalent is set.

## Access ladder

Level 0 is the default and the expectation. Higher levels are opt-in, temporary,
and revoked when done.

| Level | Access given | What it unlocks | Cost to the owner |
| --- | --- | --- | --- |
| 0 | nothing | all code, fixtures and tests | none |
| 1 | redacted output, owner-run | confirms fixtures match reality | paste a redacted file |
| 2 | a dedicated trial tenant | agent iterates on live failures | trial signup, rotate after |
| 3 | throwaway admin in the real tenant | fastest feedback loop | scoped role, audit, revoke |

Level 3 is discouraged. The premise of this project is that admin authority should
be auditable and bounded; handing a live admin credential to a development process
undercuts that premise.

## Redaction rules

- Smoke scripts **redact by default**. Emails, domains, customer IDs, group names,
  resource names and device IDs are replaced with stable placeholders
  (`user-1@example.com`, `domain-1`, `group-2`).
- Redaction is deterministic within a run, so placeholder relationships survive and
  the output is still diagnosable.
- Writing raw responses requires `--raw`, which prints a warning naming the
  destination and requires an interactive confirmation. It is never the default and
  never available in CI.
- A smoke run with redaction disabled must still not write outside its own output
  directory.

## Never shared

- OAuth client secret, refresh tokens, access tokens, authorization codes.
- Raw API responses containing real mailbox, Drive or directory content.
- Tenant identifiers: customer ID, primary domain, org unit paths.

Credentials live in the operator's environment for the duration of a run. The
development process never receives a secret in a message, a commit or an issue.
What it can read locally is covered under the limits below.

## Automated smoke runs

Smoke should run unattended: the value is detecting fixture drift before a user
hits it, which needs a schedule, not discipline.

- `npm run smoke:auto` runs the read-only smoke for every surface, redacts the
  output, and writes `.smoke/<timestamp>/report.json` plus `summary.md`. Both are
  mode `0600` and gitignored. Non-zero exit on drift.
- `npm run smoke:record` records the live response shape of each check into
  `smoke/shapes/<check>.json`. Shapes are keys and types only, so they are safe to
  commit; drift detection starts from the first recorded run.
- Scheduling is local (`launchd` or `cron`, daily). No CI workflow ever holds a
  tenant credential — a public repo's Actions secrets are the wrong place for a
  refresh token.
- Drift detection compares each live response against the shape recorded under
  `smoke/shapes/`: key presence and types, not values, so no tenant data enters
  the comparison. A check without a recorded shape reports that, once, and is not
  treated as drift.
- On drift the report names the surface, the field path, and the expected versus
  observed type. A redacted sample may be attached; it is never fetched by
  default.

Guards. Each is a hard refusal, not a warning:

- **Tenant allowlist** — refuses unless the signed-in domain appears in
  `SMOKE_ALLOWED_DOMAINS`. The value lives in a gitignored file and is never
  committed.
- **Write isolation** — mutating smoke requires `SMOKE_WRITE=1` and a domain
  matching `SMOKE_SANDBOX_DOMAIN`, which must differ from the allowlisted
  production domain.
- **Artifact location** — refuses to write outside `.smoke/`, refuses to run if
  `.smoke/` is not gitignored, and chmods every artifact to owner-only.
- **Redaction** — cannot be disabled without an interactive terminal and an
  explicit flag.
- **CI** — refuses to run at all when `CI` or a provider equivalent is set.
- **Secret scan** — scans the rendered report for real-looking email addresses,
  the tenant domain, absolute home paths and token-shaped strings before writing;
  a hit aborts the run and writes nothing.

The guards live in `src/smoke/guards.ts` and are tested; they throw an error with
a code (`ci_environment`, `domain_not_allowlisted`, `sandbox_missing`,
`redaction_miss`, and so on) so a failed run says which rule stopped it.

## Scheduling it

No CI workflow holds a tenant credential. Schedule on the machine that already
has the token:

```cron
0 7 * * *  cd /path/to/google-workspace-admin-mcp && . ./.env.smoke && npm run smoke:auto
```

On macOS, a `launchd` job does the same with `StartCalendarInterval`. Either way
the run writes into `.smoke/` and leaves the exit code for the scheduler to log.
A failed run is the signal to look at the report, not to retry in a loop.

Limits, stated plainly:

- A process running as your user can read the token store. Redaction protects what
  gets **written and shared**, not a compromised host. The bounds that matter are
  a dedicated smoke tenant, read-only automation, revocation when done, and
  rotation on any suspicion.
- Read-only automation against a production tenant is a judgement call, not a
  default: admin audit logs will show the traffic.
- Drift reports are shape-only. A field that changes meaning without changing type
  is invisible to them; smoke complements fixture review, it does not replace it.

## After a smoke run

- Tokens issued for smoke testing are revoked from the admin console.
- A trial tenant used at level 2 is deleted, not abandoned.
- Any fixture updated from a live observation is checked for identifying detail
  before commit: placeholders only, no real addresses or domains.
