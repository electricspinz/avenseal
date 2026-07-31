import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OperationsFeedFoundation } from "@/components/mission-control/foundation-panels";
import { createReadinessAlertFromTransition, readinessAlertFromAudit } from "@/lib/server/readiness-alerts";
import { classifyReadinessTransition } from "@/lib/server/readiness-transitions";
import type { AppointmentReadinessState } from "@/lib/server/appointment-readiness";
import type { OperationsFeedViewModel } from "@/lib/server/operations-feed";

function transition(previous: AppointmentReadinessState, current: AppointmentReadinessState, discriminator = "trusted-v1") {
  return classifyReadinessTransition({ state: previous }, { state: current }, discriminator);
}

function alert(previous: AppointmentReadinessState, current: AppointmentReadinessState, discriminator?: string) {
  return createReadinessAlertFromTransition({ organizationId: "org-a", appointmentId: "appointment-a", transition: transition(previous, current, discriminator), createdAt: "2026-08-03T10:00:00.000Z" });
}

describe("readiness staff alerts", () => {
  it.each([
    ["readiness achieved", "waiting_for_session", "ready_for_notary", "readiness_achieved", "success"],
    ["document regression", "ready_for_notary", "waiting_for_replacement", "document_regression", "warning"],
    ["session lost", "ready_for_notary", "waiting_for_session", "session_lost", "warning"],
    ["blocked", "waiting_for_review", "blocked", "blocked", "error"],
    ["cancelled", "waiting_for_session", "cancelled", "cancelled", "warning"]
  ] as const)("creates the approved %s alert", (_label, previous, current, category, severity) => {
    expect(alert(previous, current)).toMatchObject({ organizationId: "org-a", appointmentId: "appointment-a", category, severity, destinationUrl: "/admin/appointments/appointment-a" });
  });

  it("does not create noise for no change, ordinary progress, or completion", () => {
    expect(alert("waiting_for_review", "waiting_for_review")).toBeNull();
    expect(alert("waiting_for_payment", "waiting_for_documents")).toBeNull();
    expect(alert("waiting_for_documents", "waiting_for_review")).toBeNull();
    expect(alert("waiting_for_replacement", "waiting_for_review")).toBeNull();
    expect(alert("in_progress", "completed")).toBeNull();
  });

  it("uses a stable tenant- and appointment-scoped discriminator without source data", () => {
    const first = alert("waiting_for_session", "ready_for_notary", "session-update-1")!;
    const retry = alert("waiting_for_session", "ready_for_notary", "session-update-1")!;
    const later = alert("waiting_for_session", "ready_for_notary", "session-update-2")!;
    const otherTenant = createReadinessAlertFromTransition({ organizationId: "org-b", appointmentId: "appointment-a", transition: transition("waiting_for_session", "ready_for_notary", "session-update-1"), createdAt: "2026-08-03T10:00:00.000Z" })!;

    expect(retry.id).toBe(first.id);
    expect(later.id).not.toBe(first.id);
    expect(otherTenant.id).not.toBe(first.id);
    expect(first.idempotencyDiscriminator).toBe("readiness_achieved:session-update-1");
    expect(JSON.stringify(first)).not.toMatch(/filename|review note|reviewer|payment[_-]?id|processor|https?:\/\/|reference|token|storage|content/i);
  });

  it("maps only safe, valid persisted audit facts and rejects malformed source data", () => {
    const source = { id: "audit-1", organizationId: "org-a", appointmentId: "appointment-a", createdAt: "2026-08-03T10:00:00.000Z", previousState: "ready_for_notary" as const, currentState: "waiting_for_replacement" as const, transitionCategory: "document_regression" as const, idempotencyDiscriminator: "document-state-2" };
    expect(readinessAlertFromAudit(source)).toMatchObject({ title: "Document replacement needed", transitionCategory: "document_regression" });
  });

  it("renders readiness alerts beside existing Operations Feed activity with safe details", () => {
    const feed: OperationsFeedViewModel = {
      unavailableSources: [],
      items: [
        { id: "readiness-alert:audit-1", timestamp: "2026-08-03T10:00:00.000Z", eventType: "readiness_alert", title: "Online session unavailable", description: "The appointment is waiting for a new or restored online session.", source: "readiness", customerName: null, appointmentId: "appointment-a", destinationUrl: "/admin/appointments/appointment-a", severity: "warning" },
        { id: "appointment-created:appointment-b", timestamp: "2026-08-02T10:00:00.000Z", eventType: "appointment_created", title: "Appointment created", description: "A booking request was received.", source: "appointment", customerName: "Customer", appointmentId: "appointment-b", destinationUrl: "/admin/appointments/appointment-b", severity: "info" }
      ]
    };
    render(<OperationsFeedFoundation feed={feed} />);
    expect(screen.getByText("Online session unavailable")).toBeTruthy();
    expect(screen.getByText("Appointment created")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Open details" })[0].getAttribute("href")).toBe("/admin/appointments/appointment-a");
    expect(screen.queryByText(/BlueNotary|token|https?:\/\//i)).toBeNull();
  });
});
