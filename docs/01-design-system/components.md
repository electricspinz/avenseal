# Component Standards

**Status:** Reuse guide. “Current” means a reusable implementation exists; “Planned” is a standard for future work, not a component to assume exists.

## Purpose, hierarchy, and reuse

Build from existing primitives before creating feature-specific UI. Compose small components around a single responsibility; avoid duplicating visual or business logic. Every component must preserve semantic markup, visible focus, keyboard behavior, text-backed status, and responsive reading order.

## Current inventory

| Component | Status | Purpose / variants |
| --- | --- | --- |
| `Button`, `ButtonLink` | Current | Primary, secondary, navy, ghost; 44px minimum height and focus ring |
| `AdminShell`, `AdminCard` | Current | Admin navigation and bounded operational surface |
| `StatusBadge` | Current | Appointment status with text and dot |
| `AttentionBanner`, `MetricCard`, `SystemHealthCard`, `QuickActions` | Current | Dashboard-specific composition primitives |
| Admin settings/form controls | Current, local | Inputs, selects, toggles and field patterns are not yet shared primitives |
| Lucide icon map | Current | Existing navigation icon source |

## Planned component categories

| Category | When to use | Do not use when | Required behavior |
| --- | --- | --- | --- |
| Inputs/selects/textareas/checkboxes/radios/date-time | Collect a labeled, editable value | Read-only display | Label, help/error text, focus, disabled/read-only state, touch target |
| Search | Find a bounded, known record set | Filtering that needs no query or global provider search | Visible label, clear/reset behavior, debounced request only when server contract exists |
| Cards/section containers | Bound a decision or related information | Every paragraph or nested content | Standard, action, metric, status, attention, feed, recommendation variants |
| Tables/lists | Table for stable column comparison; list for narrative/mobile hierarchy | Decorative record grids | Sort/filter/pagination states, row action names, compact alternative |
| Alerts/banners | Source-backed attention needing immediate context | Routine informational copy | Severity text, reason, destination, no color-only meaning |
| Empty/error/loading states | No data, failed data, or meaningful wait | To mask missing requirements | Explain absence/failure, preserve layout, offer supported next step |
| Dialogs/menus/tooltips/tabs | Focused temporary choice or compact navigation | Replacing a destination page or hiding primary work | Focus management, escape/close, accessible name; dialogs are **Planned** |
| Pagination/breadcrumbs | Bounded records and deep navigation | Unbounded first-release infinite scroll | Keyboard accessible, preserves filters/context |
| Metrics/feed/schedule/recommendations | Operational evidence with a source | Decorative dashboard filler | Explicit source state, responsive list treatment, destinations |

## Button hierarchy

One primary action per focused region. Use secondary for alternate path, ghost/tertiary for low-emphasis local action, destructive only for destructive confirmed action, link style for navigation, and icon-only only with an accessible label. Loading preserves dimensions; disabled stays legible; focus remains visible.

## Status vocabulary

| Domain | Current vocabulary | Note |
| --- | --- | --- |
| Appointment | Awaiting Review, Awaiting Payment, Clarification Needed, Confirmed, Ready, Completed, Cancelled, Declined, Follow-Up Required, No-Show | Use existing labels from `lib/types.ts` |
| Communication | Scheduled, Ready to Queue, Queued, Sent, Failed, Cancelled | Current normalized communications view |
| System health | Healthy, Needs Attention, Degraded, Unknown | **Planned formal standard;** do not equate with provider SLA |
| Generic workflow | Loading, Empty, Error, Unavailable | Use exact state rather than “healthy” by default |

**Technical Debt:** shared form controls, alert/empty/error/loading primitives, dialog/menu/tooltip, pagination, and a unified status vocabulary are not yet established components.

## Component documentation template

```md
### Component name
**Status:** Current | Planned
**Purpose:**
**Anatomy:**
**Variants and states:**
**Behavior and content:**
**Accessibility:**
**Responsive behavior:**
**Implementation notes:**
**Examples / anti-patterns:**
```
