# admin-vault Specification

## Purpose

Supports eDiscovery - matters, holds, saved searches and exports - on tenants that have Vault.

## Requirements

### Requirement: Matter management

The server SHALL list, read, create, update, close, reopen and delete matters, and
SHALL report which matters the authenticated administrator can access.

#### Scenario: List matters

- WHEN a caller lists matters
- THEN each matter is returned with its state, name and shared status, and a page
  token when more exist

#### Scenario: Matter not visible to the administrator

- WHEN a caller requests a matter the administrator cannot see
- THEN the error states that Vault access depends on matter sharing or the View
  All Matters privilege, and names the matter identifier

### Requirement: Holds

The server SHALL list, read, create, update and delete holds, and add or remove
held accounts.

#### Scenario: Held account removed

- WHEN a caller removes a held account with confirmation
- THEN the result reports the account and states that data covered by the hold is
  no longer preserved

### Requirement: Saved queries

The server SHALL list, read, create and delete saved queries.

#### Scenario: Saved query created

- WHEN a caller creates a saved query with a search corpus and query terms
- THEN the result returns the saved query with its identifier and corpus

### Requirement: Export lifecycle

The server SHALL create, list, read and delete exports, and SHALL poll the
long-running operation for an export until it reaches a terminal state or the
caller's poll budget is exhausted.

#### Scenario: Export created

- WHEN a caller creates an export with confirmation
- THEN the result returns the export and its operation name, and states that the
  output lands in a Cloud Storage bucket or Drive destination selected by the
  request

#### Scenario: Operation still running

- WHEN a poll finds the operation unfinished
- THEN the result reports the operation state and the elapsed time, and does not
  claim completion

#### Scenario: Operation failed

- WHEN the operation completes with an error
- THEN the result reports the failure reason and the export identifier

### Requirement: Edition awareness

Every Vault tool SHALL fail with `edition_unavailable` naming the required edition
when the tenant is not Enterprise or Education.

#### Scenario: Non-Enterprise tenant

- WHEN a caller invokes a Vault tool on a tenant without Vault
- THEN the error states that Vault requires Google Workspace Enterprise or
  Education, and suggests the alternative surface for the task
