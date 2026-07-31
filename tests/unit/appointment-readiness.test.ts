import { describe, expect, it } from "vitest";
import { calculateAppointmentReadiness, type AppointmentReadinessInput } from "@/lib/server/appointment-readiness";

const approvedDocument = { organizationId: "org-1", appointmentId: "appointment-1", status: "approved" as const, deletedAt: null };
const scheduledSession = { organizationId: "org-1", appointmentId: "appointment-1", status: "scheduled" as const };

function readiness(input: Partial<AppointmentReadinessInput> = {}) {
  return calculateAppointmentReadiness({
    organizationId: "org-1",
    appointmentId: "appointment-1",
    appointmentStatus: "confirmed",
    paymentStatus: "paid",
    documents: [approvedDocument],
    externalSession: scheduledSession,
    ...input
  });
}

describe("Appointment Readiness Domain", () => {
  it("defaults to waiting_for_documents when no active documents exist", () => {
    expect(readiness({ documents: [] })).toMatchObject({
      state: "waiting_for_documents",
      blockers: ["documents_required"],
      summary: "Documents are required before this appointment can proceed."
    });
  });

  it("allows the future durable documents-not-required setting to bypass only document gating", () => {
    expect(readiness({ documents: [], documentsRequired: false })).toMatchObject({ state: "ready_for_notary", blockers: [] });
  });

  it("orders terminal and appointment holds ahead of payment and readiness dependencies", () => {
    expect(readiness({ appointmentStatus: "cancelled", paymentStatus: null, documents: [] })).toMatchObject({ state: "cancelled", blockers: [] });
    expect(readiness({ appointmentStatus: "completed", paymentStatus: null, documents: [] })).toMatchObject({ state: "completed", blockers: [] });
    expect(readiness({ appointmentStatus: "awaiting_review", paymentStatus: null, documents: [] })).toMatchObject({ state: "blocked", blockers: ["appointment_requires_review"] });
    expect(readiness({ appointmentStatus: "clarification_needed" })).toMatchObject({ state: "blocked", blockers: ["appointment_requires_clarification"] });
  });

  it("uses the existing trusted paid status and treats payment exceptions as staff review", () => {
    expect(readiness({ paymentStatus: "payment_processing" })).toMatchObject({ state: "waiting_for_payment", blockers: ["payment_required"] });
    expect(readiness({ paymentStatus: "refunded" })).toMatchObject({ state: "blocked", blockers: ["payment_requires_review"] });
    expect(readiness({ paymentStatus: "disputed" })).toMatchObject({ state: "blocked", blockers: ["payment_requires_review"] });
  });

  it("derives document review blockers from active tenant-scoped documents", () => {
    expect(readiness({ documents: [{ ...approvedDocument, status: "uploaded" }] })).toMatchObject({ state: "waiting_for_review", blockers: ["documents_pending_review"] });
    expect(readiness({ documents: [{ ...approvedDocument, status: "rejected" }] })).toMatchObject({ state: "waiting_for_replacement", blockers: ["documents_need_replacement"] });
    expect(readiness({ documents: [{ ...approvedDocument, status: "rejected", deletedAt: "2026-07-31T12:00:00.000Z" }] })).toMatchObject({ state: "waiting_for_documents", blockers: ["documents_required"] });
  });

  it("derives session readiness without treating the provider as notarization completion", () => {
    expect(readiness({ externalSession: null })).toMatchObject({ state: "waiting_for_session", blockers: ["external_session_required"] });
    expect(readiness({ externalSession: { ...scheduledSession, status: "ready" } })).toMatchObject({ state: "ready_for_notary", blockers: [] });
    expect(readiness({ externalSession: { ...scheduledSession, status: "in_progress" } })).toMatchObject({ state: "in_progress", blockers: [] });
    expect(readiness({ externalSession: { ...scheduledSession, status: "completed" } })).toMatchObject({ state: "blocked", blockers: ["external_session_completion_pending"] });
    expect(readiness({ externalSession: { ...scheduledSession, status: "cancelled" } })).toMatchObject({ state: "blocked", blockers: ["external_session_cancelled"] });
  });

  it("fails safely when a dependency is from another tenant or appointment", () => {
    expect(readiness({ documents: [{ ...approvedDocument, organizationId: "org-2" }] })).toMatchObject({ state: "blocked", blockers: ["dependency_scope_mismatch"] });
    expect(readiness({ externalSession: { ...scheduledSession, appointmentId: "appointment-2" } })).toMatchObject({ state: "blocked", blockers: ["dependency_scope_mismatch"] });
  });

  it("returns safe structured prerequisite facts for presentation consumers", () => {
    expect(readiness({ documents: [{ ...approvedDocument, status: "rejected" }], externalSession: null }).prerequisites).toEqual([
      { key: "appointment", label: "Appointment", state: "complete" },
      { key: "payment", label: "Payment", state: "complete" },
      { key: "documents", label: "Documents", state: "needs_replacement" },
      { key: "online_session", label: "Online Session", state: "waiting" }
    ]);
  });
});
