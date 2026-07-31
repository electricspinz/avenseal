# Appointment Readiness Domain

**Status: Current — Sprint 25.1B domain foundation.** Appointment readiness is a deterministic, server-only calculation that describes whether an appointment can proceed operationally. It is derived from existing appointment, payment, document-review, and External Session records; it does not write state, trigger communication, or change an appointment lifecycle status.

## Purpose and boundary

The readiness domain is the single source of truth for a future admin and Client Workspace readiness presentation. It consumes trusted, tenant-scoped data from the owning repository boundaries. It does not replace payment, document, appointment, or BlueNotary rules.

BlueNotary (or another provider) performs the live notarization. A provider session marked `completed` is not itself proof that Avenseal's appointment is completed. Staff must make the existing appointment lifecycle update.

## States and precedence

| State | Meaning |
| --- | --- |
| `cancelled` / `completed` | Existing terminal appointment state. |
| `blocked` | Staff review, clarification, payment exception, session cancellation, completion confirmation, or invalid scoped dependency prevents progress. |
| `waiting_for_payment` | No trusted paid payment exists. |
| `waiting_for_documents` | Documents are required but none are active. |
| `waiting_for_review` | Active documents are uploaded and awaiting staff review. |
| `waiting_for_replacement` | An active document needs replacement. |
| `waiting_for_session` | Documents and payment are ready, but an External Session is absent, pending, or unknown. |
| `ready_for_notary` | Payment is paid, all active required documents are approved, and the provider session is scheduled or ready. |
| `in_progress` | The trusted staff-managed External Session is marked in progress. |

Evaluation is deterministic: scoped dependency integrity, terminal or held appointment state, payment, documents, then External Session. No records are mutated and no audit event is created for a derived result.

## Document requirement

Documents are required by default. Therefore, an appointment with no active documents resolves to `waiting_for_documents`. The only planned exception is a future **durable, server-side organization/service setting** that explicitly marks documents as not required. Browser input, service names, and absence of a document record never waive the requirement.

## Current limitations and planned follow-up

Sprint 25.2A makes Appointment Details the first UI consumer. Its compact summary card receives only the calculated readiness result and its safe prerequisite facts—Appointment, Payment, Documents, and Online Session. The card is informational: it cannot mutate appointment status, invoke automation, or trigger communication, and it never renders source records, IDs, URLs, review notes, or provider metadata.

Sprint 25.2B makes Mission Control the second UI consumer. Its overview dynamically batches tenant-scoped payment, document, and External Session readiness sources, invokes the canonical engine once per unique appointment, and displays state counts plus a compact `ready_for_notary` queue. `in_progress` appears in the operational count only; it is not included in the ready queue. Completed and cancelled appointments appear only as terminal counts, not as queue items. The projection contains customer name, schedule, service name, readiness label, and an Appointment Details link only—never source records or sensitive metadata.

The overview remains derived, informational, and read-only. It introduces no readiness persistence, audit event, automation, communication, appointment mutation, or Client Workspace change. The current implementation uses three batched source reads in addition to the existing tenant-scoped appointment list.

Sprint 25.2C makes the Appointment List the third admin readiness consumer. The existing appointment status remains visible beside a compact readiness badge in the desktop table and mobile list layout. The list reuses the same tenant-scoped batch sources and canonical calculation path as Mission Control, but passes each row only its appointment ID and readiness state. It does not expose source data or the detailed explanation, which remains on Appointment Details. Readiness neither changes existing list ordering nor adds filtering, pagination, persistence, automation, or Client Workspace behavior. Future readiness filtering may be considered separately.

Sprint 25.3A makes Client Workspace the first customer-facing readiness consumer. The token-owned appointment is evaluated server-side with the canonical engine, then mapped to a separate customer-safe state, label, explanation, next-step message, and visual tone. The compact **Your Appointment Status** card appears after the appointment summary and before payment, documents, and online-session details. It adds no action or link: it references the existing sections below.

