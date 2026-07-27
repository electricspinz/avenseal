# Mission Control UI Specification

**Status:** Planned. This specification complements the [Mission Control PRD](mission-control.md): the PRD defines product behavior/data boundaries; this document defines hierarchy, presentation, and interaction. It is not production UI or seed data.

**Use with:** [North Star](../00-overview/north-star.md) · [Design Principles](../01-design-system/design-principles.md) · [Design Tokens](../01-design-system/design-tokens.md) · [Components](../01-design-system/components.md) · [Content Style](../01-design-system/content-style.md) · [Codex Playbook](../04-development/codex-playbook.md).

## 1. Experience goals

Mission Control is calm, trustworthy, operational, focused, fast, professional, and helpful without being intrusive. Within 10 seconds, an operator should know what needs attention, what is happening today, whether a core system needs review, and the next supported action.

Avoid dense analytics dashboards, decorative charts, fake health, repetitive card grids, redundant metrics, alert fatigue, overly conversational AI, and long text before operational content.

## 2. Hierarchy and responsive order

Wide layouts prioritize Daily Brief, Attention Required, and Today’s Schedule together. Compact layouts put these three in strict reading order before passive metrics. Quick Actions follow schedule on compact screens because they provide a fast escape to supported work; Operations Feed is intentionally lower because it is evidence, not the first decision.

| Order | Wide | Compact |
| --- | --- | --- |
| 1–3 | Daily Brief → Attention + Schedule | Daily Brief → Attention → Schedule |
| 4–6 | Snapshot → Health → Quick Actions | Quick Actions → Health → Snapshot |
| 7–8 | Operations Feed → AI Recommendations | AI Recommendations → Operations Feed |

## 3. Wireframes

