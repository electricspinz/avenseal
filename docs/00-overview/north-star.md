# North Star

**Status:** Current decision framework for product and engineering work.

## Product philosophy

The North Star is simple: **reduce administrative work for the notary while increasing customer clarity and preserving professional control.**

Avenseal is not optimized for activity, feature count, or decorative dashboards. It is optimized for a trustworthy operational path: accurate records, fewer manual handoffs, clear customer communication, and timely human review.

## Ideal customer journey

```mermaid
flowchart LR
  A[Customer needs a remote notary appointment] --> B[Understands the request and boundaries]
  B --> C[Submits a clear booking request]
  C --> D[Notary administrator reviews durable records]
  D --> E[Customer receives accurate status and next steps]
  E --> F[Human notary prepares and completes the session]
```

## What every feature should optimize for

| Priority | Test |
| --- | --- |
| Administrative leverage | Does it eliminate, shorten, or make a recurring notary task safer? |
| Customer clarity | Does it reduce uncertainty about status, next step, or responsibility? |
| Professional control | Does it keep consequential notarial and legal judgment with a person? |
| Operational truth | Does it create a durable, reviewable record rather than an opaque action? |
| Safe simplicity | Is it the smallest coherent solution with known failure behavior? |

## Feature evaluation process

```mermaid
flowchart TD
  A[Problem statement] --> B{Reduces notary administrative work?}
  B -- No --> C[Defer or reject unless a clear safety or customer-clarity case exists]
  B -- Yes --> D{Preserves human judgment and tenant safety?}
  D -- No --> E[Redesign or reject]
  D -- Yes --> F{Can status, failure, and ownership be explained?}
  F -- No --> G[Add durable records and recovery design]
  F -- Yes --> H[Define acceptance criteria, tests, and documentation]
```

Accept work only when it has a demonstrated user or operator problem, a **Current**, **Planned**, or **Future Vision** classification, a clear owner, and proportionate validation. Defer work that duplicates a provider dashboard, hides authorization behind UI, creates unsupported automation claims, or cannot explain failure and tenant impact.

## Decision record

| Decision | Required evidence |
| --- | --- |
| Build now | Clear administrative/customer impact, narrow scope, safe architecture, measurable acceptance criteria |
| Plan next | Validated problem with unresolved dependency, policy, or operational ownership |
| Future Vision | Strategic direction without a committed scope or delivery date |
| Reject | No reduction in administrative work, weak customer value, unsafe automation, or duplicative complexity |

Use this framework with [Vision](vision.md), then classify and sequence work in the [Roadmap](roadmap.md). Delivery standards are in the [Codex Playbook](../04-development/codex-playbook.md).
