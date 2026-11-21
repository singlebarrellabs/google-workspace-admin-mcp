# Google Workspace admin plane MCP server

## Why

Google ships hosted MCP servers for user surfaces — Gmail, Drive, Calendar — and
nothing for the admin plane. The community servers that touch admin APIs are
shallow, stale, or built around service-account key files. Meanwhile the work an
administrator actually does is sequential: investigate an account, revoke its
access, suspend it, offboard it, transfer its data, reclaim its license.

A model can drive that sequence, but only if the tools are typed, safe by
default, and honest about which surfaces the tenant can even use.

## What Changes

- New MCP server, `google-workspace-admin-mcp`, stdio transport, published to npm.
- Eight admin surfaces: Directory, Reports, Vault, Cloud Search,
  Data Transfer, Enterprise License Manager, Groups Settings, Calendar Resources.
- One allowlisted raw-call tool per enabled API for cases curated tools miss.
- One credential: an admin user OAuth client owned by the operator. No service
  account, no domain-wide delegation, no impersonation — a permanent non-goal
  enforced by a test over the built server.
- Read-only by default: mutating tools are omitted from the server, destructive
  operations require an explicit confirm argument, every call is appended to a
  local audit log, and edition-restricted surfaces fail with an actionable
  message instead of a bare 403.
- Roughly 70 tools, one release, no version phases. Surfaces are independent and
  built as parallel slices.

## Impact

- Affected specs: `credentials`, `safety-gates`, `api-passthrough`,
  `admin-directory`, `admin-reports`, `admin-vault`,
  `admin-cloud-search`, `admin-transfer`, `admin-licensing`,
  `admin-groups-settings`, `admin-resources`, `docs-setup`.
- Affected code: new repository; `src/`, `test/`, `docs/`.
- Tracking: epic #14, capability issues #1–#13.
