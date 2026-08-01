# Document Scanner Staging Runbook

## Purpose

This runbook verifies the Cloudmersive basic adapter with controlled staging fixtures only. It never authorizes production scanning, customer-file use, or a public endpoint.

## Prerequisites

- Written vendor/privacy/DPA, retention, residency, and EICAR approval.
- A confirmed `staging` or `preview` environment; never production.
- Scanner variables configured in deployment secrets, not source control.
- Operations approval and an incident owner.

## Required variables

Set names only: `DOCUMENT_SCANNER_ENABLED=true`, `DOCUMENT_SCANNER_PROVIDER=cloudmersive`, `DOCUMENT_SCANNER_API_KEY`, `DOCUMENT_SCANNER_BASE_URL`, `DOCUMENT_SCANNER_TIMEOUT_MS`, `DOCUMENT_SCANNER_STAGING_VERIFY=true`, and `DOCUMENT_SCAN_WORKER_SECRET`. Set `APP_ENV=staging` or `VERCEL_ENV=preview`.

The staging scheduler additionally uses GitHub Actions environment-scoped secrets named `AVENSEAL_STAGING_APP_URL` and `DOCUMENT_SCAN_WORKER_SECRET`. These are deployment configuration, never source-controlled values. No production scheduler or production environment value is created by this runbook.

## Procedure

1. Run `pnpm verify:document-scanner:staging -- --dry-run`. It makes no network, storage, or database calls.
2. Run `pnpm verify:document-scanner:staging` to send a generated minimal clean PDF only. Expected output is an aggregate JSON summary with `cleanCheck: "passed"`.
3. Do not enable EICAR until the vendor contract and staging policy explicitly approve it. With approval, set `DOCUMENT_SCANNER_EICAR_APPROVED=true` for one controlled run; expect `infectedCheck: "passed"`. The runner never prints the fixture or a provider detection.
4. End-to-end worker verification is deferred: no safe dedicated fixture-creation API exists yet. Perform it only after an approved staging fixture and cleanup procedure are reviewed.

## Expected states and cleanup

Adapter-only mode creates no Supabase rows or storage objects. Future end-to-end verification must prove clean/active download eligibility, infected/quarantined blocking, job terminal states, and complete removal of synthetic records and quarantine objects.

## Staging scheduler

The existing internal-worker convention is GitHub Actions, not Vercel Cron. The staging workflow at `.github/workflows/process-document-scans-staging.yml` runs every five minutes and may be started manually after the GitHub **staging** environment has been approved and supplied with its secrets.

Each run makes one server-to-server `POST` to the protected document-scan processor with `Authorization: Bearer <worker secret>`, no `Origin` header, no cookies, HTTPS only, and `batchSize=5`. The endpoint independently bounds all batch sizes to 1–20. The initial cadence therefore attempts no more than 60 claimed jobs per hour before worker retry, replay, and lease rules apply. It is deliberately below sub-minute polling and below the five-minute lease duration.

The worker’s conditional claims remain the concurrency authority. The GitHub Actions concurrency group avoids overlapping scheduler invocations without cancelling an in-flight run. Retry-scheduled jobs are eligible only when due; stale claims recover through the existing lease-expiry claim logic. GitHub Actions does not guarantee exact cron timing, so Operations should treat it as a conservative staging trigger, not an availability guarantee.

To set up staging:

1. Configure the scanner and worker-secret variable names in the staging application environment.
2. Set the matching `DOCUMENT_SCAN_WORKER_SECRET` and the HTTPS-only `AVENSEAL_STAGING_APP_URL` in the GitHub **staging** environment.
3. Approve the GitHub environment only after vendor, privacy, and Operations gates are complete.
4. Start one manual workflow run and inspect only its endpoint status and the authorized aggregate metrics surface.

## Health checks and alert thresholds

