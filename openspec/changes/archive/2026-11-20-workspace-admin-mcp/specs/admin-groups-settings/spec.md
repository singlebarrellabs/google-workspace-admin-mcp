# admin-groups-settings

## Purpose

Reads and partially updates a group's membership, posting, moderation and delivery settings.

## ADDED Requirements

### Requirement: Read group settings

The server SHALL read the settings of a group the administrator manages,
returning the settings object in a normalised shape.

#### Scenario: Settings read

- WHEN a caller reads settings for a group
- THEN the result includes membership, posting, moderation and delivery settings
  with their current values

#### Scenario: Group not manageable

- WHEN the administrator cannot manage the group
- THEN the error category is `permission_denied` and the message states that only
  owners and managers of the group can change its settings

### Requirement: Partial update

The server SHALL update only the fields a caller supplies, leaving every other
setting unchanged, and SHALL NOT perform a read-modify-write of unrelated fields.

#### Scenario: Single field updated

- WHEN a caller updates one setting
- THEN the request body contains only that field and the result reports the new
  value plus the fields that were left unchanged

#### Scenario: Unknown field

- WHEN a caller supplies a setting name the API does not accept
- THEN the call fails before any request and lists the accepted setting names
