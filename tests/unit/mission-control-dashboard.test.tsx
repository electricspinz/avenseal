import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AutomationAttentionWidget, CommunicationsAttentionWidget, DashboardErrorState, RecentCustomerActivityWidget } from "@/components/mission-control/dashboard-widgets";
import { loadMissionControlDashboard, type MissionControlDashboardDependencies } from "@/lib/server/mission-control-dashboard";

const dependencies: MissionControlDashboardDependencies = {
  async loadMissionControl() { return { dailyBrief: { date: "July 29", hour: 9, appointmentsToday: 1, awaitingReview: 0, communicationsUnavailable: false }, schedule: { appointments: [], timezone: "America/New_York" }, snapshot: [{ label: "Scheduled communications", value: 2 }, { label: "Failed communications", value: 1 }], systemHealth: [], settings: null, readiness: null }; },
  async loadAttention() { return []; },
  async loadOperationsFeed() { return { items: [], unavailableSources: [] }; },
  async loadAppointmentActions() { return []; }
};

describe("Mission Control dashboard", () => {
  it("composes existing read models into dashboard widgets", async () => {
    await expect(loadMissionControlDashboard(dependencies)).resolves.toMatchObject({ communications: { failed: 1, queued: 2, pending: null, deliveredToday: null }, appointmentActions: [], automation: { manualReview: null }, timeline: { available: false } });
  });

  it("renders available counts, explicit unavailable states, and a safe error state", () => {
    render(<><CommunicationsAttentionWidget communications={{ failed: 1, queued: 2, pending: null, deliveredToday: null }} /><AutomationAttentionWidget automation={{ manualReview: null, skipped: null, duplicateBlocked: null, recentFailures: null }} /><RecentCustomerActivityWidget timeline={{ available: false, message: "Timeline is unavailable." }} /></>);
    expect(screen.getByRole("link", { name: "Open center" })).toBeTruthy();
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(0);
    expect(screen.getByText("Timeline is unavailable.")).toBeTruthy();
    render(<DashboardErrorState />);
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
