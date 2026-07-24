# Communications Worker

The worker processes queued and due retryable email records independently of booking and payment requests.

Appointment reminders are promoted separately through `POST /api/internal/reminders/process` before this worker delivers them. Schedule reminder promotion before queue delivery. See [appointment reminders](appointment-reminders.md).

## Configuration

Set `COMMUNICATION_PROCESSOR_SECRET` to a strong server-only secret. Optional controls are `COMMUNICATION_PROCESSOR_BATCH_SIZE` (default `10`) and `COMMUNICATION_PROCESSING_TIMEOUT_MINUTES` (default `10`). Staging also requires `COMMUNICATION_SAFE_RECIPIENTS` before delivery is allowed.

## Invocation

An external scheduler may POST every 1–5 minutes:

```text
POST /api/internal/communications/process
Authorization: Bearer <COMMUNICATION_PROCESSOR_SECRET>
```

The response contains only batch counts: considered, claimed, sent, retryScheduled, permanentlyFailed, skipped, and claimConflicts.

## Safety and recovery

Rows are atomically claimed as `processing` before SMTP delivery, so overlapping workers cannot both send the same row. A row left processing beyond the timeout is reclaimed. Failed sends retry up to three attempts with a short backoff; terminal failures remain inspectable.

## Staging verification and rollback

Use a staging-safe recipient allowlist, enqueue a synthetic communication, invoke the endpoint with the bearer secret, and verify a safe count-only response and persisted status. To disable processing, remove the scheduler or unset the processor secret; queued records remain intact.
