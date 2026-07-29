import { describe, expect, it } from "vitest";
import { InMemoryTimelineStore, TimelineRecorder, timelineFromAppointmentAction, timelineFromCommunication } from "@/lib/server/customer-timeline";
import { FixedAutomationClock } from "@/lib/server/automation/testing";

const clock = new FixedAutomationClock(new Date("2026-07-28T12:00:00.000Z"));
function draft(overrides: Record<string, unknown> = {}) { return { organizationId: "org-a", customerId: "customer", appointmentId: "appointment", category: "appointment" as const, type: "appointment_created" as const, outcome: "informational" as const, title: "Appointment Created", safeSummary: "Appointment created.", occurredAt: "2026-07-28T10:00:00.000Z", actor: { kind: "system" as const, actorId: null, safeDisplayName: null }, source: "appointment_service" as const, correlationId: "event", causationId: null, sourceEventId: "event", automationExecutionId: null, automationRuleId: null, automationRuleVersion: null, communicationRequestId: null, paymentId: null, documentId: null, metadata: {}, ...overrides }; }

describe("Customer Timeline", () => {
  it("records immutable deterministic customer and appointment events with injected recorded time", async () => {
    const recorder = new TimelineRecorder(new InMemoryTimelineStore(), clock);
    const first = await recorder.record(draft());
    const duplicate = await recorder.record(draft());
    expect(first).toMatchObject({ kind: "recorded", event: { recordedAt: "2026-07-28T12:00:00.000Z" } });
    expect(duplicate.kind).toBe("duplicate");
    expect(first.event?.id).toBe(duplicate.event?.id);
  });

  it("isolates organizations and filters ordered customer/appointment chronology", async () => {
    const store = new InMemoryTimelineStore(); const recorder = new TimelineRecorder(store, clock);
    await recorder.record(draft({ sourceEventId: "older", occurredAt: "2026-07-28T09:00:00.000Z" }));
    await recorder.record(draft({ sourceEventId: "newer", occurredAt: "2026-07-28T11:00:00.000Z", outcome: "succeeded", category: "communication", type: "communication_delivered" }));
    await recorder.record(draft({ organizationId: "org-b", sourceEventId: "other" }));
    const events = await recorder.listByCustomer({ organizationId: "org-a", customerId: "customer", limit: 1 });
    expect(events).toHaveLength(1); expect(events[0].sourceEventId).toBe("newer");
    await expect(recorder.listByAppointment({ organizationId: "org-b", appointmentId: "appointment" })).resolves.toHaveLength(1);
    await expect(recorder.listByCustomer({ organizationId: "org-a", customerId: "customer", category: "communication", outcome: "succeeded" })).resolves.toHaveLength(1);
  });

  it("rejects unsafe drafts and maps automation/communications without copying audit or provider payloads", async () => {
    const recorder = new TimelineRecorder(new InMemoryTimelineStore(), clock);
    await expect(recorder.record(draft({ metadata: { providerToken: "secret" } }))).resolves.toMatchObject({ kind: "rejected" });
    const automation = timelineFromAppointmentAction({ type: "create_timeline_entry", organizationId: "org-a", appointmentId: "appointment", customerId: "customer", eventType: "reminder_queued", sourceEventId: "event", safeSummary: "Reminder queued." }, "appointment.reminder-due", "1", "2026-07-28T10:00:00.000Z");
    await expect(recorder.record(automation)).resolves.toMatchObject({ kind: "recorded", event: { type: "reminder_queued", source: "automation_engine" } });
    const communication = timelineFromCommunication({ request: { requestId: "request", organizationId: "org-a", customerId: "customer", appointmentId: "appointment", purpose: "appointment_reminder", preferredChannel: "email", fallbackChannels: [], locale: "en-US", safeMetadata: { appointmentStatus: "confirmed" }, sourceRuleId: "appointment.reminder-due", sourceRuleVersion: "1", sourceEventId: "event", correlationId: "event", recipient: "customer@example.com" }, status: "failed", provider: "provider", occurredAt: "2026-07-28T11:00:00.000Z", retryClassification: "manual_review", safeSummary: "Delivery requires review.", correlationId: "event", error: null, timelineEntry: null, operationsFeedEntry: null });
    await expect(recorder.record(communication)).resolves.toMatchObject({ kind: "recorded", event: { type: "communication_failed", outcome: "requires_attention" } });
  });
});
