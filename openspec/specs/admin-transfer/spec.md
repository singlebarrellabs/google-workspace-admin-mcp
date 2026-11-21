# admin-transfer Specification

## Purpose

Moves a departing user's data to another account and reports the status of each application.

## Requirements

### Requirement: Transfer listing

The server SHALL list and read transfers, filtered by status and user, with
pagination.

#### Scenario: Transfers for a user

- WHEN a caller lists transfers involving a user
- THEN each transfer is returned with old owner, new owner, status and requested
  time

#### Scenario: Status filter

- WHEN a caller filters by status
- THEN only transfers in that state are returned

### Requirement: Start a transfer

The server SHALL start a transfer of mail, Drive and calendar data between two
users, and SHALL require confirmation naming both accounts and the applications
included.

#### Scenario: Confirmation names both accounts

- WHEN a caller starts a transfer without confirmation
- THEN no API request is made and the result names the old owner, new owner and
  included applications

#### Scenario: Transfer accepted

- WHEN a caller starts a transfer with confirmation
- THEN the result returns the transfer identifier and the API's current state,
  and states that the transfer continues after the call returns

### Requirement: Transfer states

The server SHALL distinguish pending, in-progress, completed and failed transfers,
and SHALL report failure reasons.

#### Scenario: Failed transfer

- WHEN a listed transfer is in a failed state
- THEN the result includes the failure reason and does not report the data as
  transferred

#### Scenario: Already-transferred data

- WHEN a caller starts a transfer for data already transferred to the same new
  owner
- THEN the API's rejection is mapped to a message stating that the data is already
  with the requested owner
