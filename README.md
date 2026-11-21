# google-workspace-admin-mcp

An MCP server for the **Google Workspace admin plane**: the APIs that manage a
tenant, not the ones that read a user's mail.

> **Status: early development.** Surfaces land one branch at a time; the tool
> list for the checked-out revision is in [`docs/TOOLS.md`](docs/TOOLS.md) and
> setup is in [`docs/SETUP.md`](docs/SETUP.md). Track progress in the
> [issues](https://github.com/singlebarrellabs/google-workspace-admin-mcp/issues).

## Why

Google now ships hosted MCP servers for user surfaces — Gmail, Drive, Calendar.
Nothing covers the admin surfaces where an administrator actually spends their
day: who exists, what happened, what is licensed, what must be held or
transferred. The community servers that touch admin APIs are shallow, stale, or
built around key files.

Admin work is also **sequence** work. "User reports a phishing email" is not one
API call, it is: find the user, read their recent logins, list their OAuth
grants, list their app passwords and devices, revoke sessions, then decide
whether to suspend. Tools alone are not the product; the sequence is. MCP makes
sequences cheap, which is why this belongs here rather than in a dashboard.

## What this is not

**This server cannot read your users' mail.** That is enforced in code, not just
stated in a README:

- No service accounts. No key files, no JWT signing, no key rotation.
- No domain-wide delegation.
- No impersonation: there is no `as` parameter anywhere, and no credential type
  that could express one.
- No user-content APIs: Gmail, Drive, Docs, Sheets, Slides, Calendar, Chat, Meet,
  Keep, Tasks, Forms, YouTube, Classroom, Sites and Apps Script are out of scope,
  permanently.

The supported paths for the things people use impersonation for are the audited
ones: **Vault** for legal holds and eDiscovery, **Data Transfer** for offboarding,
**Reports** for investigation. That is the whole design.

It is also not a GAM replacement. GAM is a scripting language with a decade of
edge cases; this is a small set of typed tools built to be driven by a model
without guessing.

## Scope

| Surface | What it covers |
| --- | --- |
| Directory | users, aliases, groups, members, org units, roles, devices, tokens, domains |
| Reports | audit activities, customer and entity usage reports |
| Vault | matters, holds, held accounts, exports, saved queries, operations |
| Cloud Search | query, suggest, sources |
| Data Transfer | transfers for offboarding |
| Enterprise License Manager | assign, revoke, list |
| Groups Settings | group access and moderation settings |
| Calendar Resources | buildings, rooms, features |
| Passthrough | one allowlisted raw call per enabled API, for what curated tools miss |

## Authentication

One credential: an **admin user OAuth client** you create in your own Google
Cloud project, with the application type set to **Internal**. The administrator
signs in once; the refresh token is stored locally with owner-only permissions.

- No service account, no DWD grant, no super-admin security settings to change.
- The Internal app type gives long-lived refresh tokens without verification.
  A client left in **Testing** publishing status expires refresh tokens after
  seven days — the setup docs call this out because it silently breaks an
  unattended admin tool.
- Scopes are admin-only. Nothing in the requested scope list grants mailbox or
  file content of another user.

## Safety model

- **Read-only by default.** Mutating tools are absent unless writes are enabled.
- **Confirmation on destructive operations** (suspend, delete, revoke, transfer,
  hold removal, export creation) — the caller must pass an explicit confirm flag
  that the tool documents.
- **Append-only local audit log** of every tool call: timestamp, tool, arguments
  (secrets redacted), outcome.
- **Edition-aware errors.** Vault and Cloud Search require Enterprise or
  Education; Data Transfer is broadly but not universally available. Those
  tools say so instead of surfacing a bare 403.

## Install

```bash
npm install -g google-workspace-admin-mcp
export GWS_CLIENT_ID=...        # Desktop-app OAuth client, Internal consent screen
export GWS_CLIENT_SECRET=...
google-workspace-admin-mcp auth
```

`npx google-workspace-admin-mcp` works the same way once the package is
published. The full walkthrough — enabling the six APIs, the consent screen, the
admin roles per surface, the seven-day refresh-token trap — is in
[`docs/SETUP.md`](docs/SETUP.md).

The server starts read-only. Set `GWS_MODE=write` to register mutating tools, and
`GWS_PASSTHROUGH=on` for the allowlisted raw-call tools.

## Development

```bash
npm install
npm run check   # typecheck + lint + generated docs + tests
```

`npm run docs:scopes` regenerates the scope list in `docs/SETUP.md` from
`ADMIN_SCOPES`; `npm run check` fails when the two disagree.

Specs live in `openspec/changes/workspace-admin-mcp/`. Each capability spec is
linked from its tracking issue. OpenSpec is used for planning only; tests are the
enforcement mechanism.

No live Workspace tenant is needed to contribute. Verification tiers, tenant
access levels, the redaction rules for smoke output and the smoke commands are in
[`docs/SMOKE-TESTING.md`](docs/SMOKE-TESTING.md). Smoke never runs in CI, and the
runner refuses when it detects one.

## Releases

Publishing runs from GitHub Actions, never from a laptop:

- **Stable** — a merge to `main` that changes shipping files publishes the next
  patch to `latest` with provenance, then tags `vX.Y.Z` and opens a GitHub
  release. A push that only touches `docs/`, `openspec/`, `test/`, `smoke/` or
  the workflows publishes nothing: it cannot change the tarball.
- **Preview** — a non-draft PR from this repository publishes
  `<version>-beta.<run_number>` to the `beta` dist-tag, so a branch is
  installable before it merges. `v*-beta*` tags and manual runs do the same.

The first release needs two one-time steps:

1. Claim the name: `npm publish --access public` once from a checkout, signed in
   with an account that can publish `@singlebarrellabs` packages.
2. Configure the trusted publisher at
   `npmjs.com/package/google-workspace-admin-mcp/access` with repository
   `singlebarrellabs/google-workspace-admin-mcp` and workflow `ci.yml`.

Until then, both publishing jobs are gated by the repository variable
`NPM_PUBLISH_ENABLED`; set it to `true` after step 2 and delete the gate. No
`NPM_TOKEN` secret is used: npm validates the workflow's OIDC identity.

## License

MIT. Part of the Single Barrel Labs MCP family — `google-services-mcp` covers the
user plane, this covers the admin plane.
