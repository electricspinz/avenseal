# ADR-0004: External integration failures do not roll back successful appointments

- **Status:** Accepted
- **Date:** 2026-07-23

## Context

Payments, Calendar, and communication providers are independently available.

## Decision

Commit authoritative business state first; capture external failures as retryable operational state.

## Consequences

Customer-safe failure messaging, observability, and retries are required.

## Security implications

Logs must not include credentials, tokens, or sensitive customer details.

## Operational implications

Staff need delivery and sync status visibility.

## Follow-up work

Formalize provider reconciliation and alerts.
