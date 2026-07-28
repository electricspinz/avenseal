# Automation Rule Catalog

**Status:** Planned. This catalog defines the product contract for future deterministic rules. The examples are illustrative only and do not represent implemented automations.

**Related:** [Automation Engine PRD](automation-engine.md) · [Automation Lifecycle](automation-lifecycle.md) · [Roadmap](../00-overview/roadmap.md) · [Mission Control PRD](mission-control.md)

## Rule contract

Every automation rule must be documented before implementation. A rule is product-owned, explicit, tenant-scoped, and independently auditable. It may not rely on hidden UI state, free-form operator instructions, or AI-generated text as its trigger.

| Field | Required definition |
| --- | --- |
| Rule Name | Stable, human-readable product name |
| Purpose | Operational problem the rule addresses |
| Trigger | Durable event or explicit schedule that starts evaluation |
| Preconditions | Trusted conditions required before eligibility |
| Business Rules | Deterministic policy and exclusions |
| Action | Exact approved workflow effect |
| Destination | Existing operational surface for review or follow-up |
| Retry Policy | Whether, when, and under what evidence retry is allowed |
| Maximum Attempts | Bounded limit before manual review or dead-letter handling |
| Cooldown | Minimum interval before another eligible attempt |
| Timeout | Maximum execution duration before safe failure |
| Idempotency Strategy | Duplicate-prevention identity and behavior |
| Audit Fields | Safe evidence required for the execution record |
| Manual Override | Authorized pause, cancel, approve, or retry behavior |
| Rollback Behavior | Safe reversal or compensating action where practical |
| Notifications | What operational visibility is required; no assumed notification channel |
| Failure State | Lifecycle state and destination after failure |
| Owner | Product/operational owner accountable for policy |
| Status | Current, Planned, or Future Vision |
| Future Expansion Notes | Explicitly deferred variations or policy decisions |

## Illustrative rules

### Retry Failed Communication

| Field | Illustrative definition |
| --- | --- |
| Purpose | Recover an eligible failed communication without creating a duplicate message. |
| Trigger | Persisted failed communication record. |
| Preconditions | Tenant scope is verified; message is eligible; no active duplicate retry; retry limit and cooldown permit execution. |
| Business Rules | Never retry a cancelled message or a message whose outcome is ambiguous. Human review is required where eligibility cannot be proven. |
| Action | Queue the existing eligible communication through the approved communications boundary. |
| Destination | Communications Center and related appointment when available. |
| Retry Policy | Bounded deterministic retry only after the documented cooldown. |
| Maximum Attempts | Planned; requires policy approval. |
| Cooldown | Planned; requires policy approval. |
| Timeout | Planned; requires worker/service policy. |
| Idempotency Strategy | Reuse the message/execution duplicate guard; do not create a new communication. |
| Audit Fields | Rule, organization, communication identifier, eligibility evidence, attempt, outcome, failure summary. |
| Manual Override | Authorized operator may pause, cancel, or manually retry through approved controls. |
| Rollback Behavior | Queueing is not silently reversed; cancellation or manual review follows the communications policy. |
| Notifications | Surface outcome in operational evidence; channel policy is planned. |
| Failure State | Retry Eligible, Manual Review, or Dead Letter based on policy. |
| Owner | Planned communications operations owner. |
| Status | Planned — illustrative only. |
| Future Expansion Notes | Provider-specific recovery requires separate approval. |

### Queue Review Request

| Field | Illustrative definition |
| --- | --- |
| Purpose | Queue a supported review request after a qualifying completed appointment. |
| Trigger | Persisted qualifying completed appointment event. |
| Preconditions | Organization communications setting permits review requests; appointment qualifies; no active or completed duplicate request. |
| Business Rules | Do not infer completion from elapsed time. Do not send if the persisted status or communication policy does not support it. |
| Action | Queue the approved review-request workflow through the communications boundary. |
| Destination | Appointment detail and Communications Center. |
| Retry Policy | Planned; only eligible queue failures may retry. |
| Maximum Attempts | Planned. |
| Cooldown | Planned. |
| Timeout | Planned. |
| Idempotency Strategy | One execution identity per qualifying appointment and rule version. |
| Audit Fields | Rule, organization, appointment, qualifying status evidence, policy evidence, outcome. |
| Manual Override | Authorized operator can pause or route to manual review. |
| Rollback Behavior | No automatic recall after external delivery; use documented communication remediation. |
| Notifications | Operational evidence only until channel policy is approved. |
| Failure State | Retry Eligible or Manual Review. |
| Owner | Planned appointment operations owner. |
| Status | Planned — illustrative only. |
| Future Expansion Notes | Content and timing remain subject to approved communication policy. |

### Schedule Follow-up Reminder

| Field | Illustrative definition |
| --- | --- |
| Purpose | Schedule a supported follow-up reminder for a qualifying appointment lifecycle event. |
| Trigger | Explicit qualifying appointment event and communications configuration. |
| Preconditions | Tenant scope, timing, consent/policy, and duplicate guard are verified. |
| Business Rules | Schedule only an approved reminder type. Missing timing or policy evidence stops execution. |
| Action | Create or queue the supported reminder through the existing reminder boundary. |
| Destination | Appointment detail and Communications Center. |
| Retry Policy | Planned; scheduling ambiguity routes to manual review. |
| Maximum Attempts | Planned. |
| Cooldown | Planned. |
| Timeout | Planned. |
| Idempotency Strategy | One active reminder per appointment, template, and qualifying event. |
| Audit Fields | Rule, organization, appointment, reminder type, schedule evidence, outcome. |
| Manual Override | Authorized operator may pause, cancel, or review scheduled work. |
| Rollback Behavior | Cancel only when the reminder has not reached an externally visible terminal state. |
| Notifications | Operational evidence only until channel policy is approved. |
| Failure State | Retry Eligible, Manual Review, or Dead Letter. |
| Owner | Planned communications operations owner. |
| Status | Planned — illustrative only. |
| Future Expansion Notes | Additional reminder types require separate policy review. |

### Calendar Reconnect Reminder

| Field | Illustrative definition |
| --- | --- |
| Purpose | Prompt an authorized operator when a calendar integration remains disconnected. |
| Trigger | Persisted disconnected integration status. |
| Preconditions | Integration status is verified and no active duplicate reminder exists. |
| Business Rules | This rule may create an internal operational prompt; it does not reconnect a provider automatically. |
| Action | Record the approved reconnect reminder or route to manual review. |
| Destination | Integrations settings. |
| Retry Policy | Planned and bounded; no repeated alert loop. |
| Maximum Attempts | Planned. |
| Cooldown | Planned. |
| Timeout | Planned. |
| Idempotency Strategy | One active reconnect reminder per integration state interval. |
| Audit Fields | Rule, organization, integration status evidence, cooldown check, outcome. |
| Manual Override | Authorized operator may pause or dismiss only through an auditable approved control. |
| Rollback Behavior | Resolve the reminder when the trusted integration state changes. |
| Notifications | Operational visibility is planned; notification channel is not assumed. |
| Failure State | Manual Review or Dead Letter after bounded attempts. |
| Owner | Planned integration operations owner. |
| Status | Planned — illustrative only. |
| Future Expansion Notes | Provider reconnect flows require separate security and authorization design. |
