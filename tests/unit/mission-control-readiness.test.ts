import { describe, expect, it } from "vitest";
import { getAppointmentListReadiness, getMissionControlReadinessOverview, type MissionControlReadinessDependencies } from "@/lib/server/mission-control-readiness";
import type { AppointmentRequest } from "@/lib/types";

function appointment(id: string, status: AppointmentRequest["status"] = "confirmed"): AppointmentRequest {
  return { id, organizationId: "org-1", customerId: `customer-${id}`, serviceId: "service", serviceNameSnapshot: "Remote notarization", serviceDurationMinutesSnapshot: 30, servicePriceCentsSnapshot: 2500, serviceCurrencySnapshot: "USD", status, customer: { id: `customer-${id}`, organizationId: "org-1", fullName: `Customer ${id}`, email: `${id}@example.com`, mobilePhone: "555-0100", createdAt: "2026-01-01", updatedAt: "2026-01-01" }, documentCategory: "other", documentCount: 1, signerCount: 1, estimatedNotarizations: 1, notarizationsNotSure: false, hasWitnessLines: false, witnessesAvailable: true, signerLocation: "Florida", allSignersHaveGovernmentId: true, preferredDate: "2026-08-01", preferredTime: "10:00", urgency: "specific_date", administrativeNotes: null, createdAt: "2026-01-01", updatedAt: "2026-01-01" };
}

const dependencies: MissionControlReadinessDependencies = {
  async loadPaymentSources() { return ["ready", "progress", "documents", "review", "replacement", "session", "blocked"].map((appointmentId) => ({ organizationId: "org-1", appointmentId, status: "paid" as const })); },
  async loadDocumentSources() { return [
    { organizationId: "org-1", appointmentId: "ready", status: "approved" as const, deletedAt: null },
    { organizationId: "org-1", appointmentId: "progress", status: "approved" as const, deletedAt: null },
    { organizationId: "org-1", appointmentId: "review", status: "uploaded" as const, deletedAt: null },
    { organizationId: "org-1", appointmentId: "replacement", status: "rejected" as const, deletedAt: null },
    { organizationId: "org-1", appointmentId: "session", status: "approved" as const, deletedAt: null },
    { organizationId: "org-1", appointmentId: "blocked", status: "approved" as const, deletedAt: null },
    { organizationId: "other-org", appointmentId: "ready", status: "rejected" as const, deletedAt: null }
  ]; },
  async loadSessionSources() { return [
    { organizationId: "org-1", appointmentId: "ready", status: "ready" as const },
    { organizationId: "org-1", appointmentId: "progress", status: "in_progress" as const },
    { organizationId: "org-1", appointmentId: "blocked", status: "cancelled" as const },
    { organizationId: "other-org", appointmentId: "ready", status: "cancelled" as const }
  ]; }
};

describe("Mission Control readiness overview", () => {
  it("uses canonical readiness for every state, deduplicates appointments, and keeps the ready queue safe", async () => {
    const overview = await getMissionControlReadinessOverview("org-1", [
      appointment("ready"), appointment("progress"), appointment("payment"), appointment("documents"), appointment("review"), appointment("replacement"), appointment("session"), appointment("blocked"), appointment("cancelled", "cancelled"), appointment("completed", "completed"), appointment("ready")
    ], dependencies);

    expect(overview.counts).toMatchObject({ ready_for_notary: 1, in_progress: 1, waiting_for_payment: 1, waiting_for_documents: 1, waiting_for_review: 1, waiting_for_replacement: 1, waiting_for_session: 1, blocked: 1, cancelled: 1, completed: 1 });
    expect(overview.readyForNotary).toEqual([{ appointmentId: "ready", customerName: "Customer ready", preferredDate: "2026-08-01", preferredTime: "10:00", serviceName: "Remote notarization", readinessState: "ready_for_notary", href: "/admin/appointments/ready" }]);
    expect(JSON.stringify(overview)).not.toContain("rejected");
  });

  it("excludes wrong-tenant appointments and source records without changing the current tenant counts", async () => {
    const overview = await getMissionControlReadinessOverview("org-1", [appointment("ready"), { ...appointment("foreign"), organizationId: "other-org", customer: { ...appointment("foreign").customer, organizationId: "other-org" } }], dependencies);
    expect(overview.counts.ready_for_notary).toBe(1);
    expect(Object.values(overview.counts).reduce((sum, count) => sum + count, 0)).toBe(1);
    expect(overview.readyForNotary.map((item) => item.appointmentId)).toEqual(["ready"]);
  });

  it("creates one safe list item per unique, current-tenant appointment", async () => {
    const list = await getAppointmentListReadiness("org-1", [appointment("ready"), appointment("ready"), { ...appointment("foreign"), organizationId: "other-org", customer: { ...appointment("foreign").customer, organizationId: "other-org" } }], dependencies);
    expect(list).toEqual([{ appointmentId: "ready", state: "ready_for_notary" }]);
    expect(JSON.stringify(list)).not.toContain("Customer ready");
    expect(JSON.stringify(list)).not.toContain("provider");
  });

  it("uses conservative canonical waiting states when a readiness source is unavailable", async () => {
    const unavailableDocuments: MissionControlReadinessDependencies = { ...dependencies, loadDocumentSources: async () => { throw new Error("document query unavailable"); } };
    const overview = await getMissionControlReadinessOverview("org-1", [appointment("ready")], unavailableDocuments);
    expect(overview.counts.waiting_for_documents).toBe(1);
    expect(overview.readyForNotary).toEqual([]);
  });
});
