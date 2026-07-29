export type AutomationControlState = "enabled" | "paused" | "disabled" | "approval_required" | "unsupported";

export type AutomationReasonCode =
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

export type AutomationReason = {
  readonly code: AutomationReasonCode;
  readonly explanation: string;
};

export type AutomationActor =
  | { readonly kind: "system"; readonly identifier: "automation-engine" }
  | { readonly kind: "user"; readonly userId: string };

export type AutomationApproval = {
  readonly id: string;
  readonly organizationId: string;
  readonly ruleId: string;
  readonly logicalExecutionId: string;
  readonly expiresAt: string;
};

export type AutomationContext = {
  readonly organizationId: string;
  readonly logicalExecutionId: string;
  readonly evidence: readonly AutomationEvidence[];
};

export type AutomationEvidence = {
  readonly source: string;
  readonly recordId: string | null;
  readonly summary: string;
  readonly occurredAt: string | null;
};

export type AutomationEligibility =
  | { readonly kind: "eligible"; readonly reasons: readonly AutomationReason[] }
  | { readonly kind: "ineligible"; readonly reasons: readonly AutomationReason[] }
  | { readonly kind: "requires_approval"; readonly reasons: readonly AutomationReason[] }
  | { readonly kind: "paused"; readonly reasons: readonly AutomationReason[] }
  | { readonly kind: "disabled"; readonly reasons: readonly AutomationReason[] }
  | { readonly kind: "unsupported"; readonly reasons: readonly AutomationReason[] }
  | { readonly kind: "invalid_context"; readonly reasons: readonly AutomationReason[] };

export type AutomationResult<TResultData = unknown> =
  | { readonly kind: "succeeded"; readonly executionId: string; readonly data: TResultData; readonly safeSummary: string }
  | { readonly kind: "failed"; readonly executionId: string | null; readonly attempted: boolean; readonly sideEffectsMayHaveOccurred?: boolean; readonly reason: AutomationReason; readonly error?: AutomationError; readonly safeSummary: string }
  | { readonly kind: "skipped"; readonly executionId: string | null; readonly reason: AutomationReason; readonly error?: AutomationError; readonly safeSummary: string }
  | { readonly kind: "requires_manual_review"; readonly executionId: string | null; readonly attempted: boolean; readonly reason: AutomationReason; readonly error?: AutomationError; readonly safeSummary: string }
  | { readonly kind: "cancelled"; readonly executionId: string; readonly safeSummary: string };

export type AutomationExecutorResult<TResultData = unknown> = AutomationResult<TResultData> & {
  readonly retry: AutomationRetryClassification;
};

export type AutomationRuleMetadata = {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly requiresHumanApproval: boolean;
  readonly idempotencyDiscriminator?: string;
};

export type AutomationExecutionRequest<TContext extends AutomationContext = AutomationContext> = {
  readonly ruleId: string;
  readonly context: TContext;
  readonly actor: AutomationActor;
  readonly approval?: AutomationApproval;
};

export type AutomationRuleExecutionRequest<TContext extends AutomationContext = AutomationContext> = {
  readonly executionId: string;
  readonly organizationId: string;
  readonly context: TContext;
  readonly actor: AutomationActor;
};

export interface AutomationRule<TContext extends AutomationContext = AutomationContext, TResultData = unknown> {
  readonly metadata: AutomationRuleMetadata;
  evaluate(context: TContext): Promise<AutomationEligibility>;
  execute(request: AutomationRuleExecutionRequest<TContext>): Promise<AutomationResult<TResultData>>;
}

export type AutomationAuditEvent =
  | "evaluation_completed"
  | "execution_blocked"
  | "approval_required"
  | "approval_rejected"
  | "execution_started"
  | "execution_succeeded"
  | "execution_failed"
  | "execution_skipped"
  | "manual_review_required"
  | "cancelled";

export type AutomationAuditRecord = {
  readonly event: AutomationAuditEvent;
  readonly organizationId: string;
  readonly executionId: string | null;
  readonly logicalExecutionId: string;
  readonly ruleId: string;
  readonly ruleVersion: string | null;
  readonly actor: AutomationActor;
  readonly occurredAt: string;
  readonly reasons: readonly AutomationReason[];
  readonly safeSummary: string;
};

export interface AutomationRegistry {
  get(ruleId: string): AutomationRule | null;
}

export interface AutomationClock {
  now(): Date;
}

export interface AutomationIdGenerator {
  next(): string;
}
import type { AutomationError, AutomationRetryClassification } from "@/lib/server/automation/errors";
