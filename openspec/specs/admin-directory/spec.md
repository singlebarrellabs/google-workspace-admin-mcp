# admin-directory Specification

## Purpose

Manages the tenant directory: users, aliases, domains, groups, org units, roles, devices and
user security.

## Requirements

### Requirement: User lifecycle

The server SHALL expose listing, reading and updating directory users, including
creating, suspending, restoring, deleting and undeleting a user, and moving a user
between organizational units.

#### Scenario: Suspend a user

- WHEN a caller suspends a user with confirmation
- THEN the user's state is reported as suspended and the result names the user
  and the effect on their sessions

#### Scenario: Delete a user without confirmation

- WHEN a caller requests deletion without confirmation
- THEN no API request is made and the result states that deletion is recoverable
  for a limited window but immediately ends the user's access

#### Scenario: User lookup by email or id

- WHEN a caller supplies either a primary email or a user id
- THEN the same user is resolved and returned in a normalised shape

### Requirement: Groups and members

The server SHALL list and read groups, and list, add and remove members, with
explicit control over member role.

#### Scenario: Member removed from a group

- WHEN a caller removes a member with confirmation
- THEN the result reports the remaining membership state for that address

### Requirement: Organizational structure

The server SHALL list and read organizational units, roles and role assignments.

#### Scenario: Org unit resolution

- WHEN a caller supplies an org unit path or id
- THEN the org unit is resolved and its parent, name and path are returned

### Requirement: Credential and device revocation

The server SHALL list and revoke OAuth tokens, invalidate verification codes, sign
a user out of all sessions, and list and act on mobile and ChromeOS devices. Each
revocation SHALL require confirmation and SHALL report what was revoked.

#### Scenario: Sign out all sessions

- WHEN a caller signs a user out with confirmation
- THEN the result reports that all web sessions were revoked, and separately
  whether third-party OAuth tokens remain

#### Scenario: Token listing pagination

- WHEN the user has more tokens than one page
- THEN the result returns `nextPageToken` and a follow-up call with that token
  returns the next page

### Requirement: Domains and aliases

The server SHALL list and read domains, domain aliases, and user aliases.

#### Scenario: Alias listing

- WHEN a caller lists aliases for a domain
- THEN aliases are returned with their primary address association
