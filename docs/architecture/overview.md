# Architecture Overview

Avenseal is a Next.js application backed by Supabase and external provider adapters. The database is authoritative for business state; providers are synchronized from persisted, tenant-scoped records.

## Domains

- **Organizations and tenancy:** `organization_id`, memberships, server authorization, and RLS isolate business data.
- **Authentication and authorization:** admin sessions and organization roles gate administrative operations.
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