Owners and admins can retrieve tenant-scoped, aggregate-only metrics from `GET /api/admin/document-scans/metrics`. The handler requires the current signed session and active owner/admin membership, scopes the repository call to the trusted organization, returns `Cache-Control: no-store`, and never returns jobs or documents.

| Metric | Staging threshold | First response |
| --- | --- | --- |
| `oldestPendingAt` | older than 20 minutes | Confirm scheduler activity and worker authentication; inspect safe aggregate counts. |
| `retryScheduled` | more than 10 jobs or no decline within 30 minutes | Pause further scheduler runs; investigate approved safe failure categories. |
| `claimed` | nonzero for more than 10 minutes | Wait for the five-minute lease recovery window, then confirm a later run reclaims safely. |
| `failed` | any nonzero count | Disable scheduling, preserve queue state, and open an Operations incident. |
| `lastSuccessfulScanAt` | absent after enablement or older than 30 minutes while pending work exists | Check scheduler status, configuration, and vendor availability. |
| `averageScanDurationMs` | over 45 seconds for three consecutive observations | Reduce batch pressure by disabling the scheduler and investigate provider capacity. |
| provider rate limiting | any approved `provider_rate_limited` evidence | Disable scheduler, wait for vendor recovery, and do not increase cadence. |
| worker authentication failures | any scheduler 401/403 | Disable scheduler, rotate the worker secret, and verify the staging URL. |

The current persisted metrics intentionally do not expose a breakdown of safe failure categories. Operations may use approved server-side logs or the worker’s aggregate result to classify only `configuration`, `authentication`, `rate_limited`, `provider_unavailable`, `timeout`, `invalid_response`, or `unexpected` conditions. Do not add raw vendor response text, request IDs, document identifiers, or customer details to health reporting.

## Disable, rollback, and recovery

The quickest kill switch is to set `DOCUMENT_SCANNER_ENABLED=false` in the staging application environment and redeploy; the protected worker validates configuration before claiming any job and fails closed. Also disable the **Process staging document scans** GitHub Actions workflow to stop future invocations. If compromise is suspected, revoke or rotate the scanner API key and the worker secret.

Disabling does not mark pending files clean, activate quarantined files, delete scan jobs, or change document review state. Pending, failed, blocked, and quarantined files remain unavailable for download. Previously verified `clean` + `active` files remain downloadable under the existing authorization rules. Queue records are retained so Operations can recover after the scanner is safely re-enabled.

To recover, resolve and record the incident, configure the approved staging scanner values, rotate secrets if needed, run the adapter dry run, enable the application scanner setting, start one manual scheduler execution, and confirm aggregate health before re-enabling the schedule. Do not bulk-modify jobs or bypass quarantine to clear a backlog.

## Stop, rollback, and evidence

Stop immediately for unexpected provider behavior, non-aggregate output, any customer-data indication, failed health threshold, scheduler authentication failure, or a production-environment refusal bypass attempt. Disable scanning with `DOCUMENT_SCANNER_ENABLED=false`, then disable the staging scheduler; do not add a force override. Retain only command time, environment classification, safe aggregate summary, scheduler HTTP status, threshold breached, remediation time, and Operations signoff. Never retain credentials, request/response payloads, EICAR text, IDs, keys, URLs, filenames, detections, document/job/appointment/organization identifiers, or raw provider errors.

## Operations signoff

- [ ] Vendor and legal approval recorded.
- [ ] Dry run passed in staging/preview.
- [ ] Clean adapter check passed.
- [ ] EICAR decision recorded.
- [ ] End-to-end decision and cleanup owner recorded.
- [ ] Staging GitHub environment approval, HTTPS URL, and matching worker secret configured.
- [ ] Manual scheduler run returned a safe success status.
- [ ] Owner/admin aggregate metrics access verified.
- [ ] Threshold owner and alert destination recorded without credentials in this repository.
- [ ] Kill switch and recovery owner approved before deployment enablement.
- [ ] Monitoring and incident ownership approved before deployment enablement.
