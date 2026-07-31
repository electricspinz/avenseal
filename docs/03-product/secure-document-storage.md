# Secure Document Storage Foundation

**Status: Sprint 24.2A review foundation.** This foundation provides private object-storage configuration, tenant-scoped uploaded-file metadata, server-side validation, a magic-link-protected multipart upload route, a focused Client Workspace upload card, read-only admin document visibility, authorized admin download, and audit-ready repository boundaries. Sprint 24.2A adds review metadata and server-side review methods only; it does not add a review UI, customer-visible review state, replacement uploads, preview, OCR, AI, document signing, or BlueNotary upload.

## Data boundary

Document bytes belong in the private `appointment-documents` object-storage bucket. Metadata belongs in `appointment_document_files`; PostgreSQL never stores binary content, signed URLs, temporary URLs, access tokens, provider URLs, or document contents. Object keys are server-generated as `organizations/{organization}/appointments/{appointment}/documents/{document UUID}` and never derive from a customer filename.

Every metadata row is tenant- and appointment-scoped. Owners and admins manage metadata through RLS; customers have no direct database or object-storage access. `POST /api/appointments/access/[token]/documents` resolves the appointment only from the existing Client Workspace access token, accepts exactly one multipart file, validates it server-side, uploads through the private server boundary, and then persists metadata. Browser-supplied organization, appointment, bucket, object key, and ownership values are ignored because the endpoint accepts none of them. If metadata persistence fails after object upload, the server removes the object to avoid an orphan. The response contains only safe document ID, original filename, size, content type, upload time, and status.

## Validation and audit

The foundation allows PDF, JPEG, and PNG documents up to 10 MiB. It rejects empty files, unsafe filenames, unsupported MIME types, and MIME/extension mismatches. A successful metadata write records `document.uploaded` through the existing audit system with only document ID, content type, size, uploader type, tenant, and appointment. Filenames, object keys, URLs, tokens, and content never enter audit metadata.

## Admin visibility and download

Appointment Details shows active uploaded-file metadata: filename, upload time, content type, size, status, and a Download action. `GET /api/admin/appointments/[id]/documents/[documentId]/download` requires the existing owner/admin organization context. The repository requires matching organization, appointment, document, and non-deleted state before the private object is read. The route streams the object with attachment headers; it never returns a bucket name, object key, persistent URL, or signed URL. Each successful download records `document.downloaded` with only document, appointment, organization, and actor-type identifiers.

## Review foundation

`appointment_document_files` now records a document status (`uploaded`, `approved`, or `rejected`), the owner or admin reviewer, review timestamp, and optional staff-authored plain-text review notes. Existing rows retain the `uploaded` status. Review notes are trimmed, limited to 2,000 characters, and reject HTML and common Markdown constructs. They remain staff-only and are not included in customer projections, audit metadata, or this release's UI.

The server-side document repository provides `approveDocument()`, `rejectDocument()`, `getDocumentReview()`, and `listPendingDocuments()`. Every review operation scopes the document to the organization and appointment, excludes soft-deleted documents, validates an owner/admin reviewer identity, and accepts only these transitions: `uploaded → approved`, `uploaded → rejected`, `rejected → approved`, and `approved → rejected`. Repeating a state is rejected.

Successful reviews record `document.approved` or `document.rejected`. Audit metadata contains only scoped IDs, reviewer ID and role, and timestamp. It never includes review notes, filenames, document contents, URLs, storage keys, bucket names, or access tokens. Existing RLS continues to limit document management to owners and admins.

## Admin review workflow

Appointment Details is the only review surface in this release. An owner or admin can download an active document, inspect its repository-backed status, and choose Approve or Reject. Approval requires an explicit confirmation. Rejection opens a dialog requiring a plain-text reason; duplicate submissions are disabled while the request is pending. The review route resolves the organization from the existing owner/admin context, verifies the appointment belongs to that organization, and delegates transition, authorization, notes, and audit handling to the document repository.

After a successful review, the card refreshes its local presentation from the safe review response and shows status, reviewer, and review timestamp. Rejected documents additionally show the stored staff-only review note. Safe failure messages never expose database, storage, tenant, or stack-trace details.

## Customer review states and replacements

The Client Workspace receives a separate customer-safe document projection: document ID, original filename, upload timestamp, and one of `uploaded`, `approved`, or `needs_replacement`. A rejected internal status maps only to `needs_replacement`; the workspace never receives `rejected`, reviewer identity, review timestamp, audit data, storage keys, bucket names, URLs, organization or appointment identifiers. A replacement reason is shown only for `needs_replacement` and is the customer-facing reason entered during rejection.

Customers can choose **Upload Replacement** only for a document requiring replacement. The magic-link upload route derives organization and appointment solely from the token, validates that the supplied replacement target is an active rejected document for that appointment, applies the existing file validation and private storage pipeline, then creates a new uploaded document and soft-deletes the prior document. Storage objects are never overwritten. `document.replaced` records only previous and replacement document IDs alongside the scoped audit entity; it excludes storage data, URLs, tokens, notes, and content.

## Review communications

Document review outcomes can queue `document_replacement_requested` for a newly rejected document and `documents_approved` when every active, non-deleted document is approved. Both messages use the appointment-scoped Client Workspace link and stable lifecycle discriminators; they exclude filenames, rejection reasons, reviewer data, document content, storage details, and provider URLs. These messages concern document review only—they do not declare readiness, identity verification, notarization completion, or BlueNotary availability.

## Current limitations and future work

The Client Workspace card supports one selected file at a time with idle, uploading, completed, and safe failure states. Customers cannot download files, see internal review metadata, access version history, preview documents, or receive review communications. There is no customer deletion, sharing, or multiple-upload queue. No BlueNotary API integration is part of this foundation.
