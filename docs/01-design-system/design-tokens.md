# Design Tokens

**Status:** Design System v1 reference. Values marked **Current** are present in Tailwind/CSS; values marked **Planned** are implementation recommendations, not existing tokens.

## Purpose and naming

Tokens describe semantic roles (`surface`, `text-primary`, `action-primary`) rather than one-off visual choices. This protects consistency, dark-mode readiness, and accessible status communication. New tokens should be added to the Tailwind theme only after a real reuse case.

## Current implementation audit

| Role | Current token/value | Use |
| --- | --- | --- |
| Background / surface | `white` / `#FFFFFF` | Base page and cards |
| Text primary | `navy` / `#102A43` | Headings, primary text, admin shell |
| Text secondary | `slateDeep` / `#334E68` | Supporting text |
| Border | `silver` / `#D9E2EC` | Cards, dividers, controls |
| Surface subtle | `mist` / `#F5F8FB` | Page background and quiet states |
| Action primary | `emeraldAction` / `#2BB673` | Primary action and verified positive state |
| Focus ring | `rgba(43,182,115,.34)` | `.focus-ring:focus-visible` |
| Elevation | `shadow-quiet`: `0 14px 40px rgba(16,42,67,.08)` | Raised public surfaces |
| Font stack | Geist → Inter → system sans | `font-sans` / `--font-geist-sans` |

## Planned semantic roles

| Role | Planned guidance | Why |
| --- | --- | --- |
| Surface elevated / subtle | Map to white / mist before adding colors | Calm neutral surfaces reduce visual noise |
| Border strong | Derive from navy at accessible low opacity | Supports emphasis without heavy shadows |
| Action primary hover | Current button uses `#239c62`; formalize only when reused | Prevents scattered literal hover values |
| Success, warning, danger, information, unknown | Use semantic classes plus text label; current palettes are component-local | Status must remain understandable without color |
| Dark mode | No dark mode is implemented | Semantic roles—not raw colors—make future support feasible |

## Typography, spacing, and sizing

| Token family | Current | Planned standard |
| --- | --- | --- |
| Type | Existing pages use Tailwind semantic sizes (`text-xs` through `text-5xl`) | Roles: Display, Page Title, Section Title, Card Title, Body, Body Small, Label, Caption, Button, Metric; preserve explicit control type |
| Spacing | Tailwind spacing utilities; common card/page values include `p-5`, `p-6`, `p-8`, `gap-4`, `gap-6` | Use a limited scale; inline gap, control gap, card padding, section gap, and page gutter should be intentional rather than arbitrary |
| Controls | Current buttons/inputs use minimum heights 44–48px | Keep primary touch targets at least 44px; dense data rows may be smaller only when not primary touch controls |
| Icons | Existing admin nav uses 18px Lucide icons | Use 16–20px for inline/control icons and pair icon-only controls with an accessible name |

Typography roles should scale down by hierarchy—not by arbitrary compression—on compact screens. Avoid proprietary fonts unless licensed and already available.

## Radius, borders, elevation, motion, and layers

| Area | Current | Planned standard |
| --- | --- | --- |
| Radius | Controls commonly `rounded-md`; cards `rounded-lg` | Keep control/card distinction; reserve pills for compact status/filter affordances |
| Borders | `border-silver`; occasional semantic border colors | Prefer one subtle border before adding shadow or nested cards |
| Elevation | `shadow-sm` and `shadow-quiet` | Use elevation only to clarify hierarchy; avoid floating-card overload |
| Motion | Generic Tailwind `transition`; no duration scale formalized | Instant 0–100ms, Fast 120–180ms, Standard 180–240ms, Deliberate 240–320ms; no motion blocks interaction |
| Layers | No z-index scale formalized | **Planned:** define named layers when dialogs/menus are introduced; avoid arbitrary z-index values |

## Layout and data visualization

The current admin shell is a `260px` desktop sidebar with `p-5` compact and `p-8` wide content gutters. **Planned:** describe compact, medium, and wide behavior semantically instead of adding breakpoint-specific design tokens. Tables may scroll horizontally today; new dense data surfaces must also offer readable compact-list behavior.

Charts are not a default Mission Control element. Use a data visualization only when it answers an operational question better than a metric, list, or feed. Never use decorative charts or fabricated trends.

## Accessibility and implementation guidance

- Meet WCAG AA contrast; test text/icon combinations in their actual surface.
- Never convey status by color alone; include text and, where useful, shape/icon.
- Preserve the existing visible focus treatment or improve it with an equally visible tokenized replacement.
- Use existing tokens/components first; document any new semantic token with role, contrast, and migration impact.

## Technical debt

**Technical Debt:** color semantics, typography roles, spacing scale, motion scale, and z-index layers are not yet formalized in one token source. Migrate incrementally; do not replace current styling wholesale during feature work.
