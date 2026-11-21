# admin-cloud-search

## Purpose

Searches the tenant's indexed content through Cloud Search, and explains an empty result as
either no match or no configured data source.

## ADDED Requirements

### Requirement: Query

The server SHALL run Cloud Search queries as the authenticated administrator with
page size, page token, sort and data-source options exposed.

#### Scenario: Query with results

- WHEN a caller queries a term the tenant can match
- THEN results are returned with title, snippet, URL and source, plus a page token
  when more exist

#### Scenario: No configured data source

- WHEN the tenant has no configured data source
- THEN the result states that Cloud Search returns nothing until a data source is
  configured, and distinguishes this from a query that simply matched nothing

### Requirement: Suggest

The server SHALL return query suggestions for a partial term.

#### Scenario: Suggestions returned

- WHEN a caller supplies a partial term
- THEN suggestions are returned as a list of strings

### Requirement: Data sources

The server SHALL list the data sources available to the tenant.

#### Scenario: Source listing

- WHEN a caller lists data sources
- THEN each source is returned with its name, identifier and state

### Requirement: Edition awareness

Every Cloud Search tool SHALL fail with `edition_unavailable` naming the required
edition when the tenant cannot use Cloud Search.

#### Scenario: Non-Enterprise tenant

- WHEN a caller invokes a Cloud Search tool without entitlement
- THEN the error names the required edition and does not suggest retrying
