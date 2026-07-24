# Product Roadmap

Status vocabulary: **Complete**, **Active**, **Proposed**.

## Phase 1 — Platform Foundation

| Item | Status | Milestone | Dependencies | Customer value |
| --- | --- | --- | --- | --- |
| Tenant safety and staging environment | Complete | PR #6 | Supabase RLS | Safe organization separation and reliable validation |
| Services, booking, and appointment snapshots | Complete | PRs #7–#9 | Organization settings | Accurate services and durable booking history |
| Google OAuth, availability, Calendar sync, and Meet support | Complete | PRs #7–#10 | Google OAuth connection | Safe availability and confirmed appointment synchronization |

## Phase 2 — Customer Experience

| Item | Status | Milestone | Dependencies | Customer value |
| --- | --- | --- | --- | --- |
| Communications engine, confirmations, updates, cancellations, reminders, and GitHub Actions processing | Active | PR #11 | Provider abstraction, queue | Clear appointment communications |
| Secure customer portal, rescheduling, and cancellation | Proposed | PR #12 | Secure appointment access | Customer self-service |
| Configurable intake forms | Proposed | Future | Service configuration | Better appointment preparation |

## Phase 3 — Payments and Operations

| Item | Status | Milestone | Dependencies | Customer value |
| --- | --- | --- | --- | --- |
| Production webhook hardening, deposits, partial payments, refunds, receipts, and reconciliation | Proposed | PR #13 | Stripe foundation | Trustworthy billing operations |
| No-show handling, staff assignment, and admin schedule views | Proposed | Future | Payment and appointment lifecycle | Better operational control |

## Phase 4 — Business Intelligence

| Item | Status | Milestone | Dependencies | Customer value |
| --- | --- | --- | --- | --- |
| Revenue, utilization, conversion, cancellations, no-shows, staff/service performance, and integration health | Proposed | PR #14 | Durable operational events | Decisions based on operational evidence |

## Phase 5 — AI Concierge

| Item | Status | Milestone | Dependencies | Customer value |
| --- | --- | --- | --- | --- |
| Knowledge base, FAQ, recommendations, natural-language booking, lookup, changes, escalation, and voice-ready architecture | Proposed | PR #15 | Stable booking and portal APIs | Faster, guided customer support |

## Phase 6 — Platform Expansion

| Item | Status | Milestone | Dependencies | Customer value |
| --- | --- | --- | --- | --- |
| SMS and push notifications | Proposed | Future | Communications abstraction | Customer choice of channel |
| Outlook Calendar and additional payment providers | Proposed | Future | Provider-independent boundaries | More business flexibility |
| Team/resource scheduling and multi-location or marketplace capabilities | Proposed | Future | Tenant and scheduling model evolution | Larger operating models |
