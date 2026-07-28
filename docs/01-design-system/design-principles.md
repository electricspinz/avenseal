# Design Principles

**Status:** Current design standards. This document explains the high-level “why” behind the existing [Avenseal Design System](../design-system.md), [Design Tokens](design-tokens.md), [Component Standards](components.md), [Content Style](content-style.md), and product principles in [Vision](../00-overview/vision.md).

## Design philosophy and personality

Avenseal should feel calm, precise, and professionally accountable. The interface should make urgent work easier without looking alarming, and communicate verified status without overpromising. This matters because appointment work often involves time pressure, personal information, and human judgment.

## Type, spacing, and color

| Area | Standard | Why |
| --- | --- | --- |
| Typography | Use the existing Geist/Inter stack, semantic headings, explicit sizes and weights for UI chrome | Clear hierarchy reduces scanning effort and avoids browser-default inconsistency |
| Spacing | Use a consistent Tailwind rhythm: compact within a record, generous between decisions and sections | Predictable spacing helps operators distinguish related data from separate tasks |
| Color | Use `navy` for structure, `slateDeep` for supporting text, `silver` for boundaries, `mist` for quiet surfaces, and `emeraldAction` for primary or verified positive action | Restrained color supports trust; it must not substitute for text |
| Status indicators | Pair status words with shape/icon and semantic color | Color-only status excludes users and can imply unverified health |

## Structure: cards, navigation, forms, and tables

| Pattern | Standard | Why |
| --- | --- | --- |
| Cards | Use `AdminCard` for bounded decision groups; do not wrap every piece of content | Too many containers obscure information hierarchy |
| Navigation | Keep durable operational destinations in `AdminShell`; make active location obvious | Operators need predictable orientation across tasks |
| Forms | Label every control, group related fields, explain irreversible effects before submission | Configuration changes affect customer experience and operations |
| Tables | Use tables for comparable, high-density records; maintain readable headers and responsive overflow | Tables preserve relationships that card grids often hide |
| Progressive disclosure | Lead with summary and next action, then provide diagnostics/detail | Most users need the decision, not the entire system model |

## States and confirmation

| State | Standard | Why |
| --- | --- | --- |
| Loading | Show a purposeful loading state only while a meaningful user-visible wait exists | Fake progress erodes trust |
| Empty | State what is absent, why it matters, and the next useful action | Empty data should never look like a broken page |
| Error | State safe user impact and recovery step; retain sensitive diagnostics server-side | Customers and operators need actionable information without secret leakage |
| Confirmation | Confirm destructive or hard-to-reverse actions with the exact impact and target | Prevents accidental operational changes |

## Responsive design, accessibility, motion, and performance

| Area | Standard | Why |
| --- | --- | --- |
| Responsive design | Preserve task hierarchy, tap targets, and status on small screens; intentionally adapt tables | Mobile support is not a scaled desktop screenshot |
| Accessibility | Use semantic landmarks, labels, keyboard navigation, visible focus, text-backed status, and WCAG AA contrast | Accessibility is a baseline quality requirement, not a final polish pass |
| Motion and microinteractions | Use subtle feedback only to clarify state change; respect reduced-motion preferences | Motion should explain interaction, never decorate uncertainty |
| Performance | Prefer server-rendered data, stable layout, and minimal client state | Fast, stable pages reduce friction for both customers and staff |
| Consistency | Reuse existing component families, terms, status labels, and spacing rules | Familiar behavior reduces training and implementation drift |

## Measurable experience goals

| Goal | Classification | Success criteria |
| --- | --- | --- |
| Routine appointment review | Planned operational target | A complete routine decision can be made in under 10 seconds |
| Standard booking | Planned product target | A prepared customer can submit in under 60 seconds |
| Primary action discovery | Current design requirement | Every primary action is within three interactions from its relevant surface |
| Complete state design | Current engineering requirement | Every new page defines loading, empty, and error behavior |
| Inclusive operation | Current engineering requirement | Primary workflows are keyboard accessible and target WCAG AA contrast |

Apply these standards with the [North Star](../00-overview/north-star.md), use the specialized design-system references for implementation detail, and enforce them through the [Codex Playbook](../04-development/codex-playbook.md).
