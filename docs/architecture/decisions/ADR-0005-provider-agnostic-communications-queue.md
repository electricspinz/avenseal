# ADR-0005: Communications use a provider-independent database-backed queue

- **Status:** Proposed
- **Date:** 2026-07-23

## Context

Appointment communications require retries, delivery records, and future multi-channel support.

## Decision

Use tenant-scoped persisted jobs and provider adapters, beginning with email.

## Alternatives considered

Direct provider calls from business mutations; a provider-specific queue.

## Consequences

Adds queue processing and reconciliation responsibilities while protecting business transactions from delivery failures.

## Security implications

Links and credentials remain server-side; job payloads minimize sensitive data.

## Operational implications

Requires scheduled processing, retries, and delivery health monitoring.

## Follow-up work

Implement in PR #11 and update status when merged.
