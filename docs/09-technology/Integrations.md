# Integrations

## Purpose

Describe current integration boundaries accurately and distinguish them from future capability.

**Status:** Current working reference
**Last Updated:** 2026-08-08

## Current repository boundaries

| System | Current repository role |
| --- | --- |
| Supabase | Auth, PostgreSQL persistence, tenant/RLS foundations, and storage boundaries |
| Stripe | Checkout/payment workflow and webhook-processing boundary |
| Gmail SMTP / email | Transactional communication delivery boundary |
| Google Calendar | Calendar authorization, availability, and appointment synchronization boundary |
| Online notarization provider | External-session/provider abstraction; provider-hosted identity verification and remote session |
| Document security | Quarantine, scan-job, scanner-adapter, and download-gating boundaries |

## Provider boundary

Avenseal does not represent itself as the platform that performs the provider-hosted notarization session. BlueNotary-related architecture is documented as provider-neutral and must not be promoted as a live API integration unless verified and configured.

## To Be Finalized

Production provider activation, credentials, service-level expectations, contractual approvals, webhook operation, and vendor incident processes.

## Related

- [Business Model](../01-company/Business-Model.md)
- [Connected Services](../03-product/connected-services.md)
