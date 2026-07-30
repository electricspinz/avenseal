import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CopilotAvailabilityNotice, CopilotBriefCard, CopilotRecommendationList } from "@/components/copilot/copilot-components";
import type { CopilotBrief, CopilotRecommendation } from "@/lib/server/copilot-types";

const recommendation: CopilotRecommendation = { id: "aven:test", organizationId: "org", category: "communication", priority: "critical", title: "Review failed communication", summary: "A recorded communication could not be sent.", reason: "The failed state is recorded.", recommendedAction: "Review the failed communication.", confidence: "high", status: "active", communicationId: "communication-1", href: "/admin/communications/communication-1", evidence: [{ id: "evidence", sourceType: "communication", sourceId: "communication-1", label: "Failed communication", fact: "A communication could not be sent.", observedAt: "2026-07-29T13:00:00.000Z", safeMetadata: {} }], generatedAt: "2026-07-29T14:00:00.000Z", ruleId: "failed-communication", ruleVersion: "1", safeMetadata: {} };
const brief: CopilotBrief = { id: "brief", organizationId: "org", generatedAt: "2026-07-29T14:00:00.000Z", localDate: "2026-07-29", greeting: "Good morning.", headline: "One recommendation requires review.", summaryItems: [], scheduleSummary: "1 appointment scheduled today.", attentionSummary: "1 recorded attention item.", readinessSummary: "Workflow readiness is currently unavailable.", topRecommendations: [recommendation], unavailableSections: ["workflows"], dataFreshness: "Current", ruleVersion: "1" };

describe("Aven Copilot components", () => {
  it("renders an accessible brief, evidence disclosure, read-only link, and availability state", () => {
    render(<><CopilotBriefCard brief={brief} /><CopilotRecommendationList recommendations={[recommendation]} /><CopilotAvailabilityNotice unavailableSections={brief.unavailableSections} /></>);
    expect(screen.getByRole("heading", { name: "Aven" })).toBeTruthy();
    expect(screen.getByText("Critical priority")).toBeTruthy();
    expect(screen.getByText("View 1 evidence item")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open related record" }).getAttribute("href")).toBe("/admin/communications/communication-1");
    expect(screen.getByText(/Some sections are partial or unavailable/)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