Customer readiness intentionally omits operational reasons, raw appointment/payment status, document review details, provider metadata, session URLs, and all token or storage data. `blocked` becomes the generic customer state **Action required**. If a readiness source is unavailable or calculation cannot complete, the projection conservatively uses that same state while preserving the rest of Client Workspace. The card does not imply that Avenseal performs identity verification or notarization; BlueNotary continues to perform the live remote online notarization session. This work adds no persistence, automation, communications, payment/document/session workflow, or historical readiness tracking.

## Readiness transition detection

Sprint 25.4A adds a server-only, callable transition boundary for trusted workflows that have already changed underlying records. It compares two canonical readiness results; it never recalculates rules or persists a current readiness value. A meaningful transition produces the safe `appointment.readiness_changed` audit event, scoped to its organization and appointment. No communication, automation, reminder, session creation, or appointment mutation follows from this event.

| Category | Meaningful examples |
| --- | --- |
| `payment_progress` | `waiting_for_payment` advances to a document or later active readiness state. |
| `document_progress` | Documents move into review, a replacement returns to review, or review advances to session readiness. |
| `document_regression` | Review or an otherwise-ready appointment requires a replacement document. |
| `session_progress` | An online session becomes ready or starts. |
| `readiness_achieved` / `readiness_lost` | A later active state becomes ready, or a ready appointment loses its session readiness. |
| `blocked` / `terminal` | An active appointment becomes blocked, cancelled, or completed. |
| `no_change` | The canonical state is unchanged, or a changed pair has no current audit policy. |

The boundary requires a trusted, stable discriminator supplied by the invoking workflow from persisted facts. It checks for an existing audit record with the same organization, appointment, action, and discriminator before writing, so a retried invocation does not add another audit record. A later or reverse transition must use its own discriminator and receives its own audit event. The current `audit_logs` table has no uniqueness constraint, so this is a scoped repository duplicate guard rather than a new persistence model; callers must not use random values, browser input, tokens, notes, or URLs as discriminators.

Audit metadata contains only previous and current canonical states, a category, `actorType: system`, and the discriminator. It excludes customer data, payment/processor identifiers, document names and review notes, provider URLs and references, tokens, and storage data. Future trusted workflows may invoke this informational boundary after their own state change, but readiness remains derived and no readiness automation is implemented.

## Staff readiness alerts

Sprint 25.4B makes the Operations Feed the first staff-facing consumer of readiness-transition audits. It does not create another alert store: the existing, tenant-scoped `appointment.readiness_changed` audit event is projected into one informational feed item when it matches an approved high-value transition. The only destination is the existing Appointment Details route, where normal authorization remains enforced.

| Transition | Alert | Severity |
| --- | --- | --- |
| `waiting_for_session` → `ready_for_notary` | Ready for notarization | Success |
| `ready_for_notary` → `waiting_for_replacement` | Document replacement needed | Warning |
| `ready_for_notary` → `waiting_for_session` | Online session unavailable | Warning |
| Active → `blocked` | Appointment requires attention | Error |
| Active → `cancelled` | Appointment cancelled | Warning |

No alert is projected for unchanged readiness, ordinary payment/document progress, replacement resolution, or completion. Alert title, explanation, severity, transition category, timestamp, appointment route, and a stable discriminator are derived server-side from the canonical transition; no browser input or raw readiness source is accepted. Customer communications, appointment mutation, BlueNotary automation, alert dismissal, escalation, and assignment remain out of scope.

Repeated records with the same organization, appointment, alert category, and transition discriminator collapse to one feed item. As with readiness audits, the underlying lookup-before-insert pattern does not provide a distributed atomic uniqueness guarantee because `audit_logs` has no matching unique constraint; a later hardening sprint can add one only if required. The Operations Feed repository query is tenant-scoped and its projection excludes customer document data, payment/processor data, review data, provider links/references, tokens, and storage data.

Related: [Secure Document Storage](secure-document-storage.md) · [External Session Management](external-session-management.md) · [Client Portal Foundation](client-portal.md)
