# Secure Document Storage Foundation

**Status: Sprint 24.2A review foundation.** This foundation provides private object-storage configuration, tenant-scoped uploaded-file metadata, server-side validation, a magic-link-protected multipart upload route, a focused Client Workspace upload card, read-only admin document visibility, authorized admin download, and audit-ready repository boundaries. Sprint 24.2A adds review metadata and server-side review methods only; it does not add a review UI, customer-visible review state, replacement uploads, preview, OCR, AI, document signing, or BlueNotary upload.

## Data boundary

Document bytes belong in the private `appointment-documents` object-storage bucket. Metadata belongs in `appointment_document_files`; PostgreSQL never stores binary content, signed URLs, temporary URLs, access tokens, provider URLs, or document contents. Quarantine object keys are server-generated as `quarantine/organizations/{organization}/appointments/{appointment}/{document UUID}` and never derive from a customer filename.

Every metadata row is tenant- and appointment-scoped. Owners and admins manage metadata through RLS; customers have no direct database or object-storage access. `POST /api/appointments/access/[token]/documents` resolves the appointment only from the existing Client Workspace access token, accepts exactly one multipart file, validates it server-side, uploads through the private server boundary, and then persists metadata. Browser-supplied organization, appointment, bucket, object key, and ownership values are ignored because the endpoint accepts none of them. If metadata persistence fails after object upload, the server removes the object to avoid an orphan. The response contains only safe document ID, original filename, size, content type, upload time, and status.

## Validation and audit

The foundation allows PDF, JPEG, and PNG documents up to 10 MiB. It rejects empty files, unsafe filenames, unsupported MIME types, and MIME/extension mismatches. A successful metadata write records `document.uploaded` through the existing audit system with only document ID, content type, size, uploader type, tenant, and appointment. Filenames, object keys, URLs, tokens, and content never enter audit metadata.

## Admin visibility and download

Appointment Details shows uploaded-file metadata: filename, upload time, content type, size, status, and a Download action only after the document is both clean and active. `GET /api/admin/appointments/[id]/documents/[documentId]/download` requires the existing owner/admin organization context. The repository requires matching organization, appointment, document, non-deleted, clean, and active state before the private object is read. The route streams the object with attachment headers; it never returns a bucket name, object key, persistent URL, or signed URL. Each successful download records `document.downloaded` with only document, appointment, organization, and actor-type identifiers.

## Review foundation

`appointment_document_files` now records a document status (`uploaded`, `approved`, or `rejected`), the owner or admin reviewer, review timestamp, and optional staff-authored plain-text review notes. Existing rows retain the `uploaded` status. Review notes are trimmed, limited to 2,000 characters, and reject HTML and common Markdown constructs. They remain staff-only and are not included in customer projections, audit metadata, or this release's UI.

The server-side document repository provides `approveDocument()`, `rejectDocument()`, `getDocumentReview()`, and `listPendingDocuments()`. Every review operation scopes the document to the organization and appointment, excludes soft-deleted documents, validates an owner/admin reviewer identity, and accepts only these transitions: `uploaded → approved`, `uploaded → rejected`, `rejected → approved`, and `approved → rejected`. Repeating a state is rejected.

Successful reviews record `document.approved` or `document.rejected`. Audit metadata contains only scoped IDs, reviewer ID and role, and timestamp. It never includes review notes, filenames, document contents, URLs, storage keys, bucket names, or access tokens. Existing RLS continues to limit document management to owners and admins.

## Admin review workflow

Appointment Details is the only review surface in this release. An owner or admin can download only a clean, active document, inspect its repository-backed review status, and choose Approve or Reject. Review approval does not make a document downloadable. Approval requires an explicit confirmation. Rejection opens a dialog requiring a plain-text reason; duplicate submissions are disabled while the request is pending. The review route resolves the organization from the existing owner/admin context, verifies the appointment belongs to that organization, and delegates transition, authorization, notes, and audit handling to the document repository.

After a successful review, the card refreshes its local presentation from the safe review response and shows status, reviewer, and review timestamp. Rejected documents additionally show the stored staff-only review note. Safe failure messages never expose database, storage, tenant, or stack-trace details.

## Customer review states and replacements

The Client Workspace receives a separate customer-safe document projection: document ID, original filename, upload timestamp, and one of `uploaded`, `approved`, or `needs_replacement`. A rejected internal status maps only to `needs_replacement`; the workspace never receives `rejected`, reviewer identity, review timestamp, audit data, storage keys, bucket names, URLs, organization or appointment identifiers. A replacement reason is shown only for `needs_replacement` and is the customer-facing reason entered during rejection.

