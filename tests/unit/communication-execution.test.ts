import { describe, expect, it } from "vitest";
import { CommunicationsExecutionEngine, type CommunicationExecutionAuditRecord, type CommunicationExecutionAuditSink, type CommunicationProvider, type CommunicationProviderResponse } from "@/lib/server/communication-execution";
import { InMemoryAutomationIdempotencyStore } from "@/lib/server/automation/idempotency";
import { FixedAutomationClock, IncrementingAutomationIdGenerator } from "@/lib/server/automation/testing";
import type { QueueCommunicationAction } from "@/lib/server/automation/appointment-rules";

const now = new Date("2026-07-28T12:00:00.000Z");

function action(overrides: Partial<QueueCommunicationAction> = {}): QueueCommunicationAction {
  return { type: "queue_communication", organizationId: "org-a", appointmentId: "appointment-1", customerId: "customer-1", purpose: "appointment_confirmation", sourceRuleId: "appointment.created", sourceRuleVersion: "1", sourceEventId: "event-1", recipientEmail: "customer@example.com", scheduling: { kind: "immediate" }, safeMetadata: { appointmentStatus: "awaiting_review" }, ...overrides };
}

class AuditSink implements CommunicationExecutionAuditSink {
  readonly records: CommunicationExecutionAuditRecord[] = [];
  async append(record: CommunicationExecutionAuditRecord) { this.records.push({ ...record }); }
}

function provider(id: string, response: CommunicationProviderResponse, channels: readonly string[] = ["email"]) {
  const requests: unknown[] = [];
  const value: CommunicationProvider = { id, supports: (channel) => channels.includes(channel), async send(request) { requests.push(request); return response; } };
  return { value, requests };
}

function engine(providers: readonly CommunicationProvider[], idempotency = new InMemoryAutomationIdempotencyStore(), audit = new AuditSink()) {
  return { audit, idempotency, value: new CommunicationsExecutionEngine({ providers, idempotency, audit, clock: new FixedAutomationClock(now), idGenerator: new IncrementingAutomationIdGenerator("request") }) };
}

describe("Communications Execution Engine", () => {
  it("converts provider-neutral intent to an email request and returns normalized delivery/timeline/feed output", async () => {
    const email = provider("test-email", { status: "delivered", safeSummary: "Communication delivered.", retryClassification: "non_retryable", sideEffectsMayHaveOccurred: true });
    const setup = engine([email.value]);
    const result = await setup.value.execute(action());

    expect(result).toMatchObject({ status: "delivered", provider: "test-email", retryClassification: "non_retryable", timelineEntry: { eventType: "confirmation_sent" }, operationsFeedEntry: { eventType: "communication_sent", severity: "success" } });
    expect(email.requests[0]).toMatchObject({ preferredChannel: "email", sourceRuleId: "appointment.created", sourceEventId: "event-1", correlationId: "event-1" });
    expect(setup.audit.records.map((record) => record.event)).toEqual(["execution_started", "provider_selected", "provider_result", "execution_completed"]);
  });

  it("selects a supporting provider without placing vendor logic in the action", async () => {
    const unsupported = provider("sms-only", { status: "delivered", safeSummary: "Unexpected.", retryClassification: "non_retryable", sideEffectsMayHaveOccurred: true }, ["sms"]);
    const email = provider("email", { status: "queued", safeSummary: "Communication queued.", retryClassification: "non_retryable", sideEffectsMayHaveOccurred: false });
    const result = await engine([unsupported.value, email.value]).value.execute(action());
    expect(result).toMatchObject({ status: "queued", provider: "email", operationsFeedEntry: { eventType: "communication_queued" } });
    expect(unsupported.requests).toHaveLength(0);
  });

  it("returns typed unsupported, failed, skipped, and cancelled outcomes without raw provider errors", async () => {
    await expect(engine([]).value.execute(action())).resolves.toMatchObject({ status: "unsupported", retryClassification: "unsupported" });
    const failed = provider("email", { status: "failed", safeSummary: "Communication delivery failed.", retryClassification: "retryable", sideEffectsMayHaveOccurred: false });
    await expect(engine([failed.value]).value.execute(action())).resolves.toMatchObject({ status: "failed", retryClassification: "retryable", operationsFeedEntry: { eventType: "communication_failed" } });
    const skipped = provider("email", { status: "skipped", safeSummary: "Communication skipped.", retryClassification: "non_retryable", sideEffectsMayHaveOccurred: false });
    await expect(engine([skipped.value]).value.execute(action())).resolves.toMatchObject({ status: "skipped", operationsFeedEntry: null });
    const cancelled = provider("email", { status: "cancelled", safeSummary: "Communication cancelled.", retryClassification: "cancelled", sideEffectsMayHaveOccurred: false });
    await expect(engine([cancelled.value]).value.execute(action())).resolves.toMatchObject({ status: "cancelled", retryClassification: "cancelled" });
  });

  it("contains an unavailable provider exception in a typed manual-review result", async () => {
    const unavailable: CommunicationProvider = { id: "email", supports: () => true, async send() { throw new Error("provider token: secret-value"); } };
    const result = await engine([unavailable]).value.execute(action());
    expect(result).toMatchObject({ status: "failed", retryClassification: "manual_review", error: { category: "unexpected" } });
    expect(JSON.stringify(result)).not.toContain("secret-value");
  });

  it("blocks duplicate requests before provider invocation and keeps organizations isolated", async () => {
    const email = provider("email", { status: "delivered", safeSummary: "Delivered.", retryClassification: "non_retryable", sideEffectsMayHaveOccurred: true });
    const idempotency = new InMemoryAutomationIdempotencyStore();
    const setup = engine([email.value], idempotency);
    await expect(setup.value.execute(action())).resolves.toMatchObject({ status: "delivered" });
    await expect(setup.value.execute(action())).resolves.toMatchObject({ status: "skipped", retryClassification: "duplicate" });
    await expect(setup.value.execute(action({ organizationId: "org-b", sourceEventId: "event-1" }))).resolves.toMatchObject({ status: "delivered" });
    expect(email.requests).toHaveLength(2);
  });

  it("fails validation safely when a tenant-bound action lacks trusted source metadata", async () => {
    const email = provider("email", { status: "delivered", safeSummary: "Delivered.", retryClassification: "non_retryable", sideEffectsMayHaveOccurred: true });
    const result = await engine([email.value]).value.execute(action({ sourceRuleId: undefined }));
    expect(result).toMatchObject({ status: "unsupported", error: { category: "validation", code: "invalid_request" } });
    expect(email.requests).toHaveLength(0);
  });
});
