# google-workspace-admin-mcp

An MCP server for the **Google Workspace admin plane**: the APIs that manage a
tenant, not the ones that read a user's mail.

> **Status: early development.** The repository is scaffolded and specified; no
> tools are implemented yet. Track progress in the
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
**Reports** and **Alert Center** for investigation. That is the whole design.

It is also not a GAM replacement. GAM is a scripting language with a decade of
edge cases; this is a small set of typed tools built to be driven by a model
without guessing.

## Scope

| Surface | What it covers |
| --- | --- |
| Directory | users, aliases, groups, members, org units, roles, devices, tokens, domains |
| Reports | audit activities, customer and entity usage reports |
| Alert Center | alerts, feedback, delete/undelete |
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
  Education; Data Transfer and Alert Center are broadly but not universally
  available. Those tools say so instead of surfacing a bare 403.

## Install

Not published yet. The intended flow:

```bash
npx google-workspace-admin-mcp
```

with credentials configured through environment variables documented in
`docs/SETUP.md` once that file exists.

## Development

```bash
npm install
npm run check   # typecheck + lint + tests
```

Specs live in `openspec/changes/workspace-admin-mcp/`. Each capability spec is
linked from its tracking issue. OpenSpec is used for planning only; tests are the
enforcement mechanism.

## License

MIT. Part of the Single Barrel Labs MCP family — `google-services-mcp` covers the
user plane, this covers the admin plane.
