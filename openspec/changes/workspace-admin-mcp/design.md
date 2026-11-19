# Design

## Context

A stdio MCP server that an administrator runs locally or in a container, pointed
at their own Google Workspace tenant, with an LLM client as the only consumer.
The operator creates the OAuth client themselves; the project ships no
credentials, no hosted component, and no telemetry.

Constraints that shaped the design:

- **No impersonation.** Ruled out permanently, not deferred. It removes the
  service account, the key file, the DWD grant, and the class of incident where a
  leaked credential can mint tokens for every user in the domain.
- **No live tenant in CI.** Admin APIs are exactly where hand-written mocks drift
  from reality, so tests need recorded request/response fixtures plus opt-in smoke
  scripts.
- **Edition variance.** Vault and Cloud Search are Enterprise/Education. Data
  Transfer and Alert Center are broadly available but not universal. A tool that
  returns a raw 403 teaches a model to invent workarounds.

## Goals

- A complete admin surface, honest about its limits, safe by default.
- Tool schemas a model can use without guessing: flat names, typed arguments,
  explicit pagination, structured results, actionable errors.
- One credential path that a competent admin can set up in ten minutes.

## Non-Goals

- Impersonation, service accounts, domain-wide delegation.
- User-content APIs (Gmail, Drive, Docs, Sheets, Slides, Calendar, Chat, Meet,
  Keep, Tasks, Forms, YouTube, Classroom, Sites, Apps Script).
- Workflow composition baked into tools. The sequence is the model's job: expose
  primitives that compose, not `gws_fix_everything`.
- A dashboard, a hosted service, or a policy engine.

## Decisions

### One credential: admin user OAuth

An OAuth client of type **Internal**, created in the operator's own Cloud
project, with admin-only scopes. Loopback flow, refresh token persisted with
owner-only permissions. `gws_auth_status` reports the signed-in admin, granted
scopes, and which surfaces are reachable.

Alternatives rejected: service account + DWD (enables impersonation, key
material on disk, super-admin grant to install); OAuth client ID DWD (still
tenant-wide authority); per-call user tokens (an admin tool has no user to
delegate from).

Test clients left in **Testing** publishing status expire refresh tokens after
seven days. Setup docs call this out, and `gws_auth_status` warns when the token
is close to expiry with a re-auth hint.

### Read-only by default, enforced by omission

Read-only is the default. In read-only mode mutating tools are **not
registered** — they are absent from the tool list, not present and failing. A
model that cannot see `users_delete` cannot argue itself into calling it.

Write mode is opt-in via configuration. Destructive tools (`suspend`, `delete`,
`revoke`, `signout`, `transfer insert`, `export create`, hold removal) also
require an explicit `confirm` argument whose description states what becomes
irreversible. Two gates, one intent: make the dangerous thing deliberate.

### Audit log

Append-only JSONL at a configurable path (default under the user state dir).
One line per tool call: timestamp, tool name, redacted arguments, outcome,
duration. Tokens and client secrets never appear. The log is local because
shipping admin metadata anywhere is a decision the operator should make, not a
default.

### Error mapping

A single mapper converts googleapis errors into five categories with actionable
text: `edition_unavailable`, `permission_denied`, `not_found`, `rate_limited`,
`unknown`. Edition detection uses the API's own error reason
(`accessNotConfigured`, `forbidden` with an entitlement hint) plus a surface
capability probe cached per process, so Vault tools say "this requires Google
Workspace Enterprise or Education" rather than echoing a 403 body.

### Passthrough, allowlisted

One raw-call tool per enabled API, accepting a method path and JSON body, and
validated against a static allowlist of supported methods. Off unless enabled.
It exists because ~70 curated tools will miss something; it is allowlisted
because an unrestricted proxy is a different product with a different threat
model. Passthrough obeys the same read-only and audit gates, and mutating methods
are classified explicitly rather than inferred.

### Results

Every tool returns structured content plus a one-line summary. Lists return
`{ items, nextPageToken?, summary }`. Nested API objects are normalised into flat
shapes where they are otherwise unusable (audit activity events, Vault exports),
and the raw object is never dumped into model context.

## Risks

- **Fixtures drift from real API behaviour** — opt-in smoke script per surface;
  fixture updates reviewed with the code.
- **Vault export flow is the largest correctness surface** — dedicated fixtures
  for create, operation poll and download reference; failure states tested.
- **Edition variance surprises operators mid-incident** — capability probe at auth
  time surfaced in `gws_auth_status`, plus per-tool edition text.
- **Read-only gate bypassed by a new mutating tool** — a test enumerates
  registered tools in read-only mode and asserts the mutating set is empty.
- **Scope creep toward user-content APIs** — the non-goal test asserts no
  user-content scope and no `as` parameter in any tool schema.

## Migration

Greenfield. No migration path, no compatibility surface, no deprecation window.
