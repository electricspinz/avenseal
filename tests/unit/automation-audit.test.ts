import { describe, expect, it } from "vitest";
import { InMemoryAutomationAuditSink } from "@/lib/server/automation/testing";
import type { AutomationAuditRecord } from "@/lib/server/automation/types";

function record(organizationId: string, executionId: string, summary = "Safe summary."): AutomationAuditRecord {
  return { event: "execution_started", organizationId, executionId, logicalExecutionId: `logical-${executionId}`, ruleId: "rule", ruleVersion: "1", actor: { kind: "system", identifier: "automation-engine" }, occurredAt: "2026-07-28T12:00:00.000Z", reasons: [], safeSummary: summary };
}

describe("In-memory automation audit sink", () => {
  it("preserves append order, scopes lookups by tenant, and returns safe copies", async () => {
    const sink = new InMemoryAutomationAuditSink();
    await sink.append(record("org-a", "execution-1"));
    await sink.append(record("org-b", "execution-2"));
    await sink.append(record("org-a", "execution-3"));

    expect(sink.all().map((item) => item.executionId)).toEqual(["execution-1", "execution-2", "execution-3"]);
    expect(sink.byExecutionId("execution-2")).toHaveLength(1);
    expect(sink.byOrganizationId("org-a").map((item) => item.executionId)).toEqual(["execution-1", "execution-3"]);
    expect(sink.byOrganizationId("org-b").every((item) => item.organizationId === "org-b")).toBe(true);

    const copy = sink.all()[0] as { safeSummary: string };
    copy.safeSummary = "Changed";
    expect(sink.all()[0].safeSummary).toBe("Safe summary.");
  });

  it("supports deterministic injected append failures", async () => {
    const sink = new InMemoryAutomationAuditSink();
    sink.failAppendAt(2);
    await sink.append(record("org", "one"));
    await expect(sink.append(record("org", "two"))).rejects.toThrow("Injected automation audit failure.");
    expect(sink.all().map((item) => item.executionId)).toEqual(["one"]);
  });
});
