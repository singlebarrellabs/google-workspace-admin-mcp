# safety-gates

## Purpose

Keeps the server read-only by default, gates destructive calls, audits every call, and turns API failures into actionable errors.

## ADDED Requirements

### Requirement: Read-only by default

The server SHALL default to read-only mode and, in that mode, SHALL NOT register
any tool that mutates tenant state. Mutating tools SHALL be absent from the tool
list rather than present and failing.

#### Scenario: Default startup

- WHEN the server starts without an explicit write-mode setting
- THEN the registered tool list contains no mutating tool
- AND every read tool remains available

#### Scenario: Write mode enabled

- WHEN write mode is enabled in configuration
- THEN mutating tools are registered with descriptions that state their effect

### Requirement: Destructive operations require confirmation

Every destructive tool SHALL require an explicit `confirm` argument. Its
description SHALL state what becomes irreversible. Without `confirm` the tool
SHALL make no API call and SHALL explain what confirmation would do.

#### Scenario: Confirmation omitted

- WHEN a caller invokes a destructive tool without `confirm`
- THEN no API request is made
- AND the result names the affected resource and the irreversible effect

#### Scenario: Confirmation supplied

- WHEN `confirm` is true and the caller is authorized
- THEN the operation is performed and the result includes the affected resource
  identifier and the resulting state

### Requirement: Audit log

The server SHALL append one JSON line per tool call to a local audit log,
recording timestamp, tool name, arguments with secrets redacted, outcome and
duration. The log SHALL be append-only from the server's perspective.

#### Scenario: Credential-bearing arguments redacted

- WHEN a tool call or an error contains a token, client secret, or authorization
  code
- THEN the audit entry records the field name with a redaction marker and never
  the value

#### Scenario: Failed call recorded

- WHEN a tool call fails
- THEN the audit entry records the error category and message with secrets
  redacted

### Requirement: Actionable error categories

The server SHALL map API failures to `edition_unavailable`,
`permission_denied`, `not_found`, `rate_limited` or `unknown`, and SHALL return a
message stating the cause and the next step.

#### Scenario: Edition-restricted surface

- WHEN an Enterprise-only API rejects the request for entitlement reasons
- THEN the error category is `edition_unavailable` and the message names the
  required edition

#### Scenario: Insufficient admin role

- WHEN the signed-in administrator lacks the role required for an operation
- THEN the error category is `permission_denied` and the message names the missing
  privilege or role

#### Scenario: Rate limited

- WHEN the API returns a rate-limit error with a retry hint
- THEN the error category is `rate_limited` and the message includes the retry
  delay
