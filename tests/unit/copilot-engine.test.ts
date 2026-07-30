import { describe, expect, it } from "vitest";
import { buildCopilotBrief, buildCopilotRecommendations, queryCopilot } from "@/lib/server/copilot-engine";
import type { CopilotContext } from "@/lib/server/copilot-types";

function context(overrides: Partial<CopilotContext> = {}): CopilotContext {
  return {
    organization: { id: "org-a", timezone: "America/New_York" }, generatedAt: "2026-07-29T14:00:00.000Z", localDate: "2026-07-29",
    appointments: { availability: "available", data: { today: [], next: null } },
    workflows: { availability: "available", data: [] },
    communications: { availability: "available", data: { failed: 1, queued: 0, attention: [{ id: "communication-failed:one", title: "Communication failed", description: "A communication could not be sent.", createdAt: "2026-07-29T13:00:00.000Z", href: "/admin/communications/one" }] } },
    payments: { availability: "available", data: [] }, documents: { availability: "available", data: [] }, operationsFeed: { availability: "available", data: [] }, unresolvedAttention: { availability: "available", data: { count: 1, items: [] } }, ...overrides
  };
}

describe("Aven Copilot deterministic engine", () => {
  it("creates tenant-scoped, evidence-backed identities from the same fact", () => {
    const first = buildCopilotRecommendations(context())[0];
    const again = buildCopilotRecommendations(context())[0];
    const otherTenant = buildCopilotRecommendations(context({ organization: { id: "org-b", timezone: "America/New_York" } }))[0];
    expect(first.id).toBe(again.id);
    expect(first.id).not.toBe(otherTenant.id);
    expect(first.evidence).toHaveLength(1);
    expect(first.evidence[0].fact).not.toContain("error");
  });

  it("does not infer payment or document issues when those sources are unavailable", () => {
    const result = buildCopilotRecommendations(context({ communications: { availability: "unavailable", data: { failed: null, queued: null, attention: [] }, reason: "Unavailable" }, payments: { availability: "unavailable", data: [], reason: "Unavailable" }, documents: { availability: "unavailable", data: [], reason: "Unavailable" } }));
    expect(result).toEqual([]);
  });

  it("creates direct, explainable workflow and readiness recommendations", () => {
    const workflow = { id: "workflow-1", organizationId: "org-a", customerId: "customer-1", customerName: "Avery Doe", appointmentId: "appointment-1", currentStage: "awaiting_payment" as const, previousStage: null, progressPercent: 20, blockers: ["payment_required"] as const, recommendedNextAction: "Collect payment", createdAt: "2026-07-29T12:00:00.000Z", updatedAt: "2026-07-29T13:00:00.000Z", completedAt: null, correlationId: null };
    const ready = { ...workflow, id: "workflow-2", currentStage: "ready_for_notarization" as const, blockers: [] as const };
    const result = buildCopilotRecommendations(context({ communications: { availability: "available", data: { failed: 0, queued: 0, attention: [] } }, workflows: { availability: "available", data: [workflow, ready] } }));
    expect(result.map((item) => item.ruleId)).toEqual(["blocked-workflow", "ready-for-notarization"]);
    expect(result.every((item) => item.evidence.length > 0 && item.confidence === "high")).toBe(true);
  });

  it("filters the safe read model deterministically and names unavailable sources honestly", () => {
    const unavailable = context({ documents: { availability: "unavailable", data: [], reason: "No source" } });
    const result = queryCopilot(unavailable, { priority: "critical", limit: "1" });
    expect(result.recommendations).toHaveLength(1);
    expect(result.brief.unavailableSections).toContain("documents");
    expect(result.brief.scheduleSummary).toContain("0 appointments");
  });

  it("keeps brief output stable for a fixed context", () => {
    const value = context();
    expect(buildCopilotBrief(value)).toEqual(buildCopilotBrief(value));
  });
});
