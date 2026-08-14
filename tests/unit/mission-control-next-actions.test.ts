import { describe, expect, it } from "vitest";
import { loadMissionControlAppointmentActions, type MissionControlNextActionDependencies } from "@/lib/server/mission-control-next-actions";
import type { AppointmentRequest, CommunicationMessage } from "@/lib/types";

function appointment(overrides: Partial<AppointmentRequest> = {}): AppointmentRequest {
  return {
    id: "appointment-1", organizationId: "org-1", customerId: "customer-1", serviceId: "service-1", serviceNameSnapshot: "Remote notarization", serviceDurationMinutesSnapshot: 30, servicePriceCentsSnapshot: 2500, serviceCurrencySnapshot: "USD", status: "confirmed",
    customer: { id: "customer-1", organizationId: "org-1", fullName: "Customer One", email: "customer@example.test", mobilePhone: null, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" },
    documentCategory: "other", documentCount: 1, signerCount: 1, estimatedNotarizations: null, notarizationsNotSure: false, hasWitnessLines: null, witnessesAvailable: null, signerLocation: "Florida", allSignersHaveGovernmentId: true, preferredDate: "2026-08-20", preferredTime: "10:00", urgency: "specific_date", administrativeNotes: null, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-02T00:00:00.000Z", ...overrides,
  };
}

const approvedDocument = { organizationId: "org-1", appointmentId: "appointment-1", status: "approved", scanStatus: "clean", storageStatus: "active", deletedAt: null };

function communication(status: CommunicationMessage["status"]) {
  return {
    organizationId: "org-1",
    appointmentId: "appointment-1",
    messageType: "external_session_available" as CommunicationMessage["messageType"],
    status,
  };
}

function source(overrides: Partial<MissionControlNextActionDependencies> = {}): MissionControlNextActionDependencies {
  return {
    listAppointments: async () => [appointment()],
    listPaymentSources: async () => [{ organizationId: "org-1", appointmentId: "appointment-1", status: "paid" }],
    listDocumentSources: async () => [approvedDocument],
    listSessionSources: async () => [],
    listCommunicationSources: async () => [],
    ...overrides,
  };
}

async function firstAction(overrides: Partial<MissionControlNextActionDependencies> = {}) {
  return (await loadMissionControlAppointmentActions(source(overrides)))[0];
}

describe("Mission Control appointment actions", () => {
  it("excludes cancelled appointments from Needs Attention even when lower-priority records need review", async () => {
    const item = await firstAction({ listAppointments: async () => [appointment({ status: "cancelled" })], listPaymentSources: async () => [{ organizationId: "org-1", appointmentId: "appointment-1", status: "unpaid" }] });
    expect(item?.action.kind).toBe("no_action_required");
    expect(item?.attention).toBeNull();
  });

  it("prioritizes payment review before document and session work", async () => {
    const item = await firstAction({ listPaymentSources: async () => [{ organizationId: "org-1", appointmentId: "appointment-1", status: "unpaid" }], listDocumentSources: async () => [{ ...approvedDocument, scanStatus: "infected" }] });
    expect(item?.action.kind).toBe("review_payment");
    expect(item?.attention?.priority).toBe("high");
  });

  it("uses document security states before ordinary document review", async () => {
    const missing = await firstAction({ listDocumentSources: async () => [] });
    const pending = await firstAction({ listDocumentSources: async () => [{ ...approvedDocument, status: "uploaded", scanStatus: "pending", storageStatus: "quarantined" }] });
    const unsafe = await firstAction({ listDocumentSources: async () => [{ ...approvedDocument, scanStatus: "infected" }] });
    const suspicious = await firstAction({ listDocumentSources: async () => [{ ...approvedDocument, scanStatus: "suspicious" }] });
    const failed = await firstAction({ listDocumentSources: async () => [{ ...approvedDocument, scanStatus: "failed" }] });
    const removed = await firstAction({ listDocumentSources: async () => [{ ...approvedDocument, storageStatus: "removed" }] });
    expect(missing?.action.kind).toBe("waiting_for_customer_document");
    expect(pending?.action.kind).toBe("security_processing");
    expect(unsafe?.action.kind).toBe("review_document_security");
    expect(suspicious?.action.kind).toBe("review_document_security");
    expect(failed?.action.kind).toBe("review_document_security");
    expect(removed?.action.kind).toBe("review_document_security");
    expect(unsafe?.attention?.priority).toBe("critical");
  });

  it("handles uploaded and rejected document review without claiming provider handoff", async () => {
    const uploaded = await firstAction({ listDocumentSources: async () => [{ ...approvedDocument, status: "uploaded" }] });
    const rejected = await firstAction({ listDocumentSources: async () => [{ ...approvedDocument, status: "rejected" }] });
    expect(uploaded?.action.kind).toBe("review_uploaded_document");
    expect(rejected?.action).toMatchObject({ kind: "waiting_for_replacement_document", targetId: "client-workspace" });
  });

  it("only presents session preparation after an approved clean active document", async () => {
    const item = await firstAction();
    expect(item?.action).toMatchObject({ kind: "prepare_session", targetId: "external-session" });
    expect(item?.action.context).toContain("secure provider handoff");
  });

  it("distinguishes informational session processing from a failed delivery", async () => {
    const sessions = async () => [{ organizationId: "org-1", appointmentId: "appointment-1", status: "scheduled", launchUrl: "https://provider.example/session" }];
    const processing = await firstAction({ listSessionSources: sessions, listCommunicationSources: async () => [communication("queued")] });
    const failed = await firstAction({ listSessionSources: sessions, listCommunicationSources: async () => [communication("failed")] });
    expect(processing?.action).toMatchObject({ kind: "session_communication_processing", ctaLabel: undefined });
    expect(failed?.action).toMatchObject({ kind: "session_communication_failed", href: "/admin/communications" });
  });

  it("keeps ready sessions out of Needs Attention and surfaces terminal session outcomes safely", async () => {
    const baseSession = { organizationId: "org-1", appointmentId: "appointment-1", launchUrl: "https://provider.example/session" };
    const ready = await firstAction({ listSessionSources: async () => [{ ...baseSession, status: "ready" }], listCommunicationSources: async () => [communication("sent")] });
    const completed = await firstAction({ listSessionSources: async () => [{ ...baseSession, status: "completed" }] });
    const cancelled = await firstAction({ listSessionSources: async () => [{ ...baseSession, status: "cancelled" }] });
    expect(ready?.action.kind).toBe("ready_for_appointment_review");
    expect(ready?.attention).toBeNull();
    expect(completed?.action.kind).toBe("confirm_appointment_outcome");
    expect(cancelled?.action.kind).toBe("resolve_cancelled_session");
  });

  it("keeps completed appointments in a follow-up review state instead of inferring notarization completion", async () => {
    const item = await firstAction({ listAppointments: async () => [appointment({ status: "completed" })] });

    expect(item?.action.kind).toBe("review_completion");
    expect(item?.action.description).toContain("recorded appointment outcome");
  });

  it("fails safely for unknown records and ignores another tenant's source rows", async () => {
    const unknown = await firstAction({ listDocumentSources: async () => [{ ...approvedDocument, scanStatus: "not_a_scan_state" }] });
    const crossTenant = await firstAction({ listPaymentSources: async () => [{ organizationId: "other-org", appointmentId: "appointment-1", status: "paid" }] });
    expect(unknown?.action.kind).toBe("review_appointment");
    expect(crossTenant?.action.kind).toBe("review_payment");
  });
});
