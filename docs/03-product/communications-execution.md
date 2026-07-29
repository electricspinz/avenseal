# Communications Execution Engine

**Status:** Planned delivery architecture with a provider-neutral execution foundation. It does not change SMTP, enqueue background work, or persist communications.

**Related:** [Appointment Automation Rules](appointment-automation.md) · [Automation Engine PRD](automation-engine.md) · [Automation Engineering Contract](../04-development/automation-contract.md)

## Responsibility boundary

Automation rules decide **what** customer communication should be considered. The Communications Execution Engine translates a validated `queue_communication` action into a provider-neutral request, selects an injected channel-capable provider, normalizes its result, and returns descriptive timeline and Operations Feed output.

It does not evaluate appointment policy, generate reminders, select a vendor in a rule, send through existing SMTP code, schedule delivery, create a worker, or persist data.

## Request and delivery contracts

Each immutable request includes organization/customer/appointment scope, semantic purpose, email as the current preferred channel abstraction, fallback channels, locale, safe metadata, source rule/version, source event, and correlation ID. It never requires a vendor template ID.

| Delivery status | Operational result |
| --- | --- |
| `delivered` | A safe timeline entry and existing `communication_sent` feed intent. |
| `queued` | Existing `communication_queued` feed intent. |
| `failed` | Existing `communication_failed` feed intent and typed retry classification. |
| `skipped`, `cancelled`, `unsupported` | Typed execution result without inventing unsupported Operations Feed event types. |

## Safety and idempotency

The engine reuses the Automation Engine idempotency boundary with organization, source rule/version, source event, semantic purpose, and reminder window where relevant. A duplicate is skipped before a provider is invoked. Safe pre-delivery failures release the reservation; uncertain delivery, final-audit failure, and completion failure retain it for manual review.

Execution audit records describe start, provider selection, provider result, and completion. They are internal evidence. Timeline and Operations Feed entries are descriptive user-facing operational outputs and must not duplicate raw audit records or provider exceptions.
