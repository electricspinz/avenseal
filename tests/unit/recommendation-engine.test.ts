import { describe, expect, it } from "vitest";
import { buildRecommendations } from "@/lib/server/recommendation-engine";
import type { AttentionIssue } from "@/lib/server/attention-engine";
import type { MissionControlViewModel } from "@/lib/server/mission-control";
import type { OperationsFeedViewModel } from "@/lib/server/operations-feed";

function missionControl(appointmentsToday: number | null): MissionControlViewModel {
  return {
    dailyBrief: { date: "Monday, July 28", hour: 10, appointmentsToday, awaitingReview: 0, communicationsUnavailable: false },
    schedule: { appointments: [], timezone: "America/New_York" },
    snapshot: [], systemHealth: [], settings: null, readiness: null
  };
}

function issue(id: string, priority: AttentionIssue["priority"], createdAt: string | null = "2026-07-28T10:00:00.000Z"): AttentionIssue {
  const calendar = id === "calendar-integration-disconnected";
  return { id, priority, category: calendar ? "calendar" : id.startsWith("communication") ? "communications" : id.startsWith("appointment") ? "appointments" : "system", title: calendar ? "Calendar integration disconnected" : id, description: `${id} evidence`, actionLabel: calendar ? "Open integrations" : "Open details", href: calendar ? "/admin/settings/integrations" : "/admin/appointments", source: calendar ? "integrations" : id.startsWith("communication") ? "communications" : "appointments", createdAt };
}

const emptyFeed: OperationsFeedViewModel = { items: [], unavailableSources: [] };

describe("Recommendation Engine", () => {
  it("generates one explainable failed-communications recommendation with feed evidence", () => {
    const recommendations = buildRecommendations({
      missionControl: missionControl(2),
      attentionIssues: [issue("communication-failed:first", "critical"), issue("communication-failed:second", "critical", "2026-07-28T11:00:00.000Z")],
      operationsFeed: { items: [{ id: "feed-failure", timestamp: "2026-07-28T11:00:00.000Z", eventType: "communication_failed", title: "Communication failed", description: "Delivery failed.", source: "communication", customerName: null, appointmentId: null, destinationUrl: "/admin/communications/feed-failure", severity: "error" }], unavailableSources: [] }
    });

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]).toMatchObject({ id: "review-failed-communications", explainable: true, confidence: "high", href: "/admin/communications" });
    expect(recommendations[0].evidence).toHaveLength(2);
  });

  it("generates reconnect-calendar and review-appointments recommendations from attention evidence", () => {
    const recommendations = buildRecommendations({ missionControl: missionControl(1), attentionIssues: [issue("calendar-integration-disconnected", "high"), issue("appointment-awaiting-review:one", "medium")], operationsFeed: emptyFeed });

    expect(recommendations.map((recommendation) => recommendation.id)).toEqual(["reconnect-calendar", "review-awaiting-appointments"]);
    expect(recommendations.every((recommendation) => recommendation.explainable && recommendation.evidence.length > 0)).toBe(true);
  });

  it("creates a medium-confidence quiet-day recommendation only with supported evidence", () => {
    const recommendations = buildRecommendations({ missionControl: missionControl(0), attentionIssues: [issue("no-appointments-today:2026-07-28", "low", null)], operationsFeed: emptyFeed });

    expect(recommendations).toEqual([expect.objectContaining({ id: "quiet-day-review", confidence: "medium", source: "deterministic-recommendation-engine" })]);
  });

  it("prevents quiet-day recommendations when an unknown or higher-priority issue exists", () => {
    const unknown = buildRecommendations({ missionControl: missionControl(0), attentionIssues: [issue("unknown-appointments", "low")], operationsFeed: emptyFeed });
    const critical = buildRecommendations({ missionControl: missionControl(0), attentionIssues: [issue("communication-failed:one", "critical")], operationsFeed: emptyFeed });

    expect(unknown).toEqual([]);
    expect(critical.map((recommendation) => recommendation.id)).toEqual(["review-failed-communications"]);
  });

  it("returns no recommendation for unsupported situations", () => {
    expect(buildRecommendations({ missionControl: missionControl(null), attentionIssues: [], operationsFeed: emptyFeed })).toEqual([]);
  });
});
