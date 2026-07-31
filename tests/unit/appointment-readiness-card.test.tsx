import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppointmentReadinessCard } from "@/components/appointment-readiness-card";
import type { AppointmentReadiness } from "@/lib/server/appointment-readiness";

function readiness(state: AppointmentReadiness["state"], summary = "A deliberately long readiness explanation that remains readable without exposing any source record details."): AppointmentReadiness {
  return {
    state,
    summary,
    blockers: state === "blocked" ? ["payment_requires_review"] : [],
    prerequisites: [
      { key: "appointment", label: "Appointment", state: "complete" },
      { key: "payment", label: "Payment", state: "complete" },
      { key: "documents", label: "Documents", state: "complete" },
      { key: "online_session", label: "Online Session", state: "available" }
    ]
  };
}

describe("AppointmentReadinessCard", () => {
  it.each([
    ["waiting_for_payment", "Waiting for payment"],
    ["waiting_for_documents", "Waiting for documents"],
    ["waiting_for_review", "Waiting for document review"],
    ["waiting_for_replacement", "Waiting for document replacement"],
    ["waiting_for_session", "Waiting for online session"],
    ["ready_for_notary", "Ready for notarization"],
    ["in_progress", "In progress"],
    ["completed", "Completed"],
    ["cancelled", "Cancelled"],
    ["blocked", "Blocked"]
  ] as const)("renders the safe %s readiness presentation", (state, label) => {
    render(<AppointmentReadinessCard readiness={readiness(state)} />);
    expect(screen.getByRole("heading", { name: "Appointment Readiness" })).toBeTruthy();
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText(/deliberately long readiness explanation/i)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Prerequisites" })).toBeTruthy();
    expect(screen.getByText("Appointment")).toBeTruthy();
    expect(screen.getByText("Payment")).toBeTruthy();
    expect(screen.getByText("Documents")).toBeTruthy();
    expect(screen.getByText("Online Session")).toBeTruthy();
  });

  it("renders only calculated readiness facts, not source-record secrets", () => {
    render(<AppointmentReadinessCard readiness={readiness("blocked", "Payment requires staff review before this appointment can proceed.")} />);
    const content = document.body.textContent ?? "";
    expect(content).not.toContain("cs_test_private");
    expect(content).not.toContain("pi_private");
    expect(content).not.toContain("https://provider.example/private");
    expect(content).not.toContain("storage_key");
    expect(content).not.toContain("review notes");
  });

  it("uses the supplied prerequisite facts without calculating source data", () => {
    render(<AppointmentReadinessCard readiness={{ ...readiness("waiting_for_replacement"), prerequisites: [
      { key: "appointment", label: "Appointment", state: "complete" },
      { key: "payment", label: "Payment", state: "required" },
      { key: "documents", label: "Documents", state: "needs_replacement" },
      { key: "online_session", label: "Online Session", state: "not_applicable" }
    ] }} />);
    expect(screen.getByText("Required")).toBeTruthy();
    expect(screen.getByText("Needs replacement")).toBeTruthy();
    expect(screen.getByText("Not applicable")).toBeTruthy();
  });
});
