# admin-licensing

## Purpose

Lists, assigns and revokes Workspace licence seats so access matches what the subscription pays for.

## ADDED Requirements

### Requirement: List licenses

The server SHALL list and read license assignments for a product and sku,
paginating results.

#### Scenario: Assignments listed

- WHEN a caller lists assignments for a product and sku
- THEN each assignment is returned with user, product, sku and status, plus a page
  token when more exist

### Requirement: Assign and revoke

The server SHALL assign and revoke licenses. Both SHALL require confirmation, and
revocation SHALL state which product access the user loses.

#### Scenario: Assign when none available

- WHEN a caller assigns a license and the tenant has no available seats
- THEN the error states that no seats are available for that product and sku

#### Scenario: Revoke

- WHEN a caller revokes a license with confirmation
- THEN the result names the user, product and sku, and states that access to the
  product ends immediately

#### Scenario: Already assigned

- WHEN a caller assigns a license the user already holds
- THEN the result reports the existing assignment instead of failing
