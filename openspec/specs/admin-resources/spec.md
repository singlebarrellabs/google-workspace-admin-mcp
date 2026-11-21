# admin-resources Specification

## Purpose
Manages calendar resources - buildings, rooms and features - so a room can be booked.

## Requirements

### Requirement: Buildings and rooms

The server SHALL list, read, create, update and delete buildings and rooms, with
pagination.

#### Scenario: Rooms listed for a building

- WHEN a caller lists rooms for a building
- THEN each room is returned with capacity, floor and resource identifiers, plus a
  page token when more exist

#### Scenario: Delete a room that still has features

- WHEN a caller deletes a room with confirmation
- THEN the deletion proceeds and the result states which feature assignments were
  removed with it

### Requirement: Features

The server SHALL list, read, create, update and delete resource features.

#### Scenario: Feature created

- WHEN a caller creates a feature on a building
- THEN the result returns the feature with its identifier and the building it
  belongs to
