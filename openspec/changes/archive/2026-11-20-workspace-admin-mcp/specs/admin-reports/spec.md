# admin-reports

## Purpose

Reports audit activity and usage, so an administrator can answer who did what and how much was used.

## ADDED Requirements

### Requirement: Audit activity queries

The server SHALL list audit activities for a named application with filters for
actor, target, event name and time range, and SHALL paginate results.

#### Scenario: Login events for one user

- WHEN a caller requests login activities for a user over a time range
- THEN each event is returned as a flat row with timestamp, actor, event name,
  outcome and source IP when present

#### Scenario: Time range required by the API

- WHEN a caller omits a required time range
- THEN the tool reports the default range it applied

### Requirement: Usage reports

The server SHALL return customer and entity usage reports for a requested date or
range, with the available parameters exposed rather than hard-coded.

#### Scenario: Parameter discovery

- WHEN a caller requests a report without parameters
- THEN the result includes the parameters available for that report

#### Scenario: No data for a date

- WHEN the requested date has no data
- THEN the result distinguishes an empty report from an error

### Requirement: Read-only surface

The Reports surface SHALL register no mutating tools.

#### Scenario: Read-only tool list

- WHEN the server starts in read-only mode
- THEN every Reports tool available in write mode is also available
