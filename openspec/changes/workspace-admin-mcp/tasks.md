# Tasks

Sections 1–3 block everything else. Sections 4–12 are independent surfaces and
can proceed in parallel worktrees. Issue numbers are in parentheses.

## 1. Bootstrap

- [ ] 1.1 MCP server skeleton: stdio transport, tool registry, graceful shutdown
- [ ] 1.2 Shared result helper: `{ items, nextPageToken?, summary }` and a
      structured-content wrapper
- [ ] 1.3 Error mapper: `edition_unavailable`, `permission_denied`, `not_found`,
      `rate_limited`, `unknown`
- [ ] 1.4 Pagination helper with pageToken round-trip tests
- [ ] 1.5 CI: typecheck, biome, markdownlint, vitest, beta publish on PR
- [ ] 1.6 Test harness for nock fixtures plus a fixture-recording helper

## 2. Credentials (#1)

- [ ] 2.1 Internal OAuth client config: client ID, secret, redirect URI
      (loopback), scope set
- [ ] 2.2 Loopback consent flow with a local callback and a printed URL for
      headless use
- [ ] 2.3 Token store: owner-only file permissions, atomic write, refresh
- [ ] 2.4 `gws_auth_status`: signed-in admin, granted scopes, surface capability,
      refresh-token expiry warning
- [ ] 2.5 Failure paths: revoked grant, expired refresh token, wrong client type
- [ ] 2.6 Non-goal test: no service-account credential type, no `subject` claim,
      no `as` parameter in any tool schema

## 3. Safety (#2, #3)

- [ ] 3.1 Read-only gate that omits mutating tools at registration time
- [ ] 3.2 Confirm gate for destructive tools, with per-tool description of what
      becomes irreversible
- [ ] 3.3 Append-only JSONL audit log with argument redaction
- [ ] 3.4 Edition capability probe, cached per process, surfaced per tool
- [ ] 3.5 Passthrough allowlist registry with per-method mutating classification
- [ ] 3.6 Passthrough tool, disabled by default
- [ ] 3.7 Tests: read-only tool list, confirm refusal, audit redaction, unknown
      passthrough method

## 4. Directory (#4)

- [ ] 4.1 Service module: users (list, get, create, update, suspend, unsuspend,
      delete, undelete, move org unit)
- [ ] 4.2 Aliases (list, insert, delete)
- [ ] 4.3 Groups and members (list, get, create, update, delete, add, remove)
- [ ] 4.4 Org units (list, get, insert, update, delete)
- [ ] 4.5 Roles and role assignments (list, insert, delete)
- [ ] 4.6 Devices (mobile and ChromeOS: list, get, action)
- [ ] 4.7 User security: tokens (list, delete), verification codes (generate,
      invalidate), sign-out
- [ ] 4.8 Domains and domain aliases (list, get)
- [ ] 4.9 Fixtures per tool, including suspend/delete/revoke confirm paths

## 5. Reports (#5)

- [ ] 5.1 Audit activities: list with application, actor, time-range, event-name
      filters
- [ ] 5.2 Usage reports: customer and entity, with date and parameter filters
- [ ] 5.3 Normaliser that flattens nested activity events into per-event rows
- [ ] 5.4 Fixtures for login, admin, token and OAuth-grant events

## 6. Alert Center (#6)

- [ ] 6.1 List and get alerts with filter and page token
- [ ] 6.2 Feedback create
- [ ] 6.3 Delete and undelete behind confirm
- [ ] 6.4 Fixtures including an alert with missing optional fields

## 7. Vault (#7)

- [ ] 7.1 Matters: list, get, create, update, delete, close, reopen
- [ ] 7.2 Holds: list, get, create, update, delete; held accounts add/remove
- [ ] 7.3 Saved queries: list, get, create, delete
- [ ] 7.4 Exports: list, get, create, delete
- [ ] 7.5 Operations: get with poll helper and terminal-state detection
- [ ] 7.6 Edition-aware failure for non-Enterprise tenants
- [ ] 7.7 Fixtures: export lifecycle, long-running operation transitions,
      permission denial on a matter not shared with the admin

## 8. Cloud Search (#8)

- [ ] 8.1 Query with page size, token and sort options
- [ ] 8.2 Suggest
- [ ] 8.3 Data sources list
- [ ] 8.4 Distinguish "no results" from "no configured data source"
- [ ] 8.5 Edition-aware failure for non-Enterprise tenants

## 9. Data Transfer (#9)

- [ ] 9.1 List and get transfers, filtered by status and user
- [ ] 9.2 Insert transfer for mail, Drive and calendar with confirm naming both
      accounts
- [ ] 9.3 Pending, completed and failed state handling
- [ ] 9.4 Fixtures: already-transferred data, invalid old owner

## 10. License Manager (#10)

- [ ] 10.1 List and get assignments
- [ ] 10.2 Assign and revoke with confirm
- [ ] 10.3 Fixtures: no license available, already assigned, revoke with data loss
      warning

## 11. Groups Settings (#11)

- [ ] 11.1 Read group settings
- [ ] 11.2 Partial update with explicit field set, no read-modify-write of
      unrelated fields
- [ ] 11.3 Fixtures: permission denied for a group the admin does not own

## 12. Calendar Resources (#12)

- [ ] 12.1 Buildings: list, get, insert, update, delete
- [ ] 12.2 Rooms: list, get, insert, update, delete
- [ ] 12.3 Features: list, get, insert, update, delete
- [ ] 12.4 Fixtures: pagination, deletion of a resource in use

## 13. Documentation (#13)

- [ ] 13.1 `docs/SETUP.md`: Cloud project, API enablement, Internal client,
      admin role, read-only vs write mode, Testing-status token trap
- [ ] 13.2 `docs/TOOLS.md`: every tool with surface, mutating flag, edition notes
- [ ] 13.3 Scope list generated from code and asserted against the client config
- [ ] 13.4 Per-surface smoke scripts, documented as opt-in
- [ ] 13.5 README install section once published

## 14. Release

- [ ] 14.1 Full `npm run check` green
- [ ] 14.2 Non-goal test green
- [ ] 14.3 Publish 0.1.0, verify `npx` install against a real tenant
- [ ] 14.4 Archive this change after sync review