### Wide

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Daily Brief: greeting, local date, concise verified summary                 │
├─────────────────────────────────────┬──────────────────────────────────────┤
│ Today’s Schedule (≈ two-thirds)     │ Attention Required (≈ one-third)     │
│ current / upcoming / completed rows  │ highest 3–5 actionable items          │
├─────────────────────────────────────┴──────────────────────────────────────┤
│ Business Snapshot: restrained metric row                                    │
├──────────────────────────────┬─────────────────────────────────────────────┤
│ System Health                │ Quick Actions                               │
├──────────────────────────────┴─────────────────────────────────────────────┤
│ Operations Feed (full width, paginated)                                     │
├────────────────────────────────────────────────────────────────────────────┤
│ AI Recommendations (Future Vision; absent until supported)                  │
└────────────────────────────────────────────────────────────────────────────┘
```

### Medium

```text
┌──────────────────────────────────────────┐
│ Daily Brief                               │
├────────────────────┬─────────────────────┤
│ Attention Required │ Today’s Schedule     │
├────────────────────┴─────────────────────┤
│ Snapshot (2-up) / System Health (2-up)   │
├──────────────────────────────────────────┤
│ Quick Actions                             │
├──────────────────────────────────────────┤
│ Operations Feed                           │
└──────────────────────────────────────────┘
```

### Compact

```text
┌──────────────────────────────┐
│ Daily Brief                  │
├──────────────────────────────┤
│ Attention Required (max 3)   │
├──────────────────────────────┤
│ Today’s Schedule (max 4)     │
├──────────────────────────────┤
│ Quick Actions                │
├──────────────────────────────┤
│ System Health                │
├──────────────────────────────┤
│ Business Snapshot (2-up)     │
├──────────────────────────────┤
│ AI / Feed (collapsed summary)│
└──────────────────────────────┘
```

Use single-column compact layout, 44px minimum touch targets, normal text wrapping, and no hover-only content. Do not use horizontal metric scrolling unless real metrics cannot fit as a two-up grid; no swipe-only control. Navigation follows the current horizontal-overflow admin pattern until a dedicated compact navigation decision is approved.

## 4. Header and Daily Brief

Greeting uses organization timezone: morning before 12:00, afternoon before 18:00, evening afterward. Display an administrator name only when an authoritative display-name source exists; current implementation must omit it. Date is shown; local time is optional and only useful if it clarifies timezone.

| State | Approved example |
| --- | --- |
| Normal | “Good morning. You have 5 appointments today, 2 awaiting review, and 3 reminders scheduled.” |
| No appointments | “Good morning. You have no appointments scheduled today.” |
| Attention | “Good morning. You have 4 appointments today and 2 items that need attention.” |
| Partial | “Some operational information is temporarily unavailable. Available appointment information is shown below.” |
| Unknown | “Today’s operational summary is unavailable.” |

Never say “Everything is healthy” without explicit verified scope, add artificial urgency, celebrate routine work, or introduce a long paragraph.

## 5. Attention Required

### Anatomy and behavior

Each item has priority text/icon, title, concise reason, customer/appointment context when available, timestamp/age when meaningful, one primary destination action, optional secondary detail action, and source status label. It is a destination card/row, not a modal workflow.

| Priority | Use | Treatment |
| --- | --- | --- |
| Critical | Only documented time-sensitive safety/operational condition | Text label plus restrained danger treatment; no pulse unless a concrete near-term deadline warrants it |
| High | Failed communication, calendar failure, review near requested time | Appears first |
| Standard | Disabled configuration or non-imminent review | Normal attention treatment |
| Informational | Only when it still has an action | Quiet action, not alert styling |

Sort by priority, appointment proximity, then newest event. Display up to five wide and three compact items, with a “View all” destination only when a supported list exists. First release does not allow dismissal: source resolution removes the item. A future dismissal can return only with audit, expiry, and reopen rules. Empty: “No action is required from the available data.” Error/partial: state the unavailable source; do not replace other items.

## 6. Today’s Schedule

Show chronological current/upcoming/completed groups; completed is persisted status, not elapsed time. A current marker appears only when trustworthy duration/time window exists. Each row includes local date/time/timezone, customer, service snapshot or “Service not recorded,” text status, and Open details. Show Join or Calendar only when a real supported URL/action exists.

Default: five rows wide, four compact, with a supported “View all” destination. De-emphasize completed/cancelled rows but preserve text label. Long names wrap to two lines then truncate with accessible full name; delayed/different-timezone status requires real source data, otherwise omit. Empty/error/partial states mirror Attention: never infer completion or calendar availability.

## 7. Snapshot and System Health

| Snapshot metric | Current evidence | UI rule |
| --- | --- | --- |
| Appointments Today / Awaiting Review / Upcoming / Completed | Appointments/status | Label, value, short scope, source destination |
| Scheduled / Failed Communications | Normalized communication/reminder records | Show only when query is available |
| Revenue, conversion, overdue payments | Not reliable for this surface | Omit; do not show zero/trends |

Metrics have no fabricated percentage changes or count-up motion. Unknown is shown as “Unavailable,” not `0`.

System cards are Communications, Reminder Queue, Calendar Sync, and AI Concierge only when real data supports the statement. Every card uses **Healthy**, **Needs Attention**, **Degraded**, or **Unknown**, a text sentence, optional relevant timestamp, source destination, and recommended supported action. Missing data defaults to Unknown—not Healthy.

## 8. Quick Actions, Feed, and AI

### Quick Actions

Maximum five actions; initial supported set is Review Appointments, Open Communications, Open Settings, Open Integrations. “Create Appointment,” “View Calendar,” and “Open AI Concierge” stay absent until their route/workflow exists. Use existing Lucide icon family, text label, visible focus, and link semantics. On compact, wrap into a two-column action group; do not duplicate every navigation destination. One action may be primary per region.

### Operations Feed

**Planned.** Event row anatomy: event icon/title, customer and appointment context, actor when recorded, absolute timestamp (relative time optional), source/status, and destination. Groups: Appointment, Communication, Reminder, Calendar, Customer, AI Concierge. Initial page: 20 newest events, date groups, explicit “Load more” pagination—not infinite scroll. Deduplicate by source event ID/type; retain distinct retries. Failed events have text emphasis. Empty/error/partial states preserve source context and filters.

### AI Recommendations

**Future Vision.** Maximum three. Each card contains recommendation title, plain-language reason, real supporting evidence, timestamp, one reversible destination action, dismiss/feedback only when an audited user-specific state exists. No confidence score, fabricated urgency, or autonomous action. Empty: “No recommendation is available from the current operational data.” Unavailable/error: state that recommendations are unavailable; do not substitute generic advice.

## 9. Component inventory

| Component | Status | Primitive | Required variants / accessibility / compact behavior |
| --- | --- | --- | --- |
| `MissionControlHeader`, `DailyBrief`, `SectionHeader` | Planned | AdminShell/type styles | Semantic heading; wraps naturally |
| `AttentionPanel`, `AttentionItem` | Planned | AttentionBanner/AdminCard | Priority text, source link; stack items |
| `SchedulePanel`, `ScheduleItem` | Planned | AdminCard/StatusBadge | List row, text status; compact max 4 |
| `SnapshotMetric`, `HealthCard` | Current foundation / Planned | MetricCard/SystemHealthCard | Unknown state; 2-up compact |
| `QuickAction` | Current foundation | ButtonLink/QuickActions | Text + icon; 44px target |
| `OperationsFeed`, `OperationsEvent` | Planned | List/table pattern | Paginated list compact |
| `RecommendationCard` | Future Vision | AdminCard | Evidence, reversible link |
| `EmptyState`, `ErrorState`, `LoadingSkeleton` | Planned shared primitives | Existing local patterns | Announced text, stable dimensions |

## 10. Interaction, state, motion, accessibility

Cards navigate only when the whole card has one clear destination; otherwise use explicit inline actions. Focus order follows visual reading order. Enter activates links/buttons; Space activates buttons only. Disclosure controls expose expanded state and work by keyboard. Prefer destination pages over dense modals. Confirm only destructive, irreversible, externally visible, or financial actions. Retry changes no state optimistically unless server response is confirmed; toasts are **Planned** and must not be the sole confirmation.

| State | Required behavior |
| --- | --- |
| Loading | Stable skeleton/placeholder; no fake progress |
| Populated | Source-backed values/actions |
| Empty | Explain absence and next supported path |
| Error | Explain failed section, what remains available, next step |
| Partial | Retain available sections and identify missing source |
| Unknown | Text “Unknown”/“Unavailable”; no implied health |
| Permission-restricted | Explain access boundary without exposing sensitive data |

Motion is limited to 120–240ms opacity/position transitions, button loading, disclosure, brief confirmed success, and pointer-only subtle hover. Respect reduced motion; no routine pulses, bouncing icons, animated gradients, long count-ups, or motion that delays information.

Use landmarks and sequential heading levels; visible focus; keyboard/touch access; descriptive action names; screen-reader-friendly absolute timestamps; WCAG AA contrast; logical DOM order; no hover/color-only information. Use live regions only for actual dynamic updates.

## 11. Content examples

*Fictional examples for design review only; not seed data or defaults.*

| Surface | Example |
| --- | --- |
| Attention | **High · Communication failed** — “Confirmation for Jordan Lee was not sent. Retry is available.” |
| Schedule | “10:30 AM EDT · Jordan Lee · Remote online notarization · Confirmed · Open details” |
| Health | “Unknown — Calendar connection status could not be loaded. Open integrations.” |
| Feed | “Communication failed · Jordan Lee · 9:12 AM EDT · Open communication” |
| AI | “Recommendation: Review an appointment nearing its requested time. Based on its Awaiting Review status.” |
| Error | “We couldn’t load communication health. Appointment information is still available. Try again.” |

## 12. Acceptance criteria and open questions

Acceptance: hierarchy follows this spec across compact/medium/wide; all sections define loading/empty/error/partial/unknown behavior; keyboard/focus/status text/WCAG AA/reduced motion are reviewed; actions navigate to real supported destinations; no system health/metric/AI recommendation is fabricated; small screens prioritize brief, attention, and schedule.

Open questions: exact wide column proportions; whether AI appears before Feed when supported; completed-appointment default visibility; compact Quick Action persistence; initial attention maximum; and future user-configurable section order. These require product approval before implementation.
