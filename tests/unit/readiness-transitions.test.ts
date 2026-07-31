import { describe, expect, it } from "vitest";
import {
  classifyReadinessTransition,
  recordReadinessTransition,
  type ReadinessTransitionAuditRecord,
  type ReadinessTransitionAuditStore
} from "@/lib/server/readiness-transitions";
import type { AppointmentReadinessState } from "@/lib/server/appointment-readiness";

function readiness(state: AppointmentReadinessState) {
  return { state };
}

class InMemoryAuditStore implements ReadinessTransitionAuditStore {
  readonly records: ReadinessTransitionAuditRecord[] = [];

  async hasTransition(scope: Readonly<{ organizationId: string; appointmentId: string; discriminator: string }>) {
    return this.records.some((record) => record.organizationId === scope.organizationId
      && record.appointmentId === scope.appointmentId
      && record.metadata.readinessTransitionDiscriminator === scope.discriminator);
  }

  async append(record: ReadinessTransitionAuditRecord) {
    this.records.push(record);
  }
}

function input(previousState: AppointmentReadinessState, currentState: AppointmentReadinessState, transitionDiscriminator = "trusted-fact-1") {
  return {
    organizationId: "organization-1",
    appointmentId: "appointment-1",
    previousReadiness: readiness(previousState),
    currentReadiness: readiness(currentState),
    transitionDiscriminator
  };
}

describe("readiness transitions", () => {
  it("returns no_change and does not write an audit for the same canonical state", async () => {
    const store = new InMemoryAuditStore();
    await expect(recordReadinessTransition(input("waiting_for_review", "waiting_for_review"), store)).resolves.toMatchObject({ changed: false, meaningful: false, category: "no_change", auditRecorded: false });
    expect(store.records).toEqual([]);
  });

  it.each([
    ["payment progress", "waiting_for_payment", "waiting_for_documents", "payment_progress"],
    ["document upload progress", "waiting_for_documents", "waiting_for_review", "document_progress"],
    ["replacement resolved", "waiting_for_replacement", "waiting_for_review", "document_progress"],
    ["session available", "waiting_for_session", "ready_for_notary", "session_progress"],
    ["session starts", "ready_for_notary", "in_progress", "session_progress"],
    ["ready state achieved after coalesced progress", "waiting_for_review", "ready_for_notary", "readiness_achieved"],
    ["review regression", "waiting_for_review", "waiting_for_replacement", "document_regression"],
    ["session lost", "ready_for_notary", "waiting_for_session", "readiness_lost"],
    ["ready document regression", "ready_for_notary", "waiting_for_replacement", "document_regression"],
    ["active appointment blocked", "waiting_for_documents", "blocked", "blocked"],
    ["active appointment cancelled", "waiting_for_session", "cancelled", "terminal"],
    ["active appointment completed", "waiting_for_review", "completed", "terminal"],
    ["session completes appointment", "in_progress", "completed", "terminal"]
  ] as const)("classifies %s", (_label, previousState, currentState, category) => {
    expect(classifyReadinessTransition(readiness(previousState), readiness(currentState), "trusted-fact-1")).toMatchObject({ changed: true, meaningful: true, category });
  });

  it("writes one tenant- and appointment-scoped audit record for a meaningful transition", async () => {
    const store = new InMemoryAuditStore();
    const result = await recordReadinessTransition(input("waiting_for_session", "ready_for_notary"), store);

    expect(result).toMatchObject({ auditRecorded: true, category: "session_progress" });
    expect(store.records).toEqual([{
      organizationId: "organization-1",
      appointmentId: "appointment-1",
      action: "appointment.readiness_changed",
      metadata: {
        previousState: "waiting_for_session",
        currentState: "ready_for_notary",
        category: "session_progress",
        actorType: "system",
        readinessTransitionDiscriminator: "trusted-fact-1"
      }
    }]);
  });

  it("is idempotent for a repeated transition, while later and reverse transitions remain distinct", async () => {
    const store = new InMemoryAuditStore();
    await expect(recordReadinessTransition(input("waiting_for_session", "ready_for_notary", "session-v1"), store)).resolves.toMatchObject({ auditRecorded: true });
    await expect(recordReadinessTransition(input("waiting_for_session", "ready_for_notary", "session-v1"), store)).resolves.toMatchObject({ auditRecorded: false });
    await expect(recordReadinessTransition(input("ready_for_notary", "waiting_for_session", "session-v2"), store)).resolves.toMatchObject({ auditRecorded: true, category: "readiness_lost" });
    await expect(recordReadinessTransition(input("waiting_for_session", "ready_for_notary", "session-v3"), store)).resolves.toMatchObject({ auditRecorded: true });
    expect(store.records).toHaveLength(3);
  });

  it("keeps audit metadata limited to safe canonical facts", async () => {
    const store = new InMemoryAuditStore();
    await recordReadinessTransition(input("waiting_for_review", "waiting_for_replacement", "review-state-v2"), store);
    const serialized = JSON.stringify(store.records[0]);
    expect(serialized).not.toMatch(/token|https?:|storage|processor|payment_intent|review_notes|document_name/i);
    expect(store.records[0].metadata).toEqual({
      previousState: "waiting_for_review",
      currentState: "waiting_for_replacement",
      category: "document_regression",
      actorType: "system",
      readinessTransitionDiscriminator: "review-state-v2"
    });
  });
});
