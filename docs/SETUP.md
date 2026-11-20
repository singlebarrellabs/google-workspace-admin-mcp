# Setup

End to end, from a clean Google Cloud project to a server that can read your
tenant. Every console step names the page it lives on.

The server has one credential: an OAuth client in **your** Cloud project, signed
in once by an administrator. There is no service account, no key file and no
domain-wide delegation. If you were planning to create a service account,
nothing here will use it.

## 1. What you need

- A Google Workspace tenant, and an account that can grant admin roles.
- Access to the [Google Cloud console](https://console.cloud.google.com) for a
  project you own.
- Node.js 24 or newer on the machine that will run the server.

## 2. Create the Cloud project

1. Open the console's project picker and choose **New project**.
2. Name it something you will recognise, for example `workspace-admin-mcp`.
3. Select the new project before continuing. The API and credential pages are
   per project; the wrong project produces a client that cannot see the APIs.

## 3. Enable the APIs

Open **APIs & Services → Library** and enable each API below. Search for the
name, open it, press **Enable**.

| API | Service name | Needed for |
| --- | --- | --- |
| Admin SDK API | `admin.googleapis.com` | Directory, Reports, Data Transfer |
| Alert Center API | `alertcenter.googleapis.com` | Alert Center |
| Cloud Search API | `cloudsearch.googleapis.com` | Cloud Search (Enterprise) |
| Google Vault API | `vault.googleapis.com` | Vault (Enterprise) |
| Groups Settings API | `groupssettings.googleapis.com` | Group settings |
| Enterprise License Manager API | `licensing.googleapis.com` | Licenses |

A surface whose API is not enabled returns a 403 that looks like a permission
problem. The error mapper reports it as `edition_unavailable` when it can, so an
un-enabled API and a missing edition can look alike: check this page first.

## 4. Configure the consent screen

Open **APIs & Services → OAuth consent screen**.

1. Choose **Internal** as the user type. Internal means accounts in your
   Workspace tenant only, and it removes the verification and testing-status
   problems that an External app has.
2. Fill in the app name and a support email. These are shown on the consent
   screen.
3. Add the scopes the server requests. The list is in
   [Scopes](#scopes) below; `gws_scopes_list` prints the same set from code.
4. Save.

### The seven-day trap

An OAuth client whose consent screen is still in **Testing** publishing status
issues refresh tokens that expire after seven days. The server then fails
overnight with `auth_required`, and the fix is to sign in again.

- An **Internal** app is not left in Testing; this is the supported setup.
- An **External** app stays in Testing until it is published, which needs
  verification for these scopes. If you use one anyway, expect to re-authorize
  weekly, and do not schedule unattended smoke runs against it.
- `gws_auth_status` reports the stored token's expiry, so a token that is about
  to expire is visible before it breaks a workflow.

## 5. Create the OAuth client

Open **APIs & Services → Credentials → Create credentials → OAuth client ID**.

1. Application type: **Desktop app**.
2. Name it, for example `workspace-admin-mcp`.
3. Create, then copy the **client ID** and **client secret**.

Desktop app is the right type because the server listens on a loopback port
chosen at run time (`http://127.0.0.1:<port>`). A Web application client would
need every port pre-registered.

There is no redirect URI to add.

## 6. Install and configure

```bash
npm install -g google-workspace-admin-mcp
```

Set these in the environment that runs the server:

| Variable | Required | Meaning |
| --- | --- | --- |
| `GWS_CLIENT_ID` | yes | Client ID from step 5 |
| `GWS_CLIENT_SECRET` | yes | Client secret from step 5 |
| `GWS_MODE` | no | `readonly` (default) or `write` |
| `GWS_PASSTHROUGH` | no | `on` registers the allowlisted raw-call tools |
| `GWS_STATE_DIR` | no | Token and audit directory, default under `~/.local/state` |
| `GWS_TOKEN_PATH` | no | Override the token file path |
| `GWS_AUDIT_LOG` | no | Override the audit log path |

Keep the secret out of shell history and out of the repository. A local
`chmod 600` env file that your process manager reads is enough; a committed file
never is.

## 7. Authorize once

```bash
google-workspace-admin-mcp auth
```

The command prints a URL, waits for the callback on a loopback port, and stores
the refresh token. It prints the URL rather than opening a browser, so it works
over SSH.

The token file is written with owner-only permissions. The server refuses to
read it if the permissions are wider, because a refresh token is the whole
credential.

## 8. Verify

```bash
google-workspace-admin-mcp --version
```

Then ask the server for its status (`gws_auth_status` from a client, or
`npm run smoke:status` in a checkout). Status reports the signed-in
administrator, granted scopes, token expiry, mode, and which surfaces the tenant
can use.

If status says a surface is unavailable for edition reasons, that is a fact
about the tenant, not a misconfiguration. See [Editions](#11-editions).

## 9. Grant the admin roles

The signed-in account needs the privilege for each surface you intend to use.
A super admin has all of them; anything less should be a custom role.

| Surface | Role or privilege |
| --- | --- |
| Directory | User Management, Groups, or a custom admin role |
| Reports | Reports privilege |
| Alert Center | Alert Center privilege |
| Vault | Vault privileges: View All Matters, Manage Holds, Manage Searches, Manage Exports |
| Cloud Search | Cloud Search administrator |
| Data Transfer | Data Transfer privilege |
| Licenses | License Management privilege |
| Groups Settings | Group owner or manager for that group |
| Calendar Resources | Groups administrator (resources share the directory) |

Vault is the one that surprises people: an admin without **View All Matters**
sees only the matters they created or that were shared with them. The tool says
so by name when a matter is not visible.

## 10. Choose a mode

The server starts **read-only**. In that mode every mutating tool is absent from
the tool list, not present and failing, so a model cannot talk itself into a
write.

- `GWS_MODE=write` registers the mutating tools.
- Destructive tools still require `confirm: true`, and their descriptions say
  what becomes irreversible.
- The raw passthrough tools stay off until `GWS_PASSTHROUGH=on`, and even then
  no write method is allowlisted.

Start read-only, use it for a while, and only then enable writes.

## 11. Editions

| Surface | Available on |
| --- | --- |
| Vault | Enterprise, Enterprise Plus, Education |
| Cloud Search | Enterprise, Enterprise Plus, Education |
| Alert Center | Business and above (not every Frontline tier) |
| Data Transfer | Workspace paid editions |
| Directory, Reports, Licenses, Groups Settings, Resources | every edition |

A tool on an unavailable surface returns `edition_unavailable` with the
alternative surface to use, rather than a bare 403.

## Scopes

The server requests admin-only scopes. None of them grants access to another
user's mail, files or calendar: Vault searches return matter metadata and export
status, not message bodies.

<!-- scopes:start -->

- `https://www.googleapis.com/auth/admin.directory.user`
- `https://www.googleapis.com/auth/admin.directory.user.security`
- `https://www.googleapis.com/auth/admin.directory.group`
- `https://www.googleapis.com/auth/admin.directory.group.member`
- `https://www.googleapis.com/auth/admin.directory.orgunit`
- `https://www.googleapis.com/auth/admin.directory.device.mobile`
- `https://www.googleapis.com/auth/admin.directory.rolemanagement`
- `https://www.googleapis.com/auth/admin.directory.domain`
- `https://www.googleapis.com/auth/admin.directory.customer.readonly`
- `https://www.googleapis.com/auth/admin.directory.resource.calendar`
- `https://www.googleapis.com/auth/admin.reports.audit.readonly`
- `https://www.googleapis.com/auth/admin.reports.usage.readonly`
- `https://www.googleapis.com/auth/admin.datatransfer`
- `https://www.googleapis.com/auth/apps.alerts`
- `https://www.googleapis.com/auth/apps.licensing`
- `https://www.googleapis.com/auth/ediscovery`
- `https://www.googleapis.com/auth/cloud_search.query`
- `https://www.googleapis.com/auth/groupssettings`

<!-- scopes:end -->

`npm run docs:scopes` regenerates this block from `ADMIN_SCOPES`, and a test
fails when the two disagree.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `auth_required` | Testing client, or revoked grant | Re-authorize, or use Internal |
| `redirect_uri_mismatch` | Client is a Web application | Create a Desktop app client |
| `invalid_client` | Secret is wrong or from another project | Copy both values again |
| 403 on a surface you enabled | API not enabled, or role missing | Check step 3 and step 9 |
| `edition_unavailable` | Tenant lacks Vault or Cloud Search | Use another surface |
| Scripts see no token | Different `GWS_STATE_DIR` or user | Point both at the same path |

Nothing in the server impersonates a user. If a task seems to need that, the
audited path is Vault (holds and exports), Data Transfer (offboarding), or
Reports and Alert Center (investigation).
