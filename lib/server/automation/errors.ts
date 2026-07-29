export type AutomationRetryClassification =
  | "retryable"
  | "non_retryable"
  | "manual_review"
  | "duplicate"
  | "cancelled"
  | "unsupported";

export type AutomationErrorCategory =
  | "authorization"
  | "approval"
  | "validation"
  | "tenant"
  | "audit"
  | "control"
  | "rule"
  | "duplicate"
  | "idempotency"
  | "configuration"
  | "unexpected";

export type AutomationErrorCode =
  | "invalid_request"
  | "unknown_rule"
  | "tenant_mismatch"
  | "unauthorized_actor"
  | "paused"
  | "disabled"
  | "unsupported"
  | "ineligible"
  | "invalid_context"
  | "approval_required"
  | "approval_rejected"
  | "evaluation_failed"
  | "execution_failed"
  | "invalid_rule_result"
  | "audit_unavailable"
  | "final_audit_unavailable"
  | "duplicate_execution"
  | "idempotency_unavailable"
  | "idempotency_completion_failed"
  | `rule:${string}`;

export type AutomationError = {
  readonly category: AutomationErrorCategory;
  readonly code: AutomationErrorCode;
  readonly safeSummary: string;
  readonly internalCause: string | null;
  readonly retryClassification: AutomationRetryClassification;
};

export function automationError(
  category: AutomationErrorCategory,
  code: AutomationErrorCode,
  safeSummary: string,
  retryClassification: AutomationRetryClassification,
  internalCause: string | null = null
): AutomationError {
  return { category, code, safeSummary, internalCause, retryClassification };
}