Customers can choose **Upload Replacement** only for a document requiring replacement. The magic-link upload route derives organization and appointment solely from the token, validates that the supplied replacement target is an active rejected document for that appointment, and applies the same private quarantine pipeline. The prior rejected metadata remains available while the replacement is pending; it is not soft-deleted or superseded until a later scanner/activation workflow can establish a safe replacement. Storage objects are never overwritten.

## Review communications

Document review outcomes can queue `document_replacement_requested` for a newly rejected document and `documents_approved` when every active, non-deleted document is approved. Both messages use the appointment-scoped Client Workspace link and stable lifecycle discriminators; they exclude filenames, rejection reasons, reviewer data, document content, storage details, and provider URLs. These messages concern document review only—they do not declare readiness, identity verification, notarization completion, or BlueNotary availability.

## Current limitations and future work

The Client Workspace card supports one selected file at a time with idle, uploading, completed, and safe failure states. Customers cannot download files, see internal review metadata, access version history, preview documents, or receive review communications. There is no customer deletion, sharing, or multiple-upload queue. No BlueNotary API integration is part of this foundation.

## Scan queue and clean activation

Each successful pending/quarantined metadata write now attempts a tenant-scoped, idempotent document scan-job enqueue. The job queue and processor are server-only; customers receive no job ID, provider data, storage information, or scan response. If enqueue fails, the document and its private quarantine object remain pending/quarantined for operational recovery and the upload returns a safe processing failure. The upload request never invokes a scanner synchronously.

The protected processor claims due jobs atomically with a five-minute lease, reclaims expired claims, and rechecks tenant, appointment, document, non-deleted, pending, and quarantined state before downloading trusted private bytes. It retries transient failures at 1 minute, 5 minutes, 15 minutes, 1 hour, and 6 hours, up to five attempts. Clean results perform the existing guarded scan transition and clean-only storage activation; blocked and failed results remain quarantined. The configured Cloudmersive adapter remains deliberately fail-closed pending approved result-contract, privacy, and staging verification, so production launch remains blocked.
# Security scan-state foundation

Sprint 26.1D-B1.1 keeps review status (`uploaded`, `approved`, `rejected`) separate from security scan state. It adds durable `scan_status` (`pending`, `clean`, `infected`, `suspicious`, `failed`) and `storage_status` (`quarantined`, `active`, `removed`) fields. New and existing rows conservatively default to `pending` and `quarantined`; no historical file is silently trusted.

Only `clean` documents may have `active` storage status. Infected, suspicious, and failed documents cannot become active. The schema adds indexes for pending scans, clean active appointment documents, and cleanup work. Existing RLS policies continue to govern the table; customer-facing projections must not expose scanner details.

No runtime upload or download behavior changes in B1.2A. The repository maps scan/storage state strictly, rejects invalid values, and keeps these internal fields out of customer-safe projections. A scanner provider remains unselected, so production document upload is launch-blocked until scanning is configured and staging-verified.

## Scan-state transition foundation

Sprint 26.1D-B1.2C adds only server-side scan-state transitions. The supported transitions are `pending → clean`, `pending → infected`, `pending → suspicious`, `pending → failed`, and `failed → pending`. All other transitions are rejected, including any transition from `clean`, `infected`, or `suspicious` to another result. A deleted, removed, unknown, wrong-tenant, or wrong-appointment document is treated as unavailable without disclosing its existence.

Each result transition increments `scan_attempt_count` once and records a trusted scan timestamp. A retry reset preserves that count, records `scan_requested_at`, and clears the prior provider, result timestamp, and failure category because no new result exists yet. Repeating the same terminal result is an idempotent no-op: it returns the current record and does not write a second audit event. Conflicting terminal results and repeated retry resets are rejected. `storage_status` is never changed in this sprint.

Successful durable transitions record only `document.scan_clean`, `document.scan_blocked`, `document.scan_failed`, or `document.scan_pending`. Their metadata is limited to the document ID, system actor type, structured result category, attempt count, and an operational provider name when present. It never includes filenames, object keys, scanner reports or signatures, URLs, tokens, credentials, or file content. These repository methods scope both their reads and optimistic updates to organization, appointment, document, and active-record state. They accept only a trusted system actor, bounded plain-text provider names, and structured safe categories; no scanner integration is configured.

