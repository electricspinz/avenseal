# Milestones

| Milestone | Status | Objective | Major deliverables | Dependencies | Known limitations | Validation expectations |
| --- | --- | --- | --- | --- | --- | --- |
| PR #7 — Google Calendar staging verification | Complete | Establish safe staging verification | Staging guard and validation evidence | Staging Supabase | Live provider validation remains controlled | Guarded integration checks |
| PR #8 — Google Calendar-aware availability | Complete | Make availability calendar-aware | FreeBusy-aware availability boundary | Google connection | Retry is not scheduled | Unit and staging integration tests |
| PR #9 — Appointment service snapshots | Complete | Preserve booking-time service history | Service, name, duration, price, currency snapshots | Services schema | Ambiguous legacy rows use documented fallback | Migration and integration coverage |
| PR #10 — Google Calendar event synchronization | Complete | Synchronize confirmed appointments | Persisted mappings, Meet links, protected retry | OAuth and snapshot data | Explicit retry endpoint; no scheduler | Unit, integration, E2E, staging verification |
| PR #11 — Provider-agnostic communications engine | Active | Deliver reliable appointment communications | Queue, provider boundary, email-first delivery, retries, tracking | Appointments and secure links | SMS/push deferred | Unit, integration, queue and failure-path coverage |
| PR #12 — Customer self-service portal | Proposed | Let customers safely manage appointments | Portal, rescheduling, cancellation | Secure links, communications | Policy details pending | E2E and tenant/security checks |
| PR #13 — Production billing hardening | Proposed | Complete billing operations | Webhook hardening, refunds, receipts, reconciliation | Stripe foundation | Scope to be specified | Provider and staging verification |
| PR #14 — Business analytics dashboard | Proposed | Surface operational insight | Metrics and dashboard | Durable events | Metric definitions pending | Data accuracy tests |
| PR #15 — AI Concierge foundation | Proposed | Provide safe assisted service | Knowledge and escalation foundation | Stable platform APIs | No notarial decision-making | Security and UX evaluation |
