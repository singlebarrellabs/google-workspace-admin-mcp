# AGENTS.md

Instructions for anyone — human or agent — working in this repository.

## Non-goals, enforced

These are permanent. A PR that adds any of them is rejected regardless of tests.

- **No impersonation.** No `as` parameter, no subject claim, no per-user token
  minting. There is no code path that acts as another user.
- **No service accounts, no domain-wide delegation.** No key files, no JWT
  signing, no `service_account` credential type.
- **No user-content APIs.** Gmail, Drive, Docs, Sheets, Slides, Calendar, Chat,
  Meet, Keep, Tasks, Forms, YouTube, Classroom, Sites, Apps Script.

A test asserts the built server exposes no impersonation surface: no `as` param
in any tool schema, no service-account credential type, no user-content scopes.
Keep that test passing; it is the guarantee, the README is only the summary.

## Architecture

```text
src/
  main.ts              stdio entry point
  server.ts            MCP server, tool registration
  auth/                admin OAuth client, loopback flow, token store
  safety/              read-only gate, confirm gate, audit log
  services/            one module per admin API surface
  tools/               tool definitions, grouped per surface
  passthrough/         allowlisted raw-call registry
  util/                result formatting, error mapping, pagination
docs/
  TOOLS.md             one row per tool: name, surface, mutating?, notes
  SETUP.md             credentials, scopes, edition requirements
openspec/              specs and the proposed change
```

Rules:

- One service module per surface; tools stay thin and delegate.
- Every tool result is structured JSON with a human-readable summary. No raw
  googleapis objects in tool output.
- All errors go through the shared mapper: edition mismatch, permission denied,
  not found, rate limit, and unknown — each with an actionable message.
- Pagination is explicit: `pageToken` in, `nextPageToken` out.
- Tool names are `gws_<surface>_<verb>`: `gws_users_list`, `gws_vault_export_create`.

## Safety requirements

- Mutating tools must not exist when read-only mode is on (omit them; do not fail
  at call time).
- Destructive tools require an explicit confirm argument and document exactly
  what becomes irreversible.
- Every call is appended to the local audit log. Redact tokens and anything
  secret; never log full request bodies for credential endpoints.

## Workflow

- Worktree off `main` before the first edit. Never commit to `main`.
- Branch names: `feat/<surface>-<thing>`, `fix/<thing>`, `docs/<thing>`.
- PRs open as **draft**; mark ready only when asked.
- Conventional commits. Squash merge.
- One surface per PR where possible. The surfaces do not depend on each other,
  so they can be built in parallel worktrees.

## Testing

There is no live Workspace tenant in CI, and mocked admin APIs lie easily.
Therefore:

- Unit tests use `nock` fixtures per surface, asserting the request shape as well
  as the parse of the response.
- Every tool has at least: happy path, edition/permission error path, and
  pagination when applicable.
- Opt-in smoke scripts (`npm run smoke:<surface>`) run against a real tenant and
  are never part of CI.

```bash
npm run check   # typecheck + lint + test
```

Use the local binaries for lint, the npm wrappers can fail in some shells:

```bash
./node_modules/.bin/biome check .
./node_modules/.bin/markdownlint-cli2 "**/*.md" "#node_modules/**"
```

## Privacy

- Test fixtures use `@example.com` / `@example.org` and `example.com` domains.
  Never paste a real address, domain, tenant ID or customer name into code,
  tests, docs, issues or PR bodies.
- A pre-commit hook rejects added lines containing real-looking email addresses.
- Never print credentials, tokens or client secrets in logs, tests or output.

## Documentation

- Every new tool gets a row in `docs/TOOLS.md` in the same PR.
- Edition requirements are stated in the tool description, not only in docs.
- Setup changes update `docs/SETUP.md`.

## OpenSpec

Specs live under `openspec/changes/workspace-admin-mcp/`. Planning only —
implementing requires an explicit instruction after the artifacts exist.
Each capability spec corresponds to one tracking issue; keep paths in sync.
