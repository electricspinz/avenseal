# ADR-0002: Appointment service snapshots preserve booking-time history

- **Status:** Accepted
- **Date:** 2026-07-23

## Context

Service names, durations, and prices can change after booking.

## Decision

Store immutable booking-time service snapshots on appointments and use them for historical operations.

## Alternatives considered

Read only current service configuration.

## Consequences

Migration backfill handles only unambiguous legacy rows; documented fallback remains for ambiguous records.

## Security implications

Snapshot values are server-derived, never authoritative client input.

## Operational implications

Calendar sync and payment history use snapshot data.

## Follow-up work

Review snapshot requirements for future configurable intake and pricing.
