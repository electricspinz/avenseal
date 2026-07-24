# PRD: Provider-agnostic Communications Engine

- **Status:** Active
- **Owner:** Avenseal product and engineering
- **Milestone:** PR #11

## Problem and customer

Customers need dependable, timely information about appointments; staff need a durable record of delivery attempts without tying the product to one communications vendor.

## Goals

- Create a provider abstraction with email-first delivery.
- Persist communication jobs, delivery attempts, retries, and idempotency state.
- Send confirmations, appointment updates, cancellations, 24-hour reminders, 2-hour reminders, and secure appointment links.
- Apply organization branding and prepare the model for SMS and push.

## Non-goals

- SMS, push delivery, marketing campaigns, and AI-generated legal or notarial advice.

## Requirements

- Jobs are database-backed, tenant-scoped, retryable, and idempotent.
- Successful appointment or payment operations remain successful if delivery fails.
- Secure links are short-lived or revocable as appropriate; tokens and provider secrets are never logged.
- Delivery status is visible to authorized staff and supports future provider reconciliation.

## Testing and acceptance criteria

- Unit coverage for scheduling, idempotency, provider failures, and templates.
- Integration coverage for tenant isolation and persistence.
- E2E coverage for relevant customer/admin status.
- A failed provider call does not roll back an appointment, payment, or Calendar operation.
