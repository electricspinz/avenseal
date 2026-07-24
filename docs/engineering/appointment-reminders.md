# Appointment Reminders

Reminder scheduling is separate from delivery:

```text
Appointment → appointment_reminders → communication_messages → communications worker → provider
```

Scheduled reminders are created for future 24-hour, 2-hour, follow-up, and review-request events when their Communications settings are enabled. The internal `POST /api/internal/reminders/process` endpoint promotes due records into the existing communications queue; it uses the same bearer secret as the communications worker and never calls SMTP.

Only `scheduled`, `processing`, and `queued` reminders are active; the partial unique index permits one active `(appointment_id, template)` record while preserving historical `cancelled` and `completed` rows. Rescheduling cancels active reminders and their still-unsent linked communications, then creates replacement active records for the new time. Cancellation follows the same active-only rule and does not alter sent communications.

Promotion is atomic in `promote_appointment_reminder`: claim `scheduled → processing`, create or reuse the idempotent queue message, link it, then mark the reminder `queued`. A failed promotion rolls back so it can be retried safely. The `SECURITY DEFINER` function has a fixed `public` search path and execution is restricted to `service_role`; browser roles cannot promote arbitrary reminder IDs. Valid lifecycle transitions are `scheduled → processing`, `processing → queued|scheduled|cancelled`, `scheduled → cancelled`, `queued → cancelled|completed`. A communication already in `processing` is deliberately preserved on cancellation/rescheduling: the sender has already claimed it, so cancellation cannot safely retract it.

Run schedulers in this order: (1) `POST /api/internal/reminders/process` promotes due reminders, then (2) `POST /api/internal/communications/process` delivers queued communications. They remain separate to isolate scheduling from provider delivery. Future SMS support can consume the same reminder records with a different queue channel.
