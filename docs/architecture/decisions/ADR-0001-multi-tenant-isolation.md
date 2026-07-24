# ADR-0001: Multi-tenant isolation at database and server layers

- **Status:** Accepted
- **Date:** 2026-07-23

## Context

Business data is organization-owned and browser input is not an authorization boundary.

## Decision

Scope organization-owned records with `organization_id`, enforce authorization server-side, and enable RLS for business-owned tables.

## Consequences

Migrations, repositories, tests, and integrations must preserve organization scope.

## Security implications

Tenant isolation is defense in depth: RLS complements server authorization.

## Operational implications

Staging tests verify cross-tenant and role boundaries.

## Follow-up work

Continue tenant-safety review for every new table and provider integration.
