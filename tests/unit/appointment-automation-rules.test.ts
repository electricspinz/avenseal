import { describe, expect, it } from "vitest";
import { AppointmentCancelledRule, AppointmentConfirmedRule, AppointmentCreatedRule, AppointmentFollowUpDueRule, AppointmentReminderDueRule, createAppointmentAutomationRegistry, type AppointmentAutomationActions, type AppointmentAutomationContext, type AppointmentLifecycleEvent } from "@/lib/server/automation/appointment-rules";
import { DefaultAutomationExecutor } from "@/lib/server/automation/executor";
import { InMemoryAutomationIdempotencyStore } from "@/lib/server/automation/idempotency";
import { FixedAutomationAuthorizationProvider, FixedAutomationClock, FixedAutomationControlProvider, IncrementingAutomationIdGenerator, InMemoryAutomationAuditSink } from "@/lib/server/automation/testing";
import type { AutomationRule } from "@/lib/server/automation/types";

const now = "2026-07-28T12:00:00.000Z";

function event(overrides: Partial<AppointmentLifecycleEvent> = {}): AppointmentLifecycleEvent {
  return {
    type: "appointment_created",
    eventId: "event-1",
    organizationId: "org-a",
    appointmentId: "appointment-1",
    customerId: "customer-1",
    customerOrganizationId: "org-a",
    customerEmail: "customer@example.com",
    occurredAt: now,
    appointmentStatus: "awaiting_review",
    appointmentStartsAt: "2026-07-29T12:00:00.000Z",
    ...overrides
  } as AppointmentLifecycleEvent;
}

function context(input: AppointmentLifecycleEvent): AppointmentAutomationContext {
  return { organizationId: input.organizationId, logicalExecutionId: input.eventId, evidence: [], event: input };
}

async function execute(rule: AutomationRule<AppointmentAutomationContext, AppointmentAutomationActions>, input: AppointmentLifecycleEvent) {
  return rule.execute({ executionId: "execution-1", organizationId: input.organizationId, context: context(input), actor: { kind: "system", identifier: "automation-engine" } });
}

async function evaluate(rule: AutomationRule<AppointmentAutomationContext, AppointmentAutomationActions>, input: AppointmentLifecycleEvent) {
  return rule.evaluate(context(input));
}

