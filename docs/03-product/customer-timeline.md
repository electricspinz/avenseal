# Customer Timeline

**Status:** In-memory domain foundation and first staff-facing UI are implemented. Database persistence is not implemented.

The Customer Timeline is a tenant-scoped, staff-facing chronology for a customer and, when applicable, an appointment. It records safe business facts; it never executes work, replaces Automation audit evidence, or serves as the Operations Feed.

## Architecture

`Domain event or execution result → mapper → TimelineRecorder → TimelineStore → customer/appointment query`

Events use immutable typed categories (`appointment`, `communication`, `automation`, `payment`, `document`, `customer`, `staff`, `system`), typed outcomes, actors, sources, correlation, and causation IDs. Identity derives from organization, type, customer/appointment, source event, rule version, and communication request identity—not runtime randomness or timestamps alone.

Queries require organization scope and support customer, appointment, category, outcome, date range, and limit. Results are ordered by `occurredAt` descending, then `recordedAt`, then ID for stable ties.

## Relationships

Automation adapters map safe appointment timeline actions into chronology entries; communications adapters map normalized delivery results without provider payloads or raw errors. Operations Feed remains organization-wide operational awareness, while Timeline remains customer/appointment investigation history. Existing appointment status history remains a specialized repository state log; future adapters may record corresponding timeline facts without replacing it.

## Safety and deferrals

Organization and customer identity are mandatory. Metadata is constrained to scalar safe values, and secret-like keys, empty summaries, malformed dates, and duplicate logical facts are rejected or deduplicated. The current store is in-memory only. Database persistence, workers, queues, schedulers, timeline editing, and deletion remain deferred.

## Current UI foundation

Customer and appointment detail pages query the timeline boundary server-side and render the shared `CustomerTimeline` component. Events appear newest first, grouped as Today, Yesterday, Earlier This Week, Earlier This Month, or Older. Items expose a semantic category badge, outcome badge, optional related appointment, communication, or automation badges, icon, safe summary, actor/source metadata, and an accessible exact timestamp. The compact single-column layout avoids horizontal scrolling on smaller screens. Category and outcome filters, plus a customer-page appointment filter, submit to the existing server-side query boundary rather than applying business logic in the browser. Empty, loading, and error presentation states are reusable and explicit. Until a future repository-backed store is introduced and recorders are wired into workflows, the current in-memory query boundary has no persisted history to display.
