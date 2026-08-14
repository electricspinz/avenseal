import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClientPortalHome } from "@/components/client-portal/client-portal-home";
import { projectPortal, queryClientPortal, type CustomerReadiness } from "@/lib/server/client-portal";
import type { CustomerAppointmentStatus } from "@/lib/types";

const status: CustomerAppointmentStatus = { appointmentId: "appointment-1", organizationId: "organization-1", reference: "AVEN-1234", customerName: "Avery Doe", customerEmail: "avery@example.com", status: "awaiting_payment", customerStatusLabel: "Payment required", preferredDate: "2026-08-01", preferredTime: "10:00", timezone: "America/New_York", serviceName: "Remote online notarization", paymentStatus: "payment_link_created", amountDueCents: 2500, currency: "USD", checkoutUrl: "https://provider.example/secret", paymentExpiresAt: "2026-08-01T10:00:00.000Z", businessName: "Avenseal", businessEmail: "support@example.com", businessPhone: "555-0100", meetingUrl: null };

describe("Client Portal foundation", () => {
  it("projects only safe trusted appointment data through the secure query boundary", async () => {
    const portal = await queryClientPortal("valid-token", { async getAppointmentByAccessToken(token) { return token === "valid-token" ? status : null; }, async getExternalSession() { return null; } });
    expect(portal?.appointment.reference).toBe("AVEN-1234");
    expect(portal?.readiness).toMatchObject({ state: "payment_needed", label: "Payment needed" });
    expect(JSON.stringify(portal)).not.toContain("organization-1");
    await expect(queryClientPortal("other-token", { async getAppointmentByAccessToken() { return null; }, async getExternalSession() { return null; } })).resolves.toBeNull();
  });

  it("uses payment before preparation and distinguishes unavailable domains", () => {
    const portal = projectPortal(status);
    expect(portal.documents.availability).toBe("available");
    expect(portal.workflow.availability).toBe("unavailable");
    expect(portal.checklist.find((item) => item.id === "payment")?.state).toBe("current");
  });

  it("uses the canonical readiness result instead of a competing next-step decision", () => {
    const readiness: CustomerReadiness = { state: "documents_needed", label: "Upload your documents", explanation: "Upload the documents needed for your appointment.", nextStep: "Use the Documents section below.", tone: "warning" };
    const portal = projectPortal(status, null, [], readiness);

    expect(portal.readiness).toEqual(readiness);
    expect("nextStep" in portal).toBe(false);
  });

  it("renders accessible customer-facing sections without payment or mutation controls", () => {
    render(<ClientPortalHome portal={projectPortal(status)} />);
    expect(screen.getByRole("heading", { name: "Welcome, Avery Doe" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Your Appointment Status" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Preparation checklist" })).toBeTruthy();
    expect(screen.getByText("Document preparation is not yet confirmed in this workspace.")).toBeTruthy();
    expect(screen.getAllByText("Payment needed")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Contact Avenseal" }).getAttribute("href")).toBe("/contact");
    expect(screen.queryByRole("button", { name: /pay|upload|send/i })).toBeNull();
  });

  it("projects a safe external session and keeps its waiting state honest", () => {
    const waiting = projectPortal(status, null);
    expect(waiting.externalSession.availability).toBe("unavailable");
    const active = projectPortal({ ...status, status: "confirmed", paymentStatus: "paid" }, { appointmentId: "appointment-1", organizationId: "organization-1", provider: "BlueNotary", sessionName: "Online notarization", launchUrl: "https://example.test/session", referenceNumber: "admin-only", status: "scheduled", notes: "admin-only", createdAt: "2026-07-30T10:00:00.000Z", updatedAt: "2026-07-30T10:00:00.000Z", metadata: { internal: true } });
    expect(active.externalSession).toEqual({ availability: "available", provider: "BlueNotary", sessionName: "Online notarization" });
    expect(JSON.stringify(active.externalSession)).not.toContain("admin-only");
  });

  it("calculates readiness once from token-owned trusted sources and keeps internal records out of its customer projection", async () => {
    const portal = await queryClientPortal("valid-token", {
      async getAppointmentByAccessToken() { return { ...status, status: "confirmed", paymentStatus: "paid" }; },
      async getExternalSession() { return { appointmentId: "appointment-1", organizationId: "organization-1", provider: "BlueNotary", sessionName: "Online notarization", launchUrl: "https://provider.example/private", referenceNumber: "private-reference", status: "ready", notes: "private-note", createdAt: "2026-08-01", updatedAt: "2026-08-01", metadata: { private: true } }; },
      async getCustomerDocuments() { return [{ id: "document-1", originalFilename: "document.pdf", uploadedAt: "2026-08-01", status: "approved", replacementReason: null }]; },
      async getReadinessDocuments() { return [{ organizationId: "organization-1", appointmentId: "appointment-1", status: "approved", deletedAt: null }]; }
    });
    expect(portal?.readiness).toMatchObject({ state: "ready_for_notarization", label: "Ready for your online notarization" });
    expect(JSON.stringify(portal?.readiness)).not.toContain("private-reference");
    expect(JSON.stringify(portal?.readiness)).not.toContain("private-note");
    expect(JSON.stringify(portal?.readiness)).not.toContain("provider.example");
  });
});
