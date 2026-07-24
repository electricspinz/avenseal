# Product Backlog

Priority: P0 highest, P1 planned, P2 later. Status: Proposed unless noted.

| ID | Title | Category | Problem | Customer value | Priority | Status | Dependencies | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| COM-001 | Scheduled communication queue processor | Communications | Jobs need timed processing | Reliable updates | P0 | Active | PR #11 | Five-minute GitHub Actions workflow added; production secrets and deployment activation remain required |
| CAL-001 | Scheduled Calendar retry processor | Calendars | Retries are manual | Fewer missed syncs | P1 | Proposed | Calendar mappings | Protected endpoint exists |
| POR-001 | Customer rescheduling | Customer portal | Changes require staff | Self-service | P1 | Proposed | Secure portal | Policy required |
| POR-002 | Customer cancellation | Customer portal | Cancellations require staff | Self-service | P1 | Proposed | Secure portal | Policy required |
| BKG-001 | Secure intake forms | Customer booking | Intake is fixed | Better preparation | P1 | Proposed | Services | |
| COM-002 | Email delivery analytics | Communications | Delivery health is opaque | Trustworthy communications | P1 | Proposed | Queue/events | |
| INT-001 | SMS provider | Integrations | Email is not always timely | Channel choice | P2 | Proposed | Provider abstraction | |
| INT-002 | Outlook Calendar | Integrations | Google-only calendar support | More provider choice | P2 | Proposed | Calendar boundary | |
| PAY-001 | Deposits and partial payments | Payments | Full payment is inflexible | Flexible billing | P1 | Proposed | Stripe | |
| PAY-002 | Refunds, receipts, and reconciliation | Payments | Operations are incomplete | Billing trust | P1 | Proposed | Webhooks | |
| OPS-001 | No-show management and admin schedule view | Administration | Schedule work is fragmented | Better operations | P1 | Proposed | Appointment lifecycle | |
| OPS-002 | Staff scheduling | Administration | Solo scheduling model | Team operations | P2 | Proposed | Roles/resources | |
| ANA-001 | Utilization and service analytics | Analytics | Operations lack insight | Better decisions | P2 | Proposed | Events | |
| AI-001 | Booking assistant and business knowledge base | AI | Support is manual | Guided booking | P2 | Proposed | Knowledge model | Escalate to people |
| SEC-001 | Audit log improvements and rate-limit review | Security | Controls need review | Safer operations | P1 | Proposed | Existing boundaries | |
| SEC-002 | Accessibility review | Security | UI needs formal audit | Inclusive access | P1 | Proposed | E2E/UI | |
| OPS-003 | Observability, data retention, export, and deletion workflow | Platform operations | Production procedures are incomplete | Reliable, accountable service | P1 | Proposed | Policy decisions | |
