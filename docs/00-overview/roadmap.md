# Product Roadmap

**Status language:** **Current** = implemented and evidenced in the repository; **Planned** = intended but not shipped; **Future Vision** = directional only; **Technical Debt** = known risk or operational gap.

Priority reflects sequencing, not a delivery promise. Detailed historical status remains in the [product roadmap](../product/roadmap.md) and [milestones](../product/milestones.md).

## Phase 1 — Core Platform

| Initiative | Classification | Dependencies | Priority | Expected customer impact |
| --- | --- | --- | --- | --- |
| Public booking, admin operations, organization configuration, secure status access | Current | Next.js, Supabase, tenant authorization | P0 | Customers can request appointments; operators can review durable records |
| Availability, service snapshots, Stripe/Google foundations | Current | Organization settings and provider configuration | P0 | More accurate scheduling and payment/integration boundaries |
| Mission Control (operational command center) | Current foundation | Persisted appointments, settings, integration records | P1 | Faster identification of verified operational attention items |
| Customer Timeline | Planned | Durable appointment, payment, calendar, and communication events | P1 | One chronological explanation of an appointment’s lifecycle |
| Document Intelligence | Future Vision | Explicit document policy, privacy review, safe extraction architecture | P2 | Reduced manual intake review without automating notarial judgment |

### Technical debt

Monitoring/alerting, calendar recovery scheduling, delivery reconciliation, and production scheduler ownership remain documented in the [technical debt backlog](../technical-debt/backlog.md).

## Phase 2 — Launch Ready

| Initiative | Classification | Dependencies | Priority | Expected customer impact |
| --- | --- | --- | --- | --- |
| Communications queue and appointment reminders | Current foundation | Scheduler configuration and provider credentials | P0 | Durable message attempts and scheduled customer reminders |
| Communications Center | Current foundation | Persisted reminders and queue records | P1 | Operators can inspect scheduled, queued, sent, and failed communications |
| Customer Portal | Planned | Secure access links, appointment-change policies, communications | P1 | Customers can complete eligible self-service actions without contacting staff |
| Email Template Designer | Planned | Approved template model, versioning, audit and preview requirements | P2 | Administrators can manage approved customer copy safely |
| Analytics | Planned | Durable event definitions, retention policy, measurement ownership | P2 | Operators can measure conversion and operational health from verified data |

### Technical debt

Provider delivery reconciliation, webhook replay tooling, retention/deletion procedures, and incident runbooks must be addressed before claiming comprehensive launch operations.

## Phase 3 — AI Platform

| Initiative | Classification | Dependencies | Priority | Expected customer impact |
| --- | --- | --- | --- | --- |
| AI concierge configuration | Current configuration only | Organization settings | P2 | No autonomous customer workflow is implied by this setting alone |
| AI Operations Assistant | Future Vision | Stable operational records, permissions, auditability, human review | P2 | Could reduce routine administrative lookup and coordination work |
| Voice Receptionist | Future Vision | Verified identity, escalation policy, provider selection, consent review | P3 | Could provide guided appointment intake outside web hours |
| Document Intelligence | Future Vision | See Phase 1 policy and privacy dependencies | P2 | Could summarize intake signals for human review |

### Technical debt and success criteria

Before AI expansion: explicit escalation paths, clear data boundaries, auditing, tenant scoping, measured accuracy, and no automated legal or notarial determination.

## Roadmap sequence

```mermaid
flowchart LR
  A[Current: durable records and core operations] --> B[Planned: launch-ready self-service and reporting]
  B --> C[Future Vision: AI-assisted operations]
```

Every roadmap item must pass the [North Star](north-star.md) test: does it reduce administrative work for the notary while improving customer clarity and professional control?
