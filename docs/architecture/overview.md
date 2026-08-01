# Architecture Overview

Avenseal is a Next.js application backed by Supabase and external provider adapters. The database is authoritative for business state; providers are synchronized from persisted, tenant-scoped records.

## Domains

- **Organizations and tenancy:** `organization_id`, memberships, server authorization, and RLS isolate business data.
- **Authentication and authorization:** admin sessions and organization roles gate administrative operations.

## Admin authorization boundary

Administrative mutations require a signed, unexpired session and the server-side `requireAdminOrganizationContext()` boundary. Middleware performs coarse cookie integrity and expiry checks; route handlers revalidate the current active owner/admin membership, establish the trusted organization context, and verify that an appointment target belongs to that organization before mutation. Invalid or expired sessions fail as unauthenticated; inactive or insufficient memberships fail closed; unknown or wrong-tenant appointment targets use a non-disclosing response.

Admin cookies are HttpOnly, Secure in production, SameSite=Lax, path-scoped to `/`, and expire after eight hours. The signed payload expiry is authoritative in addition to the browser cookie expiry. Logout clears the browser cookie; server-side per-session revocation is not currently implemented. CSRF origin policy is intentionally deferred to Sprint 26.1C.

## Admin mutation origin policy

Sprint 26.1C requires an explicit, configured same-origin `Origin` header for cookie-authenticated `POST`, `PUT`, `PATCH`, and `DELETE` requests under `/api/admin` (except the unauthenticated login route). The middleware rejects missing, null, malformed, or mismatched origins with a generic `403` before route code can mutate data. OAuth callback, Stripe webhook, internal worker, Client Workspace token, and public anonymous routes do not use the admin-cookie origin boundary because their authorization credentials differ.

## Distributed abuse controls

The `rate_limit_counters` service-role-only table and `consume_rate_limit` RPC implement atomic fixed windows keyed by policy and an HMAC-hashed identity. Raw IP addresses, email addresses, tokens, cookies, and URLs are not stored. Public status-link and Client Workspace access-link requests apply both IP and normalized-email policies before repository lookup, token issuance/rotation, or communication delivery. Public booking applies IP and normalized-email policies before appointment creation and its availability, reservation, communication, and audit work. Booking availability and general availability apply separate higher read-class IP policies before organization resolution, repository reads, Calendar calls, or slot calculation. A blocked request returns only `429`, `Retry-After`, `Cache-Control: no-store`, and a generic rate-limited status; it preserves non-enumeration. Production limiter failure fails closed. Counter rows use fixed windows, expire by window, and require operational cleanup; this is abuse control, not a claim of full volumetric DDoS protection. Browser-header work and magic-link HTML-retention work remain deferred.

Client Workspace document upload, Checkout creation, and external-session launch use two-stage limits: an IP limit before token resolution, followed by a distinct scoped limit based on trusted organization and appointment data (and the trusted session for launch). Raw workspace tokens and provider URLs are never rate-limit identities. A block prevents upload/storage, Checkout/Stripe orchestration, or launch auditing and redirects.

High-impact admin actions validate the current owner/admin context and tenant ownership before consuming trusted HMAC-hashed actor/organization/resource limits. Payment links and Client Workspace access actions are appointment scoped; communication retry first uses a read-only tenant-scoped retry-target lookup; calendar retry is an organization-wide actor/organization batch-action limit. Store failures fail closed and blocks do not start provider or mutation workflows.

### Route policy inventory

All policies use fixed windows and the shared generic `429` response (`Retry-After`, `Cache-Control: no-store`). Identities are composed only from trusted server values and HMAC-hashed before persistence; hashes are pseudonymous operational identifiers, not anonymous data. A limiter failure fails closed.

