# credentials

## Purpose

Authenticates with one administrator-owned OAuth client, stores the token owner-only, and reports what the tenant can reach.

## ADDED Requirements

### Requirement: Single admin credential

The server SHALL authenticate with exactly one credential: an OAuth client owned
by the operator, authorized interactively by an administrator. The server SHALL
NOT support service accounts, JWT bearer grants, domain-wide delegation, or any
credential that can act as another user.

#### Scenario: Startup with a missing credential

- WHEN no stored token exists and no credential is configured
- THEN the server starts and every admin tool reports that authorization is
  required, naming the setup command
- AND no tool call fails with an opaque authentication error

#### Scenario: Second credential source configured

- WHEN configuration includes a service-account key path or a delegated subject
- THEN startup fails with an error stating that impersonation is a permanent
  non-goal and listing the supported credential

### Requirement: Interactive authorization

The server SHALL run an OAuth loopback flow that prints an authorization URL and
receives the callback on a local port, so it works on a machine without a
browser.

#### Scenario: Authorization completes

- WHEN the administrator opens the printed URL and consents
- THEN the server stores the refresh token and reports the signed-in address,
  granted scopes, and reachable surfaces

#### Scenario: Consent denied

- WHEN the administrator declines consent
- THEN the server reports which scopes were declined and leaves any existing
  token untouched

### Requirement: Token storage

The server SHALL persist tokens to a file readable only by its owner, written
atomically, and SHALL refresh access tokens without operator interaction while
the refresh token is valid.

#### Scenario: Permissive token file

- WHEN the token file has permissions wider than owner-only
- THEN the server refuses to read it and instructs the operator to fix or
  re-authorize

#### Scenario: Refresh token expired

- WHEN refresh fails because the grant expired or was revoked
- THEN the error names the cause, explains that clients left in Testing status
  expire refresh tokens after seven days, and asks for re-authorization

### Requirement: Authorization status

The server SHALL expose `gws_auth_status` reporting the signed-in administrator,
granted scopes, refresh-token expiry, and, per surface, whether the tenant can
use it.

#### Scenario: Enterprise-only surface unavailable

- WHEN the tenant is not Enterprise or Education
- THEN status marks Vault and Cloud Search unavailable with the edition reason
- AND the corresponding tools return that reason rather than a permission error
