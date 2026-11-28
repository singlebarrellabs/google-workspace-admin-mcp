# google-workspace-admin-mcp

An MCP server for the **Google Workspace admin plane**: the APIs that manage a
tenant, not the ones that read a user's mail.

> **Status: released.** Eight admin surfaces, 107 tools, published to npm.
> [`docs/TOOLS.md`](docs/TOOLS.md) lists every tool; [`docs/SETUP.md`](docs/SETUP.md)
> takes you from a clean Cloud project to a working server.

Looking for Gmail, Drive, Calendar or Meet? Those are user content, and they live
in the companion server, [`google-services-mcp`](https://github.com/singlebarrellabs/google-services-mcp).
This one is the admin plane, and deliberately cannot read them.

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
- No user-content APIs: Gmail, Drive, Docs, Sheets, Slides, the Calendar API,
  Chat, Meet, Keep, Tasks, Forms, YouTube, Classroom, Sites and Apps Script are
  out of scope, permanently. (Calendar *resources* — the rooms a company books —
  are admin data and are in scope.)

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

## Compliance posture

Google is tightening how AI agents reach Workspace data. The relevant facts,
read against [Google's usage tiers][tiers] and the
[Workspace AI Tools Addendum][addendum] on 2026-11-27:

- **The APIs here are Workspace APIs.** The Admin SDK is in scope for the
  Addendum, so the "AI agents must use a Google MCP" requirement covers this
  server's use, not just Gmail and Drive.
- **Google ships no MCP server for the admin plane.** Directory, Reports,
  Vault, Cloud Search, Data Transfer and Licensing have no hosted equivalent.
  There is therefore no compliant path to switch to today.
- **Admin APIs are not in the first tiering wave.** Tiering started with Gmail,
  Drive and Calendar. Usage quotas and billing for the admin surfaces are
  unchanged for now, and enforcement of the MCP requirement has no mechanism
  here yet.
- **That is the current state, not a promise.** If Google extends tiering to
  admin APIs or publishes an admin MCP server, this server's status changes and
  this section will say so.

If you need a defensible answer for a security review today: this server calls
Admin SDK REST endpoints with a delegated admin OAuth token, holds no
impersonation path, stores no user data, and has no hosted component. That is
the accurate description of its risk surface; it is not a claim of compliance
with the Addendum.

Policy reviewed 2026-11-27.

[tiers]: https://developers.google.com/workspace/guides/quota-usage-tiers
[addendum]: https://workspace.google.com/terms/ai-tools/

## Authentication

One credential: a **Desktop-app OAuth client** in your own Cloud project, with
the consent screen set to **Internal**. The administrator signs in once; the
refresh token is stored with owner-only permissions.

- No service account, no DWD grant, no key file to rotate.
- Internal keeps refresh tokens long-lived. A client left in **Testing** expires
  them after seven days; [`docs/SETUP.md`](docs/SETUP.md#the-seven-day-trap)
  explains the fix.
- Scopes are admin-only. Nothing requested grants another user's mail or files.

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
export GWS_CLIENT_ID=...        # Desktop-app OAuth client, Internal consent screen
export GWS_CLIENT_SECRET=...
npx google-workspace-admin-mcp@latest auth
```

Authorization prints a URL, waits for the loopback callback and stores the
refresh token. Then add the server to your client:

```json
{
  "mcpServers": {
    "gwa": {
      "command": "npx",
      "args": ["-y", "google-workspace-admin-mcp@latest"],
      "env": {
        "GWS_CLIENT_ID": "…",
        "GWS_CLIENT_SECRET": "…"
      }
    }
  }
}
```

That block is the shape Claude Desktop and Claude Code use; OpenCode puts the
same command under `mcp.servers` in its config. A client you launch from a shell
that already exports the two variables needs no `env` block at all.

The server starts **read-only**: mutating tools are absent, not merely refused.
Set `GWS_MODE=write` to register them, and `GWS_PASSTHROUGH=on` for the
allowlisted raw-call tools.

The full walkthrough — six APIs, consent screen, admin roles per surface,
editions, the seven-day trap — is in [`docs/SETUP.md`](docs/SETUP.md).

## What to ask it

- "Find jane@, list her recent logins, her OAuth grants and her devices." →
  directory and audit tools, read-only.
- "Who changed group membership in the last week?" → flattened audit events.
- "Offboard jane@: revoke app grants, sign out sessions, list devices, then
  suspend." → the destructive calls each ask for confirmation; run it in write
  mode.
- "Which licence seats are unused?" → licence list plus user last-login data.
- "Can this tenant use Vault?" → `gws_auth_status` reports the edition it probed
  and the source of that answer.

## Development

```bash
npm install
npm run check   # typecheck, lint, scope check, tests
```

`npm run docs:scopes` regenerates the scope list in `docs/SETUP.md` from
`ADMIN_SCOPES`; `npm run check` fails when the two disagree.

Specs live in `openspec/specs/`, one per capability; the archived change that
produced them is under `openspec/changes/archive/`. OpenSpec is used for
planning only; tests are the enforcement mechanism.

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

No `NPM_TOKEN` secret is used: npm validates the workflow's OIDC identity
(trusted publisher bound to this repository and `ci.yml`).

## License

MIT. Part of the Single Barrel Labs MCP family:
[`google-services-mcp`](https://github.com/singlebarrellabs/google-services-mcp)
covers the user plane, this covers the admin plane.
