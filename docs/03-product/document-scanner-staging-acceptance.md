# Document Scanner Staging Acceptance Record

**Status:** No-go — pending approval and staging verification.  
**Scope:** B2D-D preparation and evidence record. This document does not authorize production scanning.

## Evidence rules

Record only safe, aggregate evidence. Do not include credentials, URLs, raw provider responses, request IDs, storage keys, document/job/appointment/organization IDs, customer data, raw logs, filenames, tokens, or EICAR content.

## Baseline record

| Field | Result |
| --- | --- |
| Baseline date | 2026-08-01 |
| Branch / commit | `feature/document-scanner-staging-acceptance` / `382010e` at baseline verification |
| Node / pnpm | `v22.23.1` / `11.13.1` |
| Working tree before B2D-D preparation | clean |
| Unit suite | passed — 105 files, 585 tests |
| Typecheck | passed after regenerating stale local `.next` output |
| Lint | passed |
| Build | passed |
| Diff check | passed |

## Approval and environment readiness

The mandatory vendor/legal approval register and GitHub staging environment record are maintained in the [staging runbook](document-scanner-staging-runbook.md#vendor-legal-and-privacy-approval-register). At this record’s creation, every mandatory vendor/legal item and every staging environment variable is **pending or unverified**. No pending item is treated as approved.

## Execution evidence

| Check | Result | Safe evidence | Next action |
| --- | --- | --- | --- |
| Configuration dry run | blocked | `staging_environment_required`; no network request | Configure approved staging environment, then rerun dry run. |
| Adapter-only clean check | not run | Requires successful dry run and approved staging credentials | Run once with staging credentials; capture only normalized result and duration bucket. |
| Optional EICAR check | approval required | Vendor and Operations approval absent | Record approved or deferred decision before any invocation. |
| End-to-end clean fixture | deferred | No reviewed, narrowly scoped synthetic fixture boundary | Approve fixture and cleanup design, then execute only in staging. |
| End-to-end blocked fixture | deferred | EICAR application-storage approval absent | Remains deferred unless separately approved. |
| GitHub Actions scheduler | configured in source; not executed | Five-minute staging workflow, batch size five, bearer-only/no-cookie contract covered by unit tests | Configure GitHub `staging` environment, manually invoke once, capture HTTP status only. |
| Owner/admin metrics | implemented; not executed in staging | Tenant-scoped aggregate/no-store contract covered by unit tests | Verify with active staging owner/admin after fixture execution. |
| Kill switch | implemented; not executed in staging | Disabled scanner returns safe 503 before job claim, covered by route tests | Exercise with staging fixture and restore configuration. |
| Rollback and recovery | deferred | Requires a reviewed synthetic job and enabled staging scheduler | Disable scheduler then scanner, preserve queue/quarantine, re-enable, and observe replay safely. |
| Cleanup | deferred | No synthetic fixture has been created | Prove cleanup is idempotent and fixture-scoped before accepting the clean path. |

## Required staging evidence after approvals

1. Confirm all required vendor/legal rows are `approved` and all staging configuration names are marked configured by a named verifier.
2. Run the verifier dry run before any network request.
3. Run the adapter-only clean check and record timestamp, normalized `clean` result, one-request observation, and duration bucket only.
4. Run EICAR only if the documented approval conditions are satisfied; otherwise retain `approval_required`.
5. Execute the reviewed clean fixture, then verify aggregate metrics, scheduler behavior, kill switch, rollback/recovery, replay idempotency, and fixture-only cleanup.
6. Retain the minimum safe evidence named in the runbook, then obtain Operations signoff.

## Operations signoff

| Role | Status | Name | Date | Notes |
| --- | --- | --- | --- | --- |
| Vendor/legal reviewer | pending | — | — | Mandatory approval register incomplete. |
| Privacy/security reviewer | pending | — | — | Mandatory approval register incomplete. |
| Staging operations owner | pending | — | — | Staging environment and live checks not verified. |
| Incident/rollback owner | pending | — | — | Fixture recovery exercise not completed. |

## Production recommendation

**NO-GO — pending approval/verification.** Production scanning must remain disabled. The go/no-go rule requires every mandatory vendor/legal item approved, staging configuration present, successful dry-run and clean adapter checks, accepted end-to-end clean validation, scheduler and metrics verification, kill-switch and rollback exercises, successful fixture-scoped cleanup, Operations signoff, no unresolved critical defect, and fresh Node 22 validation.
