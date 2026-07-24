# Communications Scheduler

## Architecture and order

GitHub Actions runs `.github/workflows/process-communications.yml` every five minutes and can also be started manually with **Run workflow**. A single scheduler run performs these requests serially:

```text
Validate configuration
        ↓
POST /api/internal/reminders/process
        ↓ only after a successful response
POST /api/internal/communications/process
        ↓
Safe status-only completion log
```

The reminder endpoint promotes due appointment reminders into `communication_messages`. The communications endpoint claims and sends queued messages. Conditional claims in the application remain the source of truth for message-level concurrency; the workflow-level concurrency group merely prevents avoidable overlapping scheduler runs.

## Required configuration

Configure these GitHub Actions repository secrets:

| Secret | Value |
| --- | --- |
| `AVENSEAL_APP_URL` | The deployed HTTPS application origin, with or without a trailing slash. |
| `COMMUNICATION_PROCESSOR_SECRET` | A strong random processor secret. |

Generate the processor secret with:

```bash
openssl rand -hex 32
```

Set the exact same `COMMUNICATION_PROCESSOR_SECRET` in both the deployed Avenseal application environment and the GitHub repository Actions secret. `AVENSEAL_APP_URL` must begin with `https://`; the workflow strips one accidental trailing slash before building endpoint URLs. The scheduled production path never allows `http://localhost`.

## Request and retry behavior

Each request is a `POST` authenticated with `Authorization: Bearer <processor secret>`. The workflow does not add an `Origin` header. It uses a 10-second connection timeout and 60-second total timeout.

Requests retry at most twice after the initial attempt only for connection/network failures (`HTTP 000`) and HTTP 5xx responses. Authentication failures, validation failures, and other 4xx responses fail immediately. A failed reminder request stops the job before the communications request runs. A failed communications request marks the workflow run failed after reminders have already been promoted; the next scheduled run can continue queue processing safely.

The workflow has a ten-minute job timeout and the `avenseal-communications-scheduler` concurrency group with `cancel-in-progress: false`.

## Logging and verification

Workflow logs contain only endpoint names, success/failure, and HTTP status codes. They never print request headers, secrets, customer addresses, message content, HTML, or provider errors; HTTP response bodies are discarded.

To verify a deployment:

1. Confirm the repository secrets and deployed application environment contain matching processor secrets.
2. Run **Actions → Process Avenseal communications → Run workflow**.
3. Confirm the reminders step succeeds before the communications step and both log a 2xx status.
4. Inspect the application’s safe worker counts and persisted queue/reminder states through authorized operational tooling.

## Operations

To rotate the processor secret, generate a new value, deploy it to the application environment, then update the GitHub Actions secret immediately afterward. Run the workflow manually to confirm the new value. Keep the rotation window short because the endpoints accept one active secret.

To temporarily disable scheduling, disable the **Process Avenseal communications** workflow in GitHub Actions. Queued messages and due reminders remain stored; re-enable the workflow to resume processing. To change cadence, edit the workflow’s cron expression; GitHub-hosted scheduled workflows have a five-minute minimum practical cadence and may be delayed during periods of high Actions load.

GitHub Actions is the initial operational scheduler. It does not guarantee exact execution time, is dependent on GitHub availability, and does not replace database-level conditional claims, retry handling, or operational monitoring.
