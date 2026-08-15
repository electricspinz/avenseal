import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClientReadinessCard } from "@/components/client-portal/client-readiness-card";
import { customerReadinessFromCanonical, type CustomerReadiness } from "@/lib/server/client-portal";
import type { AppointmentReadiness } from "@/lib/server/appointment-readiness";

function canonical(state: AppointmentReadiness["state"]): AppointmentReadiness {
  return { state, blockers: state === "blocked" ? ["payment_requires_review"] : [], summary: "Internal operational explanation.", prerequisites: [] };
}

describe("Client Workspace readiness", () => {
  it.each([
    ["waiting_for_payment", "payment_needed", "Payment needed"],
    ["waiting_for_documents", "documents_needed", "Upload your document"],
    ["waiting_for_review", "documents_under_review", "We’re reviewing your documents"],
    ["waiting_for_replacement", "replacement_needed", "A replacement document is needed"],
    ["waiting_for_session", "waiting_for_session", "Your online session is being prepared"],
    ["ready_for_notary", "ready_for_notarization", "Ready for your online notarization"],
    ["in_progress", "session_in_progress", "Your online session is in progress"],
    ["completed", "appointment_completed", "Appointment marked complete"],
    ["cancelled", "appointment_cancelled", "Appointment cancelled"],
    ["blocked", "action_required", "Action required"]
  ] as const)("maps %s to the safe %s projection", (canonicalState, customerState, label) => {
    const readiness = customerReadinessFromCanonical(canonical(canonicalState));
    expect(readiness).toMatchObject({ state: customerState, label });
    expect(JSON.stringify(readiness)).not.toContain("Internal operational explanation");
    expect(JSON.stringify(readiness)).not.toContain("payment_requires_review");
  });

  it("renders concise safe customer copy without operational source details", () => {
    const readiness: CustomerReadiness = { state: "action_required", label: "Action required", explanation: "We need your attention before this appointment can continue.", nextStep: "Review the information below or contact Avenseal.", tone: "warning" };
    render(<ClientReadinessCard readiness={readiness} />);
    expect(screen.getByRole("heading", { name: "Your Appointment Status" })).toBeTruthy();
    expect(screen.getByText("Action required")).toBeTruthy();
    expect(screen.getByText(/Review the information below/i)).toBeTruthy();
    const content = document.body.textContent ?? "";
    expect(content).not.toContain("payment_requires_review");
    expect(content).not.toContain("cs_test_private");
    expect(content).not.toContain("document.pdf");
    expect(content).not.toContain("review notes");
    expect(content).not.toContain("https://provider.example");
  });
});
