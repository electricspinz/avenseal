# Product Vision

**Status:** Current product direction. This document describes intent and decision criteria; it is not a customer-facing feature list.

## Vision

Avenseal makes remote online notary appointments easier to request, review, and operate without compromising the human judgment required for notarization.

## Mission

Give customers a clear, secure path to request an appointment and give notary administrators a dependable system for managing the work that follows: scheduling, review, customer status, communication, and integrations.

## Product promise

| Promise | What it means |
| --- | --- |
| Clear next steps | Customers can understand their request, status, and next action without guessing. |
| Durable operations | Administrators work from recorded appointment and communication state, not inbox memory or scattered provider dashboards. |
| Professional boundaries | Avenseal supports workflow; it does not provide legal advice or automate notarial determinations. |
| Safe evolution | Tenant isolation, server-side authorization, and provider failure handling are product requirements, not implementation details. |

## Target customers

| Audience | Primary job | Current support |
| --- | --- | --- |
| Customers requesting Florida remote online notarization | Submit a complete request and understand what happens next | **Current:** public booking, confirmation/status flow, secure appointment access |
| Avenseal administrators | Review and operate appointments with less manual coordination | **Current:** admin appointments, customers, settings, integrations, and communications records |
| Future organization operators | Configure their own tenant-safe operations | **Future Vision:** organization normalization exists; broad multi-organization SaaS workflows are not yet a supported product surface |

## Product principles

These principles are the product-level contract for [North Star](north-star.md), [design decisions](../01-design-system/design-principles.md), and [engineering delivery](../04-development/codex-playbook.md).

| Principle | Purpose | Example | Design decision effect |
| --- | --- | --- | --- |
| Automation First | Remove repeatable administrative work only when the workflow is safe and observable. | Schedule a reminder from an appointment record. | Prefer durable queues and explicit states over manual copy/paste. |
| AI with Purpose | Use AI to assist, explain, and escalate—not to make regulated judgments. | Future guided booking FAQs with a human escalation path. | Reject features that imply autonomous legal or notarial decisions. |
| Calm Software | Make operational work feel ordered under time pressure. | A concise attention state rather than a noisy dashboard. | Prefer clear hierarchy, plain language, and one next action. |
| Professional Trust | Make the system’s limits, status, and ownership understandable. | Show a failed message as failed, not “healthy.” | Never invent provider health, delivery, or compliance claims. |
| Progressive Disclosure | Show the next decision first and diagnostics when needed. | Appointment summary before audit detail. | Avoid exposing irrelevant complexity by default. |
| Consistency | Make equivalent actions and states behave alike across surfaces. | Shared status badges and admin cards. | Reuse established components and language. |
| Accessibility by Default | Ensure the product works without mouse, color, or ideal eyesight. | Text labels alongside status color. | Keyboard, semantic structure, focus, and WCAG AA are baseline requirements. |
| Mobile Ready | Preserve core work on a small screen without hiding meaning. | Responsive booking and readable administrative records. | Design narrow layouts intentionally; do not merely shrink desktop UI. |
| Performance Matters | Respect customer urgency and operator attention. | Server-rendered read paths with focused queries. | Avoid unnecessary client state and broad data loading. |
| Data Before Decoration | Prioritize verified operational evidence over visual filler. | Count persisted failed messages, not estimated “engagement.” | No fake metrics, implied provider health, or decorative dashboards. |

## Success metrics

These are **Planned** measurement goals. They are not claims that a complete analytics product exists today.

| Outcome | Measure | Success criteria |
| --- | --- | --- |
| Fast customer intake | Median time to submit a standard booking request | **Planned:** under 60 seconds for a prepared customer |
| Low-friction review | Time for an administrator to approve or route a complete appointment | **Planned:** under 10 seconds for a routine decision |
| Operational discoverability | Steps to a primary admin action | **Planned:** primary actions reachable within three interactions |
| Inclusive use | Keyboard and assistive-technology coverage | **Current requirement:** no primary workflow depends on pointer or color alone; **planned evidence:** routine accessibility audits |
| Communication reliability | Persisted queue and delivery-attempt records | **Current foundation:** durable queue/reminder records; **planned:** provider delivery reconciliation and reporting |

## Long-term vision

**Future Vision:** Avenseal can become a configurable operating platform for independent notary organizations, including customer self-service, multi-channel communications, operational analytics, AI-assisted support, and broader scheduling models. Each expansion must first satisfy the North Star decision framework and preserve human notarial authority.

Next: [North Star](north-star.md) → [Roadmap](roadmap.md) → [Design Principles](../01-design-system/design-principles.md) → [Codex Playbook](../04-development/codex-playbook.md).
