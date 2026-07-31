import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MissionControlReadinessOverviewCard } from "@/components/mission-control/readiness-overview";
import type { MissionControlReadinessOverview } from "@/lib/server/mission-control-readiness";

const counts = { ready_for_notary: 1, in_progress: 1, waiting_for_payment: 2, waiting_for_documents: 3, waiting_for_review: 4, waiting_for_replacement: 5, waiting_for_session: 6, blocked: 7, completed: 8, cancelled: 9 } as const;
const overview: MissionControlReadinessOverview = { counts, readyForNotary: [{ appointmentId: "appointment-1", customerName: "Avery Doe", preferredDate: "2026-08-01", preferredTime: "10:00", serviceName: "Remote notarization", readinessState: "ready_for_notary", href: "/admin/appointments/appointment-1" }] };

describe("MissionControlReadinessOverviewCard", () => {
  it("renders derived operational counts and a safe ready-for-notary queue", () => {
    render(<MissionControlReadinessOverviewCard overview={overview} />);
    expect(screen.getByRole("heading", { name: "Appointment readiness" })).toBeTruthy();
    expect(screen.getByText("Waiting for payment")).toBeTruthy();
    expect(screen.getByText("Waiting for document replacement")).toBeTruthy();
    expect(screen.getByText("Avery Doe")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open details" })).toHaveProperty("href", expect.stringContaining("/admin/appointments/appointment-1"));
    const content = document.body.textContent ?? "";
    expect(content).not.toContain("document.pdf");
    expect(content).not.toContain("review note");
    expect(content).not.toContain("https://provider.example");
    expect(content).not.toContain("access token");
    expect(content).not.toContain("cs_test");
  });

  it("renders honest empty and unavailable states", () => {
    const { rerender } = render(<MissionControlReadinessOverviewCard overview={{ counts: { ...counts, ready_for_notary: 0, in_progress: 0, waiting_for_payment: 0, waiting_for_documents: 0, waiting_for_review: 0, waiting_for_replacement: 0, waiting_for_session: 0, blocked: 0, completed: 0, cancelled: 0 }, readyForNotary: [] }} />);
    expect(screen.getByText("No appointments are available for readiness review.")).toBeTruthy();
    rerender(<MissionControlReadinessOverviewCard overview={null} />);
    expect(screen.getByText(/Appointment readiness is unavailable/i)).toBeTruthy();
  });

  it("shows no ready queue when only terminal appointments remain", () => {
    render(<MissionControlReadinessOverviewCard overview={{ counts: { ...counts, ready_for_notary: 0, in_progress: 0, waiting_for_payment: 0, waiting_for_documents: 0, waiting_for_review: 0, waiting_for_replacement: 0, waiting_for_session: 0, blocked: 0, completed: 1, cancelled: 1 }, readyForNotary: [] }} />);
    expect(screen.getByText("No active appointments are ready for notarization.")).toBeTruthy();
  });
});
