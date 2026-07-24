# ADR-0003: Google Calendar synchronization uses persisted idempotent mappings

- **Status:** Accepted
- **Date:** 2026-07-23

## Context

Provider calls can time out or succeed before local persistence completes.

## Decision

Persist a deterministic, organization-scoped Calendar mapping before synchronization and reconcile create/update/delete retries against it.

## Consequences

Calendar operations are recoverable and no database trigger calls Google directly.

## Security implications

Provider identifiers and errors remain internal.

## Operational implications

Current retries use a protected endpoint; scheduling is follow-up work.

## Follow-up work

Add scheduled retry processing and health metrics.
