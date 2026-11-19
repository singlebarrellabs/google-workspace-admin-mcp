# docs-setup

## ADDED Requirements

### Requirement: Setup documentation

The repository SHALL document, end to end, how to create the OAuth client, enable
the required APIs, grant the admin role, choose read-only or write mode, and
identify which surfaces require which Google Workspace edition.

#### Scenario: Clean Cloud project

- WHEN an operator follows the setup document in a new Cloud project
- THEN every step is achievable without prior knowledge of the admin SDK, and the
  document names the exact console paths

#### Scenario: Testing-status trap

- WHEN the OAuth client remains in Testing publishing status
- THEN the document and `gws_auth_status` both state that refresh tokens expire
  after seven days and describe the fix

### Requirement: Tool reference

`docs/TOOLS.md` SHALL list every registered tool with its surface, whether it
mutates state, and any edition requirement. A tool absent from the table SHALL
fail review.

#### Scenario: New tool added

- WHEN a PR adds a tool without a corresponding table row
- THEN the PR is incomplete; the table is generated from code and checked in CI

### Requirement: Scope list derived from code

The documented scope list SHALL be generated from the configured scope set, and a
test SHALL assert that no user-content scope is ever requested.

#### Scenario: User-content scope introduced

- WHEN the scope set gains a Gmail, Drive, Docs, Calendar or similar user-content
  scope
- THEN the test fails and names the offending scope

### Requirement: Smoke scripts are opt-in

Each surface MAY ship a smoke script that runs against a real tenant, and no smoke
script SHALL run as part of CI.

#### Scenario: CI run

- WHEN CI executes the standard check task
- THEN no network call to Google is made

### Requirement: Smoke output is redacted by default

Smoke scripts SHALL replace emails, domains, customer IDs, group names and resource
identifiers with stable placeholders before writing output, and SHALL require an
explicit opt-in with interactive confirmation to emit unredacted output.

#### Scenario: Default smoke run

- WHEN a smoke script runs without flags
- THEN its output contains only placeholders and remains internally consistent
  across the run

#### Scenario: Unredacted output requested

- WHEN a caller passes the raw flag
- THEN the script names the destination and requires interactive confirmation
  before writing
- AND the raw flag is unavailable in CI

#### Scenario: Contribute without a tenant

- WHEN a contributor has no Google Workspace tenant
- THEN fixture-based tests cover the surface and no contribution is blocked
