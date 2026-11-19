# admin-alerts

## ADDED Requirements

### Requirement: Alert listing and retrieval

The server SHALL list alerts with filter, page size and page token, and SHALL
retrieve a single alert with its full detail. Missing optional fields SHALL be
omitted rather than rendered as nulls.

#### Scenario: Filtered listing

- WHEN a caller filters alerts by type and time range
- THEN only matching alerts are returned with a `nextPageToken` when more exist

#### Scenario: Alert with sparse fields

- WHEN an alert lacks source, security-investigation or metadata fields
- THEN the result omits those fields and still returns the alert

### Requirement: Alert feedback

The server SHALL record feedback on an alert.

#### Scenario: Feedback recorded

- WHEN a caller submits feedback for an alert
- THEN the result confirms the recorded feedback type and names the alert

### Requirement: Delete and undelete require confirmation

Deleting or undeleting an alert SHALL require confirmation, and the description
SHALL state the retention consequence.

#### Scenario: Delete without confirmation

- WHEN a caller deletes an alert without confirmation
- THEN no API request is made and the result explains that the alert disappears
  from the console for the deletion window and can be restored only until it
  expires
