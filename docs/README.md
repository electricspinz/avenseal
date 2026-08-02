# Avenseal Product Blueprint

The Product Blueprint is Avenseal’s version-controlled internal handbook. It connects product intent to design, architecture, and delivery practice so a new teammate can understand what the product is, what is true today, and how to extend it safely.

It complements—not replaces—feature PRDs, ADRs, migrations, and operational runbooks. When sources disagree, deployed behavior and the relevant ADR or migration are authoritative; update this blueprint in the same change that intentionally changes product direction or working conventions.

## Reading order and document types

| Section | Purpose | Start here |
| --- | --- | --- |
| [00 Overview](00-overview/vision.md) | Product strategy: why Avenseal exists, its North Star, and canonical roadmap sequence | [Vision](00-overview/vision.md) · [Roadmap](00-overview/roadmap.md) |
| [01 Design System](01-design-system/design-principles.md) | Design principles plus implementation-ready [tokens](01-design-system/design-tokens.md), [components](01-design-system/components.md), and [content style](01-design-system/content-style.md) | [Design Principles](01-design-system/design-principles.md) |
| [01 Company](01-company/company-overview.md) | Internal company facts, mission, and launch controls | [Company Overview](01-company/company-overview.md) · [Mission and Values](01-company/mission-and-values.md) · [Launch Checklist](01-company/launch-checklist.md) |
| [02 Legal](02-legal/privacy-policy-draft.md) | Attorney-review drafts and required legal launch review; not public production copy | [Privacy Draft](02-legal/privacy-policy-draft.md) · [Terms Draft](02-legal/terms-of-service-draft.md) · [Florida RON Disclosures](02-legal/florida-ron-disclosures.md) · [Attorney Checklist](02-legal/attorney-review-checklist.md) |
| [03 Product](03-product/mission-control.md) | PRDs define feature problem/scope; UI specifications define presentation and behavior | [Mission Control PRD](03-product/mission-control.md) · [Aven Operations Copilot](03-product/aven-copilot.md) · [Client Portal Foundation](03-product/client-portal.md) · [Client Workspace Persistence](03-product/client-workspace-persistence.md) · [Magic-Link Client Access](03-product/magic-link-client-access.md) · [External Session Management](03-product/external-session-management.md) · [Secure Document Storage](03-product/secure-document-storage.md) · [Document Security Service](03-product/document-security-service.md) · [Document Scanner Staging Runbook](03-product/document-scanner-staging-runbook.md) · [Document Scanner Staging Acceptance](03-product/document-scanner-staging-acceptance.md) · [Appointment Readiness Domain](03-product/appointment-readiness.md) · [Connected Services Foundation](03-product/connected-services.md) · [BlueNotary Provider Adapter](03-product/bluenotary-provider.md) · [Customer Timeline](03-product/customer-timeline.md) · [Payments Foundation and Center](03-product/payments.md) · [Automation Engine PRD](03-product/automation-engine.md) · [Appointment Automation Rules](03-product/appointment-automation.md) · [Communications Execution Engine](03-product/communications-execution.md) · [Automation Rule Catalog](03-product/automation-rules.md) · [Automation Lifecycle](03-product/automation-lifecycle.md) |
| [04 Marketing](04-marketing/positioning.md) | Approved positioning, education, referral, and review principles | [Positioning](04-marketing/positioning.md) · [SEO Roadmap](04-marketing/seo-roadmap.md) · [Referral Strategy](04-marketing/referral-partner-strategy.md) |
| [04 Development](04-development/codex-playbook.md) | Engineering playbook: architecture, validation, and delivery rules | [Codex Playbook](04-development/codex-playbook.md) · [Automation Engine Engineering Contract](04-development/automation-contract.md) |
| [05 Sales](05-sales/pricing-and-service-model.md) | Launch service model and controlled partner communication | [Pricing and Service Model](05-sales/pricing-and-service-model.md) · [Referral Partner Script](05-sales/referral-partner-script.md) |
| [06 Operations](06-operations/operations-manual.md) | Internal appointment, support, refund, security, and daily operating procedures | [Operations Manual](06-operations/operations-manual.md) · [Daily Checklists](06-operations/daily-checklists.md) |
| [07 Finance](07-finance/kpis.md) | Provisional KPI definitions and launch finance operations notes | [KPIs](07-finance/kpis.md) · [Financial Operations](07-finance/financial-operations-notes.md) |

## Document status language

Every roadmap or capability statement should use one of these labels:

| Label | Meaning |
| --- | --- |
| **Current** | Implemented in this repository and supported by code or documented operations. |
| **Planned** | Intended work with a defined product direction; not a customer promise. |
| **Future vision** | Directional opportunity that requires discovery and explicit approval. |
| **Success criteria** | The measurable evidence required to consider an outcome successful. |

## How this documentation evolves

1. Update the relevant blueprint page when a product decision, design standard, or engineering convention changes.
2. Keep PRDs focused on a feature; link them to the roadmap and relevant architecture decisions.
3. Record irreversible technical decisions in [ADRs](architecture/decisions/README.md).
4. Keep operational details in engineering runbooks, such as [communications scheduling](engineering/communications-scheduler.md).
5. Do not recast planned work as current capability. Prefer a precise limitation over a vague promise.

## Related reference material

- [Canonical Product Blueprint roadmap](00-overview/roadmap.md)
- [Historical product roadmap](product/roadmap.md)
- [Architecture overview](architecture/overview.md)
- [Current visual system](design-system.md)
- [Testing strategy](engineering/testing-strategy.md)
- [Technical debt backlog](technical-debt/backlog.md)
