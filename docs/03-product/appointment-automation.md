# Appointment Automation Rules

**Status:** Planned product behavior with a provider-neutral rule-contract foundation. These rules describe normalized actions; they do not send communications, schedule work, or write to the database.

**Related:** [Automation Engine PRD](automation-engine.md) · [Automation Rule Catalog](automation-rules.md) · [Communications Execution Engine](communications-execution.md) · [Automation Engineering Contract](../04-development/automation-contract.md) · [Mission Control PRD](mission-control.md)

## Event contracts

All appointment lifecycle events are immutable and tenant-scoped. They include a stable `eventId`, `organizationId`, `appointmentId`, relevant customer identifiers, occurrence time, appointment status, and only the additional evidence needed by their rule. The `eventId` is the logical execution identity; it is not generated from a runtime timestamp or random value.

| Event | Required additional evidence | Rule |
| --- | --- | --- |
| `appointment_created` | Future appointment start time | `appointment.created` v1 |
| `appointment_confirmed` | Confirmation organization identity | `appointment.confirmed` v1 |
| `appointment_cancelled` | Cancellation organization identity | `appointment.cancelled` v1 |
| `reminder_window_reached` | Reminder window and queue/send state | `appointment.reminder-due` v1 |
| `appointment_completed` | Completion time, follow-up/review-request state and policy | `appointment.follow-up-due` v1 |

## Normalized actions

Rules return only descriptive actions. A future approved dispatcher may translate these actions through existing repository and communications boundaries.

| Action | Purpose |
| --- | --- |
| `queue_communication` | Describes a semantic purpose: confirmation, cancellation, reminder, follow-up, or review request. It contains no provider/template identifier. |
| `create_timeline_entry` | Describes a safe appointment-history event such as `appointment_created`, `appointment_confirmed`, `reminder_queued`, or `follow_up_queued`. |
| `update_appointment_status` | Describes a requested status transition; confirmation omits it when already confirmed. |
| `create_operations_feed_entry` | Describes meaningful appointment lifecycle visibility only when supported by the existing Operations Feed event model. |

Actions contain the organization and appointment identity, source event reference, safe summaries, and minimal downstream metadata. They do not contain secrets, raw errors, provider names, email bodies, or customer display content.

## Eligibility and idempotency

Rules validate tenant ownership, required identifiers, appointment lifecycle state, and purpose-specific communication state before describing actions. The executor derives idempotency from organization, rule ID/version, event identity, and rule policy discriminator. Thus the same lifecycle event is duplicate-safe, while a cancellation, reminder window, or another tenant’s appointment remains distinct.

## Follow-up timing

The follow-up rule describes a `notBefore` timestamp exactly 24 hours after the trusted completion time. That is metadata for a later dispatcher; this rule layer does not create a scheduler, queue, worker, timer, or delayed job.

## Audit and Operations Feed

Automation audit records remain internal execution evidence. Operations Feed actions are user-facing operational intent and are emitted only for supported, meaningful appointment lifecycle events. Reminder and follow-up actions do not invent new Operations Feed event types.
