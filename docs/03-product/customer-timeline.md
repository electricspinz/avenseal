# Customer Timeline

**Status:** Planned operational-history product contract with an in-memory domain foundation. No customer UI or database persistence is implemented.

The Customer Timeline is a tenant-scoped, staff-facing chronology for a customer and, when applicable, an appointment. It records safe business facts; it never executes work, replaces Automation audit evidence, or serves as the Operations Feed.

## Architecture

`Domain event or execution result → mapper → TimelineRecorder → TimelineStore → customer/appointment query`

Events use immutable typed categories (`appointment`, `communication`, `automation`, `payment`, `document`, `customer`, `staff`, `system`), typed outcomes, actors, sources, correlation, and causation IDs. Identity derives from organization, type, customer/appointment, source event, rule version, and communication request identity—not runtime randomness or timestamps alone.

Queries require organization scope and support customer, appointment, category, outcome, date range, and limit. Results are ordered by `occurredAt` descending, then `recordedAt`, then ID for stable ties.

## Relationships

Automation adapters map safe appointment timeline actions into chronology entries; communications adapters map normalized delivery results without provider payloads or raw errors. Operations Feed remains organization-wide operational awareness, while Timeline remains customer/appointment investigation history. Existing appointment status history remains a specialized repository state log; future adapters may record corresponding timeline facts without replacing it.

## Safety and deferrals

Organization and customer identity are mandatory. Metadata is constrained to scalar safe values, and secret-like keys, empty summaries, malformed dates, and duplicate logical facts are rejected or deduplicated. The current store is in-memory only. Database persistence, final UI, workers, queues, schedulers, timeline editing, and deletion remain deferred.
