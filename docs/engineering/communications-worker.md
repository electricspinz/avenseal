# Communications Worker

The worker processes queued and due retryable email records independently of booking and payment requests.

## Configuration

Set `COMMUNICATION_PROCESSOR_SECRET` to a strong server-only secret. Optional controls are `COMMUNICATION_PROCESSOR_BATCH_SIZE` (default `10`) and `COMMUNICATION_PROCESSING_TIMEOUT_MINUTES` (default `10`). Staging also requires `COMMUNICATION_SAFE_RECIPIENTS` before delivery is allowed.

## Invocation

GitHub Actions runs the protected processors every five minutes. The scheduler invokes the reminder processor first and only invokes this worker after that request succeeds. See [communications-scheduler.md](communications-scheduler.md) for deployment, secret rotation, failure handling, and manual-run instructions.

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