describe("Appointment automation rules", () => {
  it("describes the stable appointment-created action set for a valid future appointment", async () => {
    const rule = new AppointmentCreatedRule();
    const result = await execute(rule, event());

    expect(rule.metadata).toMatchObject({ id: "appointment.created", version: "1" });
    expect(result).toMatchObject({ kind: "succeeded", data: { actions: [{ type: "queue_communication", purpose: "appointment_confirmation" }, { type: "create_timeline_entry", eventType: "appointment_created" }, { type: "create_operations_feed_entry", eventType: "appointment_created" }] } });
  });

  it.each([
    ["missing customer", event({ customerId: null, customerOrganizationId: null })],
    ["past appointment", event({ appointmentStartsAt: "2026-07-27T12:00:00.000Z" })],
    ["cancelled appointment", event({ appointmentStatus: "cancelled" })]
  ])("rejects appointment-created events with %s", async (_label, input) => {
    await expect(evaluate(new AppointmentCreatedRule(), input)).resolves.toMatchObject({ kind: "ineligible" });
  });

  it("describes confirmation timeline/feed actions and avoids a redundant status action", async () => {
    const rule = new AppointmentConfirmedRule();
    const pending = event({ type: "appointment_confirmed", confirmationOrganizationId: "org-a", appointmentStatus: "awaiting_payment" });
    const confirmed = event({ type: "appointment_confirmed", confirmationOrganizationId: "org-a", appointmentStatus: "confirmed" });

    const pendingResult = await execute(rule, pending);
    expect(pendingResult).toMatchObject({ kind: "succeeded" });
    if (pendingResult.kind === "succeeded") expect(pendingResult.data.actions).toEqual(expect.arrayContaining([expect.objectContaining({ type: "update_appointment_status", status: "confirmed" }), expect.objectContaining({ type: "create_timeline_entry", eventType: "appointment_confirmed" })]));
    const result = await execute(rule, confirmed);
    expect(result.kind).toBe("succeeded");
    if (result.kind === "succeeded") expect(result.data.actions.some((action) => action.type === "update_appointment_status")).toBe(false);
    await expect(evaluate(rule, event({ type: "appointment_confirmed", confirmationOrganizationId: "org-a", appointmentStatus: "cancelled" }))).resolves.toMatchObject({ kind: "ineligible" });
  });

  it("describes cancellation actions and safely omits a communication without a recipient", async () => {
    const rule = new AppointmentCancelledRule();
    const valid = event({ type: "appointment_cancelled", cancellationOrganizationId: "org-a", appointmentStatus: "cancelled" });
    const noRecipient = event({ type: "appointment_cancelled", cancellationOrganizationId: "org-a", appointmentStatus: "cancelled", customerEmail: null });

    const validResult = await execute(rule, valid);
    expect(validResult).toMatchObject({ kind: "succeeded" });
    if (validResult.kind === "succeeded") expect(validResult.data.actions).toEqual(expect.arrayContaining([expect.objectContaining({ type: "queue_communication", purpose: "appointment_cancellation" }), expect.objectContaining({ type: "create_timeline_entry", eventType: "appointment_cancelled" })]));
    const result = await execute(rule, noRecipient);
    expect(result.kind).toBe("succeeded");
    if (result.kind === "succeeded") expect(result.data.actions.some((action) => action.type === "queue_communication")).toBe(false);
  });

  it("describes reminder actions only for active future appointments without an existing reminder", async () => {
    const rule = new AppointmentReminderDueRule();
    const valid = event({ type: "reminder_window_reached", reminderWindow: "24h", reminderState: "not_queued" });
    await expect(execute(rule, valid)).resolves.toMatchObject({ kind: "succeeded", data: { actions: [{ type: "queue_communication", purpose: "appointment_reminder", safeMetadata: { reminderWindow: "24h" } }, { type: "create_timeline_entry", eventType: "reminder_queued" }] } });
    for (const input of [event({ type: "reminder_window_reached", reminderWindow: "24h", reminderState: "not_queued", appointmentStatus: "cancelled" }), event({ type: "reminder_window_reached", reminderWindow: "24h", reminderState: "not_queued", appointmentStatus: "completed" }), event({ type: "reminder_window_reached", reminderWindow: "24h", reminderState: "queued" }), event({ type: "reminder_window_reached", reminderWindow: "24h", reminderState: "sent" })]) {
      await expect(evaluate(rule, input)).resolves.toMatchObject({ kind: "ineligible" });
    }
  });

  it("represents the 24-hour follow-up delay as metadata without scheduling work", async () => {
    const rule = new AppointmentFollowUpDueRule();
    const valid = event({ type: "appointment_completed", appointmentStatus: "completed", completedAt: now, followUpState: "not_queued", reviewRequestState: "not_queued", reviewRequestAllowed: true });
    const result = await execute(rule, valid);
    expect(result).toMatchObject({ kind: "succeeded" });
    if (result.kind === "succeeded") {
      expect(result.data.actions).toEqual(expect.arrayContaining([expect.objectContaining({ type: "queue_communication", purpose: "appointment_follow_up", scheduling: { kind: "delayed", notBefore: "2026-07-29T12:00:00.000Z" } }), expect.objectContaining({ type: "queue_communication", purpose: "review_request" })]));
    }
    for (const input of [event({ type: "appointment_completed", appointmentStatus: "awaiting_review", completedAt: now, followUpState: "not_queued", reviewRequestState: "not_queued", reviewRequestAllowed: false }), event({ type: "appointment_completed", appointmentStatus: "completed", completedAt: now, followUpState: "queued", reviewRequestState: "not_queued", reviewRequestAllowed: false })]) {
      await expect(evaluate(rule, input)).resolves.toMatchObject({ kind: "ineligible" });
    }
  });

  it("registers all five rules and executes created events through the existing executor with deterministic idempotency", async () => {
    const registry = createAppointmentAutomationRegistry();
    expect(["appointment.created", "appointment.confirmed", "appointment.cancelled", "appointment.reminder-due", "appointment.follow-up-due"].every((id) => registry.get(id))).toBe(true);
    const idempotency = new InMemoryAutomationIdempotencyStore();
    const executor = new DefaultAutomationExecutor({ registry, controls: new FixedAutomationControlProvider({ state: "enabled", reason: "Enabled." }), authorization: new FixedAutomationAuthorizationProvider({ kind: "trusted", organizationId: "org-a" }), audit: new InMemoryAutomationAuditSink(), clock: new FixedAutomationClock(new Date(now)), idGenerator: new IncrementingAutomationIdGenerator(), idempotency });
    const input = event();
    const request = { ruleId: "appointment.created", context: context(input), actor: { kind: "system" as const, identifier: "automation-engine" as const } };

    await expect(executor.execute(request)).resolves.toMatchObject({ kind: "succeeded", retry: "non_retryable" });
    await expect(executor.execute(request)).resolves.toMatchObject({ kind: "skipped", reason: { code: "duplicate_execution" }, retry: "duplicate" });
  });

  it("prevents duplicate cancellation execution, isolates organizations, and enforces confirmation approval", async () => {
    const registry = createAppointmentAutomationRegistry();
    const idempotency = new InMemoryAutomationIdempotencyStore();
    const makeExecutor = (organizationId: string) => new DefaultAutomationExecutor({ registry, controls: new FixedAutomationControlProvider({ state: "enabled", reason: "Enabled." }), authorization: new FixedAutomationAuthorizationProvider({ kind: "trusted", organizationId }), audit: new InMemoryAutomationAuditSink(), clock: new FixedAutomationClock(new Date(now)), idGenerator: new IncrementingAutomationIdGenerator(), idempotency });
    const cancellation = event({ type: "appointment_cancelled", eventId: "cancel-event", cancellationOrganizationId: "org-a", appointmentStatus: "cancelled" });
    const cancellationRequest = { ruleId: "appointment.cancelled", context: context(cancellation), actor: { kind: "system" as const, identifier: "automation-engine" as const } };
    const orgA = makeExecutor("org-a");

    await expect(orgA.execute(cancellationRequest)).resolves.toMatchObject({ kind: "succeeded" });
    await expect(orgA.execute(cancellationRequest)).resolves.toMatchObject({ kind: "skipped", reason: { code: "duplicate_execution" } });

    const otherTenant = event({ organizationId: "org-b", customerOrganizationId: "org-b", appointmentId: "appointment-1", eventId: "cancel-event", type: "appointment_created" });
    await expect(makeExecutor("org-b").execute({ ruleId: "appointment.created", context: context(otherTenant), actor: { kind: "system", identifier: "automation-engine" } })).resolves.toMatchObject({ kind: "succeeded" });

    const confirmed = event({ type: "appointment_confirmed", eventId: "confirm-event", confirmationOrganizationId: "org-a", appointmentStatus: "awaiting_payment" });
    const confirmationRequest = { ruleId: "appointment.confirmed", context: context(confirmed), actor: { kind: "system" as const, identifier: "automation-engine" as const } };
    await expect(orgA.execute(confirmationRequest)).resolves.toMatchObject({ kind: "skipped", reason: { code: "approval_required" } });
    await expect(orgA.execute({ ...confirmationRequest, approval: { id: "approval", organizationId: "org-a", ruleId: "appointment.confirmed", logicalExecutionId: "confirm-event", expiresAt: "2026-07-28T13:00:00.000Z" } })).resolves.toMatchObject({ kind: "succeeded" });
  });

  it("prevents cross-tenant events from becoming actions even when appointment IDs match", async () => {
    const rule = new AppointmentCreatedRule();
    const mismatched = event({ organizationId: "org-a", customerOrganizationId: "org-b" });
    await expect(evaluate(rule, mismatched)).resolves.toMatchObject({ kind: "invalid_context", reasons: [{ code: "tenant_mismatch" }] });
    const otherTenant = event({ organizationId: "org-b", appointmentId: "appointment-1", customerOrganizationId: "org-b", eventId: "event-2" });
    await expect(execute(rule, otherTenant)).resolves.toMatchObject({ kind: "succeeded" });
  });
});
