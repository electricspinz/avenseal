import { describe, expect, it } from "vitest";
import { automationError, type AutomationErrorCategory } from "@/lib/server/automation/errors";
import { classifyAutomationRetry } from "@/lib/server/automation/retry";
import type { AutomationResult } from "@/lib/server/automation/types";

const failed: AutomationResult = { kind: "failed", executionId: "execution", attempted: true, sideEffectsMayHaveOccurred: false, reason: { code: "execution_failed", explanation: "Safe failure." }, safeSummary: "Safe failure." };

describe("Automation retry classifier", () => {
  it("classifies successful, duplicate, cancelled, unsupported, and manual-review results deterministically", () => {
    expect(classifyAutomationRetry({ kind: "succeeded", executionId: "execution", data: null, safeSummary: "Done." }).classification).toBe("non_retryable");
    expect(classifyAutomationRetry({ kind: "skipped", executionId: null, reason: { code: "duplicate_execution", explanation: "Duplicate." }, safeSummary: "Duplicate." }).classification).toBe("duplicate");
    expect(classifyAutomationRetry({ kind: "skipped", executionId: null, reason: { code: "unsupported", explanation: "Unsupported." }, safeSummary: "Unsupported." }).classification).toBe("unsupported");
    expect(classifyAutomationRetry({ kind: "cancelled", executionId: "execution", safeSummary: "Cancelled." }).classification).toBe("cancelled");
    expect(classifyAutomationRetry({ kind: "requires_manual_review", executionId: "execution", attempted: true, reason: { code: "final_audit_unavailable", explanation: "Review." }, safeSummary: "Review." }).classification).toBe("manual_review");
  });

  it("uses typed error categories and never raw exception strings", () => {
    const categories: readonly AutomationErrorCategory[] = ["authorization", "approval", "validation", "tenant", "audit", "control", "rule", "duplicate", "idempotency", "configuration", "unexpected"];
    for (const category of categories) {
      const error = automationError(category, "execution_failed", "A safe automation error occurred.", category === "rule" ? "retryable" : "manual_review", "provider: secret-token");
      expect(classifyAutomationRetry(failed, error).classification).toBe(error.retryClassification);
      expect(error.safeSummary).not.toContain("secret-token");
    }
  });

  it("requires review for an untyped failure that may have side effects", () => {
    expect(classifyAutomationRetry({ ...failed, sideEffectsMayHaveOccurred: true }).classification).toBe("manual_review");
  });
});
