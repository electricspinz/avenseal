import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClientPortalHome } from "@/components/client-portal/client-portal-home";
import { projectPortal, queryClientPortal } from "@/lib/server/client-portal";
import type { CustomerAppointmentStatus } from "@/lib/types";

const status: CustomerAppointmentStatus = { appointmentId: "appointment-1", organizationId: "organization-1", reference: "AVEN-1234", customerName: "Avery Doe", customerEmail: "avery@example.com", status: "awaiting_payment", customerStatusLabel: "Payment required", preferredDate: "2026-08-01", preferredTime: "10:00", timezone: "America/New_York", serviceName: "Remote online notarization", paymentStatus: "payment_link_created", amountDueCents: 2500, currency: "USD", checkoutUrl: "https://provider.example/secret", paymentExpiresAt: "2026-08-01T10:00:00.000Z", businessName: "Avenseal", businessEmail: "support@example.com", businessPhone: "555-0100", meetingUrl: null };

describe("Client Portal foundation", () => {
  it("projects only safe trusted appointment data through the secure query boundary", async () => {
    const portal = await queryClientPortal("valid-token", { async getAppointmentByAccessToken(token) { return token === "valid-token" ? status : null; } });
    expect(portal?.appointment.reference).toBe("AVEN-1234");
    expect(JSON.stringify(portal)).not.toContain("provider.example");
    await expect(queryClientPortal("other-token", { async getAppointmentByAccessToken() { return null; } })).resolves.toBeNull();
  });

  it("uses payment before preparation and distinguishes unavailable domains", () => {
    const portal = projectPortal(status);
    expect(portal.nextStep.title).toBe("Review payment status");
    expect(portal.documents.availability).toBe("unavailable");
    expect(portal.workflow.availability).toBe("unavailable");
    expect(portal.checklist.find((item) => item.id === "payment")?.state).toBe("current");
  });

  it("renders accessible customer-facing sections without payment or mutation controls", () => {
    render(<ClientPortalHome portal={projectPortal(status)} />);
    expect(screen.getByRole("heading", { name: "Welcome, Avery Doe" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Preparation checklist" })).toBeTruthy();
    expect(screen.getByText("Document readiness is unavailable through this secure portal link.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Contact Avenseal" }).getAttribute("href")).toBe("/contact");
    expect(screen.queryByRole("button", { name: /pay|upload|send/i })).toBeNull();
  });

  it("projects a safe external session and keeps its waiting state honest", () => {
    const waiting = projectPortal(status, null);
    expect(waiting.externalSession.availability).toBe("unavailable");
    const active = projectPortal(status, { appointmentId: "appointment-1", organizationId: "organization-1", provider: "BlueNotary", sessionName: "Online notarization", launchUrl: "https://example.test/session", referenceNumber: "admin-only", status: "scheduled", notes: "admin-only", createdAt: "2026-07-30T10:00:00.000Z", updatedAt: "2026-07-30T10:00:00.000Z", metadata: { internal: true } });
    expect(active.externalSession).toEqual({ availability: "available", provider: "BlueNotary", sessionName: "Online notarization", launchUrl: "https://example.test/session", status: "scheduled" });
    expect(JSON.stringify(active.externalSession)).not.toContain("admin-only");
  });
});
