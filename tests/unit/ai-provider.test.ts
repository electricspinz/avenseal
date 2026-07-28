import { describe, expect, it } from "vitest";
import { DeterministicProvider } from "@/lib/server/ai/deterministic-provider";
import type { AIProvider } from "@/lib/server/ai/provider";
import { getAIProvider } from "@/lib/server/ai/provider-factory";
import { buildRecommendations, type Recommendation, type RecommendationContext } from "@/lib/server/recommendation-engine";

function context(): RecommendationContext {
  return {
    missionControl: {
      dailyBrief: { date: "Monday, July 28", hour: 10, appointmentsToday: 2, awaitingReview: 0, communicationsUnavailable: false },
      schedule: { appointments: [], timezone: "America/New_York" },
      snapshot: [], systemHealth: [], settings: null
    },
    attentionIssues: [{ id: "communication-failed:one", priority: "critical", category: "communications", title: "Communication failed", description: "A communication could not be sent.", actionLabel: "Open communication", href: "/admin/communications/one", source: "communications", createdAt: "2026-07-28T10:00:00.000Z" }],
    operationsFeed: { items: [{ id: "feed-failure", timestamp: "2026-07-28T10:00:00.000Z", eventType: "communication_failed", title: "Communication failed", description: "A communication could not be sent.", source: "communication", customerName: null, appointmentId: null, destinationUrl: "/admin/communications/one", severity: "error" }], unavailableSources: [] }
  };
}

describe("AI provider abstraction", () => {
  it("returns the deterministic provider through the AIProvider contract", () => {
    const provider: AIProvider = getAIProvider();

    expect(provider).toBeInstanceOf(DeterministicProvider);
  });

  it("preserves deterministic provider output through the Recommendation Engine", () => {
    const input = context();

    expect(buildRecommendations(input)).toEqual(new DeterministicProvider().generateRecommendations(input));
  });

  it("delegates Recommendation Engine generation through the provider boundary", () => {
    const expected: Recommendation[] = [{ id: "delegated", priority: "low", title: "Delegated", summary: "Delegated result.", rationale: "Provider supplied this result.", evidence: [], confidence: "medium", explainable: true, source: "deterministic-recommendation-engine" }];
    let receivedContext: RecommendationContext | null = null;
    const provider: AIProvider = { generateRecommendations(input) { receivedContext = input; return expected; } };

    expect(buildRecommendations(context(), provider)).toEqual(expected);
    expect(receivedContext).toEqual(context());
  });

  it("keeps empty unsupported states unchanged through the factory provider", () => {
    const emptyContext = { ...context(), missionControl: { ...context().missionControl, dailyBrief: { ...context().missionControl.dailyBrief, appointmentsToday: null } }, attentionIssues: [], operationsFeed: { items: [], unavailableSources: [] } };

    expect(buildRecommendations(emptyContext)).toEqual([]);
  });
});
