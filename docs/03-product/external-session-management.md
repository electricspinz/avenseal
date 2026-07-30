# External Session Management

**Status: Current manual foundation.** An External Session is optional provider-neutral appointment metadata that staff can enter manually. Avenseal continues to own business workflow; the external provider performs the live notarization session.

## Architecture

The appointment detail page calls a tenant-scoped External Session boundary. The boundary validates manual values and keeps one session per organization and appointment. The Client Portal receives a deliberately reduced view: provider, session name, manual status, and launch URL. Notes, reference number, metadata, and internal identifiers stay admin-only.

## Manual fields

| Field | Behavior |
| --- | --- |
| Provider and session name | Free-form, provider-neutral text |
| Launch URL | Optional HTTP/HTTPS URL, validated server-side |
| Reference number and notes | Optional, admin-only |
| Status | Manual pending, scheduled, ready, in progress, completed, cancelled, or unknown |

Staff can add, edit, remove, open, and copy a session in Appointment Details. The portal shows an honest waiting state when one is absent. This metadata does not change Workflow Engine state, automate actions, synchronize with a provider, or imply that a session is confirmed.

## Connected Services relationship and limitations

External Sessions are not Connected Services integrations. Future BlueNotary, Proof, or other adapters may create or synchronize this metadata through approved provider-neutral interfaces. Webhook synchronization, OAuth, API calls, polling, automatic creation, and persistence are deferred.

To avoid an unapproved migration or reusing unrelated appointment fields, this initial store is process-local and non-durable. A production rollout requires a tenant-scoped persisted table, authorization review, and migration. No provider behavior is hardcoded.
