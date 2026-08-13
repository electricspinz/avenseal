import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAppointment: vi.fn(),
  getHistory: vi.fn().mockResolvedValue([]),
  getSettings: vi.fn().mockResolvedValue({ business: { timezone: "America/New_York" } }),
  getNotes: vi.fn().mockResolvedValue([]),
  listPayments: vi.fn().mockResolvedValue([]),
  listCalendarEvents: vi.fn().mockResolvedValue([]),
  listCommunications: vi.fn().mockResolvedValue([]),
  getExternalSession: vi.fn().mockResolvedValue(null),
  getClientWorkspaceAccessMetadata: vi.fn().mockResolvedValue(null),
  listAppointmentRescheduleHistory: vi.fn().mockResolvedValue([]),
  calculate: vi.fn(),
  deriveNextAction: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NOT_FOUND"); })
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/server/repository", () => ({ repository: mocks }));
vi.mock("@/lib/server/appointment-readiness", () => ({ calculateAppointmentReadiness: mocks.calculate }));
vi.mock("@/lib/server/appointment-next-action", () => ({ deriveAppointmentNextAction: mocks.deriveNextAction }));
vi.mock("@/lib/supabase/server", () => ({ hasSupabaseServiceConfig: () => false, getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/server/timeline-query", () => ({ parseTimelineFilters: () => ({}), queryAppointmentTimeline: vi.fn().mockResolvedValue([]) }));
vi.mock("@/components/admin-shell", () => ({ AdminShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>, AdminCard: ({ children }: { children: React.ReactNode }) => <section>{children}</section> }));
vi.mock("@/components/appointment-readiness-card", () => ({ AppointmentReadinessCard: ({ readiness }: { readiness: { state: string } }) => <div data-testid="readiness-card">{readiness.state}</div> }));
vi.mock("@/components/admin-appointment-next-action-panel", () => ({ AdminAppointmentNextActionPanel: ({ action }: { action: { title: string } }) => <div data-testid="next-action-panel">{action.title}</div> }));
vi.mock("@/components/admin-appointment-form", () => ({ AdminAppointmentForm: () => <div /> }));
vi.mock("@/components/payment-link-button", () => ({ PaymentLinkButton: () => <div /> }));
vi.mock("@/components/status-badge", () => ({ StatusBadge: () => <div /> }));
vi.mock("@/components/customer-timeline", () => ({ CustomerTimeline: () => <div />, TimelineFiltersForm: () => <div /> }));
vi.mock("@/components/external-session-card", () => ({ ExternalSessionCard: () => <div /> }));
vi.mock("@/components/client-workspace-access-card", () => ({ ClientWorkspaceAccessCard: () => <div /> }));
vi.mock("@/components/admin-appointment-documents-card", () => ({ AdminAppointmentDocumentsCard: () => <div /> }));
vi.mock("@/components/admin-appointment-reschedule", () => ({ AdminAppointmentReschedule: () => <div /> }));

import AppointmentDetailPage from "@/app/admin/appointments/[id]/page";

const appointment = {
  id: "appointment-1", organizationId: "org-1", status: "confirmed", preferredDate: "2026-08-01", preferredTime: "10:00", customer: { fullName: "Avery Doe", email: "avery@example.com", mobilePhone: "555-0100" }, serviceNameSnapshot: "Remote online notarization", serviceDurationMinutesSnapshot: 30, servicePriceCentsSnapshot: 2500, serviceCurrencySnapshot: "USD", documentCategory: "other", documentCount: 1, signerCount: 1, estimatedNotarizations: 1, notarizationsNotSure: false, hasWitnessLines: false, witnessesAvailable: true, signerLocation: "Florida", allSignersHaveGovernmentId: true, administrativeNotes: null
};
const readiness = { state: "waiting_for_documents", summary: "Documents are required before this appointment can proceed.", blockers: ["documents_required"], prerequisites: [] };
const nextAction = { kind: "waiting_for_customer_document", title: "Waiting for customer document", description: "A document is required before staff can continue preparation.", tone: "warning", ctaLabel: "View Client Workspace access", targetId: "client-workspace" };

function renderPage() {
  return AppointmentDetailPage({ params: Promise.resolve({ id: "appointment-1" }), searchParams: Promise.resolve({}) });
}

describe("Appointment Details readiness integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calculates readiness server-side from trusted appointment records and passes the result to the card", async () => {
    mocks.getAppointment.mockResolvedValue(appointment);
    mocks.calculate.mockReturnValue(readiness);
    mocks.deriveNextAction.mockReturnValue(nextAction);
    const page = await renderPage();

    expect(mocks.calculate).toHaveBeenCalledOnce();
    expect(mocks.calculate).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1", appointmentId: "appointment-1", appointmentStatus: "confirmed", paymentStatus: null, documents: [], externalSession: null }));
    render(page);
    expect(screen.getByTestId("readiness-card").textContent).toContain("waiting_for_documents");
    expect(screen.getByTestId("next-action-panel").textContent).toContain("Waiting for customer document");
    expect(mocks.deriveNextAction).toHaveBeenCalledWith(expect.objectContaining({ appointmentStatus: "confirmed", paymentStatus: null, documents: [], externalSession: null, communications: [] }));
    expect(mocks.getHistory).toHaveBeenCalledWith("appointment-1");
    expect(mocks.getNotes).toHaveBeenCalledWith("appointment-1");
    expect(mocks.listPayments).toHaveBeenCalledWith("appointment-1");
  });

  it("preserves missing or unauthorized appointment handling before readiness is calculated", async () => {
    mocks.getAppointment.mockResolvedValueOnce(null);
    await expect(renderPage()).rejects.toThrow("NOT_FOUND");
    expect(mocks.calculate).not.toHaveBeenCalled();
    expect(mocks.getHistory).not.toHaveBeenCalled();
  });
});
