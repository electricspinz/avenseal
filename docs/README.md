# Avenseal Product Blueprint

The Product Blueprint is Avenseal’s version-controlled internal handbook. It connects product intent to design, architecture, and delivery practice so a new teammate can understand what the product is, what is true today, and how to extend it safely.

It complements—not replaces—feature PRDs, ADRs, migrations, and operational runbooks. When sources disagree, deployed behavior and the relevant ADR or migration are authoritative; update this blueprint in the same change that intentionally changes product direction or working conventions.

## Reading order and document types

| Section | Purpose | Start here |
| --- | --- | --- |
| [00 Overview](00-overview/vision.md) | Product strategy: why Avenseal exists, its North Star, and canonical roadmap sequence | [Vision](00-overview/vision.md) · [Roadmap](00-overview/roadmap.md) |
| [01 Design System](01-design-system/design-principles.md) | Design principles plus implementation-ready [tokens](01-design-system/design-tokens.md), [components](01-design-system/components.md), and [content style](01-design-system/content-style.md) | [Design Principles](01-design-system/design-principles.md) |
| [03 Product](03-product/mission-control.md) | PRDs define feature problem/scope; UI specifications define presentation and behavior | [Mission Control PRD](03-product/mission-control.md) · [Aven Operations Copilot](03-product/aven-copilot.md) · [Customer Timeline](03-product/customer-timeline.md) · [Payments Foundation and Center](03-product/payments.md) · [Automation Engine PRD](03-product/automation-engine.md) · [Appointment Automation Rules](03-product/appointment-automation.md) · [Communications Execution Engine](03-product/communications-execution.md) · [Automation Rule Catalog](03-product/automation-rules.md) · [Automation Lifecycle](03-product/automation-lifecycle.md) |
| [04 Development](04-development/codex-playbook.md) | Engineering playbook: architecture, validation, and delivery rules | [Codex Playbook](04-development/codex-playbook.md) · [Automation Engine Engineering Contract](04-development/automation-contract.md) |

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