B1.2D will add the separate storage activation/removal lifecycle. B1.3 remains responsible for upload/quarantine orchestration, and B1.4 for clean-only download enforcement. Production launch remains blocked until a live scanner is selected, integrated, and staging-verified.

## Storage-state transition foundation

Sprint 26.1D-B1.2D adds only server-side storage lifecycle transitions. A clean, quarantined document may transition to `active`. A quarantined or active document may transition to `removed`. `removed` is terminal in this release: there is no restore or return to quarantined state. Neither transition changes the document’s scan status, review status, object path, object bytes, upload behavior, or download behavior.

Duplicate activation of an already-active clean document and duplicate removal of an already-removed document are idempotent no-ops. They return the current document and do not record another audit event. Activation of a non-clean, deleted, unknown, wrong-tenant, or wrong-appointment document fails safely. Updates use the expected current storage state together with organization, appointment, document, and active-record scope, so stale writes do not become unguarded state changes.

Successful durable storage transitions record `document.storage_activated` or `document.storage_removed`. Metadata is restricted to the document ID, system actor, storage result category, scan status, and attempt count. It excludes filenames, storage or quarantine paths, scanner reports, signed URLs, tokens, credentials, provider responses, and file content.

This is not activation orchestration: no live scanner is configured, no object move or copy occurs, and downloads are not yet gated by clean/active state. B1.3 will wire pending/quarantined upload behavior, and B1.4 will enforce clean/active download gating. Production launch remains blocked until a scanner is configured and staging-verified.

## Quarantine upload orchestration

Sprint 26.1D-B1.3 stores each validated upload under a server-generated key in the private bucket: `quarantine/organizations/{organization}/appointments/{appointment}/{opaque document UUID}`. Customer filenames never determine a path, and the key is never returned to a browser, customer projection, or audit record. Validation of filename extension, MIME type, size, and byte signature completes before any object write. The object upload completes before metadata persistence.

Successful metadata writes explicitly remain `uploaded`, `pending`, and `quarantined` with zero scan attempts. They preserve `document.uploaded` and add the safe `document.scan_pending` audit. No scanner is invoked, no document is marked clean, no storage is activated, and no object is moved or copied. The customer response remains the existing safe uploaded/processing projection and contains no scan state, storage state, quarantine key, provider, failure category, attempt count, token, URL, or object metadata.

If metadata persistence fails after the private object write, the server removes the newly written quarantine object and returns the existing safe upload failure. It does not emit successful upload or pending-scan audits. If cleanup itself fails, the original safe failure remains and only a generic operational message is logged; orphan reconciliation remains a documented operational limitation. Replacement uploads follow the same pending/quarantined path while preserving the rejected prior record. B1.4 will add clean/active download gating; B2 will integrate a real scanner. Production launch remains blocked until that scanner is configured and staging-verified.

## Clean/active download enforcement

Sprint 26.1D-B1.4 makes the trusted admin download lookup fail closed. A document is downloadable only when the current owner or admin context, organization, appointment, document ID, and non-deleted state all match and the document is both `scan_status = clean` and `storage_status = active`. Pending, infected, suspicious, failed, quarantined, removed, invalid, legacy, wrong-tenant, wrong-appointment, and unknown documents share the same generic unavailable result. Review approval is never a substitute for a clean scan and active storage state.

The route resolves authorization and repository eligibility before it loads the private object. Allowed downloads stream server-side as an attachment using the trusted content type and sanitized filename, with `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`. No public or signed URL, bucket name, object key, quarantine path, scan provider, failure category, or raw error is returned. A `document.downloaded` audit is written only after successful eligibility and object retrieval; denied requests create no successful download audit.

Migration 0019 leaves legacy rows pending and quarantined, so they remain unavailable until a scanner workflow explicitly marks them clean and a trusted storage transition activates them. Newly uploaded files are likewise unavailable because no live scanner is configured. B2 will add scanner integration and activation orchestration; production launch remains blocked until that configuration is staging-verified.

### Non-destructive staging verification

- Confirm a clean, active document downloads through the admin route with attachment, trusted content type, `nosniff`, and `no-store` headers, and one safe audit event.
- Confirm pending/quarantined, clean/quarantined, infected, suspicious, failed, removed, and deleted documents return the generic unavailable response without an object read or download audit.
- Confirm cross-tenant and wrong-appointment requests return the same unavailable response.
- Confirm direct bucket access is denied and no response exposes a public or signed URL, object key, or quarantine path.
