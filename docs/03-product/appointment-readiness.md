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

Related: [Secure Document Storage](secure-document-storage.md) · [External Session Management](external-session-management.md) · [Client Portal Foundation](client-portal.md)
