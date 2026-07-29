import type { AutomationError, AutomationRetryClassification } from "@/lib/server/automation/errors";
import type { AutomationResult } from "@/lib/server/automation/types";

export type AutomationRetryDecision = {
  readonly classification: AutomationRetryClassification;
  readonly reason: string;
};

export function classifyAutomationRetry(result: AutomationResult, error: AutomationError | null = null): AutomationRetryDecision {
  if (result.kind === "cancelled") return { classification: "cancelled", reason: "The execution was cancelled." };
  if (result.kind === "requires_manual_review") return { classification: "manual_review", reason: "The outcome requires manual review." };
  if (result.kind === "skipped") {
    if (result.reason.code === "duplicate_execution") return { classification: "duplicate", reason: "An execution for this logical event already exists." };
    if (result.reason.code === "unsupported") return { classification: "unsupported", reason: "The rule or configuration is unsupported." };
    return { classification: "non_retryable", reason: "The execution was safely skipped." };
  }
  if (result.kind === "succeeded") return { classification: "non_retryable", reason: "The execution succeeded." };

  const failure = error ?? result.error;
  if (failure) return { classification: failure.retryClassification, reason: failure.safeSummary };
  return result.sideEffectsMayHaveOccurred
    ? { classification: "manual_review", reason: "The failed action may have produced side effects." }
    : { classification: "retryable", reason: "The action failed before side effects were confirmed." };
}
