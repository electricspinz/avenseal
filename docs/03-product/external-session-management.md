# External Session Management

**Status: Durable manual foundation.** Migration `0014_client_workspace_persistence.sql` persists tenant-scoped External Sessions. Staff manage the session; Avenseal owns scheduling, payment, and preparation while the external provider performs identity verification and the live notarization.

## Architecture

The appointment detail page calls a tenant-scoped External Session boundary. The boundary validates manual values and keeps one session per organization and appointment. The Client Portal receives a deliberately reduced view: provider, session name, manual status, and launch URL. Notes, reference number, metadata, and internal identifiers stay admin-only.

## Manual fields

| Field | Behavior |
| --- | --- |
| Provider and session name | Free-form, provider-neutral text |
| Launch URL | Optional HTTP/HTTPS URL, validated server-side |
| Reference number and notes | Optional, admin-only |
| Status | Manual pending, scheduled, ready, in progress, completed, cancelled, or unknown |

Staff can add, edit, remove, open, and copy a session in Appointment Details. A customer launch action is available only after payment is paid, the appointment is confirmed or ready, and the session is scheduled, ready, or in progress with a trusted HTTPS URL. Pending, completed, cancelled, and failed sessions remain hidden behind the honest waiting state. Customer opening is audited without recording the raw launch URL or access token. This metadata does not change Workflow Engine state, automate actions, synchronize with a provider, or imply that a session is confirmed.

When a staff change makes a session customer-visible, Avenseal may send one `external_session_available` email with the subject “Your BlueNotary session is ready.” It links only to the Client Workspace; it never includes the provider URL. Visible-to-visible edits do not notify. A later hidden-to-visible transition may notify again using the persisted session update timestamp as its visibility-cycle discriminator. Rendered communication HTML currently persists the Client Workspace access link in `communication_messages`; this is known technical debt. No BlueNotary API integration exists.

Immediately before SMTP delivery, `external_session_available` is revalidated against trusted persisted appointment, payment, session, recipient, tenant, and active Client Workspace access state. If any condition is no longer eligible, the message is terminally **cancelled** with a safe reason category (`payment_ineligible`, `appointment_ineligible`, `session_ineligible`, `launch_unavailable`, `recipient_changed`, `recipient_unavailable`, `tenant_mismatch`, `appointment_mismatch`, or `workspace_unavailable`). Suppressed messages never call SMTP or enter the provider retry path; genuine SMTP failures retain the existing retry behavior. The Communications Center displays the cancelled outcome without showing message bodies, Client Workspace URLs, provider URLs, provider references, or notes. A tenant- and appointment-scoped audit record stores only the communication type, cancelled state, and safe reason category.

## Connected Services relationship and limitations

External Sessions are not Connected Services integrations. Future BlueNotary, Proof, or other adapters may create or synchronize this metadata through approved provider-neutral interfaces. Webhook synchronization, OAuth, API calls, polling, automatic creation, and persistence are deferred.

To avoid an unapproved migration or reusing unrelated appointment fields, this initial store is process-local and non-durable. A production rollout requires a tenant-scoped persisted table, authorization review, and migration. No provider behavior is hardcoded.
