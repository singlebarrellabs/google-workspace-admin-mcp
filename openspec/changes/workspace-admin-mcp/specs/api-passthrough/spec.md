# api-passthrough

## ADDED Requirements

### Requirement: Allowlisted raw calls

The server SHALL provide one passthrough tool per enabled API that accepts a
method path and a JSON payload, and SHALL reject any method not present in a
static allowlist with an error naming the permitted methods.

#### Scenario: Allowed method

- WHEN a caller requests an allowlisted read method with a valid payload
- THEN the request is executed with the server credential and the response is
  returned in the standard result shape

#### Scenario: Method outside the allowlist

- WHEN a caller requests a method absent from the allowlist
- THEN no API request is made and the result lists the permitted methods for that
  API

### Requirement: Passthrough disabled by default

The passthrough tool SHALL be absent unless explicitly enabled in configuration.

#### Scenario: Default startup

- WHEN passthrough is not enabled
- THEN no passthrough tool appears in the tool list

### Requirement: Passthrough obeys safety gates

The allowlist SHALL classify every method as read or write. Passthrough write
methods SHALL be unavailable in read-only mode, SHALL require the same
confirmation convention as curated destructive tools, and SHALL be recorded in the
audit log.

#### Scenario: Write method in read-only mode

- WHEN a caller requests a write method while the server is read-only
- THEN the request is refused and the error states that write mode is disabled

#### Scenario: Unclassified method

- WHEN an allowlist entry has no read/write classification
- THEN the server refuses to load the allowlist and reports the offending entry