| Route / action | Policy namespace | Identity dimensions | Limit/window | Blocking occurs before |
| --- | --- | --- | --- | --- |
| Admin login | `admin_login_ip`, `admin_login_email` | IP; normalized email | 10/900s; 5/900s | authentication work |
| Status link | `magic_link_ip`, `magic_link_email` | IP; normalized email | 10/900s; 3/900s | lookup, token/email |
| Workspace access request | `client_workspace_access_ip`, `client_workspace_access_email` | IP; normalized email | 10/900s; 3/900s | lookup, token/email |
| Public booking | `booking`, `booking_email` | IP; normalized email | 8/60s; 5/60s | availability, appointment, audit |
| Booking availability | `booking_availability` | IP | 60/60s | org/Calendar/slot work |
| General availability | `availability` | IP | 60/60s | repository/slot work |
| Workspace upload | `client_document_upload_ip`, `client_document_upload_scoped` | IP; trusted org/appointment | 10/900s each | token lookup; storage/metadata/audit |
| Workspace payment | `client_payment_ip`, `client_payment_scoped` | IP; trusted org/appointment | 5/300s each | token lookup; Checkout/payment workflow |
| Session launch | `external_session_launch_ip`, `external_session_launch_scoped` | IP; trusted org/appointment/session | 20/300s each | token lookup; audit/redirect |
| Admin payment link | `admin_payment_link` | trusted org/actor/appointment | 10/300s | Stripe/payment/email workflow |
| Admin access generate | `admin_client_access_generate` | trusted org/actor/appointment | 10/300s | token rotation/audit |
| Admin access send | `admin_client_access_send` | trusted org/actor/appointment | 5/300s | token/email/audit |
| Communication retry | `admin_communication_retry` | trusted org/actor/communication | 10/300s | retry mutation/provider work |
| Calendar retry | `admin_calendar_retry` | trusted org/actor | 5/300s | organization-wide Calendar batch |

Appointment-scoped admin actions validate tenant ownership before limiting; communication retry uses a read-only tenant-scoped target lookup first. Calendar retry intentionally has no fake resource scope. The counter primary key includes policy, HMAC identity, and window start, so the atomic `INSERT … ON CONFLICT DO UPDATE` prevents a lookup/insert race. Expired rows are not deleted by the RPC: operational cleanup should remove rows after their expiry on a regular cadence; temporarily retained expired rows are outside new window keys. The expiry index supports that cleanup. `0018` grants neither direct table access to `anon`/`authenticated` nor public function execution; its `security definer` RPC is used only through service-role server code.

| Intentional exemption | Protection instead |
| --- | --- |
| Stripe webhook | Verified Stripe signature and event idempotency |
| Internal communications/reminders workers | Internal bearer/worker boundary |
| Google OAuth callback | OAuth state validation |
| Read-only admin routes | No ambient-cookie mutation |
| Static/public pages | No privileged workflow |

Security headers remain deferred to Sprint 26.1E and plaintext magic-link HTML retention to Sprint 26.1F. This is abuse control, not full volumetric DDoS protection.
- **Services and appointments:** services define bookable offerings; appointments preserve booking-time snapshots where available.
- **Availability:** server-side, timezone-safe availability combines configuration, appointments, reservations, and Calendar busy data.
- **Payments:** Stripe Checkout and webhook-driven payment state remain separate from appointment status.
- **Google integrations:** encrypted OAuth connections, FreeBusy, persisted mappings, event synchronization, and Meet support.
- **Customer portal and communications:** secure access links expose customer-safe state; communications are moving toward a queued provider boundary.
- **Admin application, database, RLS, testing, and staging:** admin routes are server-authorized; migrations and guarded staging tests protect operational changes.

## Data flow

```text
Customer Booking → Appointment → Payment → Google Calendar Sync → Communication Jobs → Customer Portal
```

## State boundaries

| State | Examples |
| --- | --- |
| Authoritative business data | organizations, services, appointments, payments, reservations, snapshots |
| External provider state | Stripe sessions, Google events, OAuth tokens |
| Derived state | public slots, customer-safe appointment status, dashboard metrics |
| Retryable integration state | Calendar mappings, provider delivery attempts, pending jobs |

Provider failures are recorded and retried without rolling back a successful business transaction. See [ADRs](decisions/README.md) and the existing [integration documentation](../07-milestone-3-integrations.md).
