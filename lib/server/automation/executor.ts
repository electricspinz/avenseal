import type { AutomationAuditSink } from "@/lib/server/automation/audit";
import type { AutomationAuthorizationProvider } from "@/lib/server/automation/authorization";
import type { AutomationControlProvider } from "@/lib/server/automation/controls";
import { automationError, type AutomationError, type AutomationErrorCategory, type AutomationErrorCode } from "@/lib/server/automation/errors";
import { createAutomationIdempotencyKey, type AutomationIdempotencyStore } from "@/lib/server/automation/idempotency";
import { classifyAutomationRetry } from "@/lib/server/automation/retry";
import type {
  AutomationAuditEvent,
  AutomationAuditRecord,
  AutomationClock,
  AutomationControlState,
  AutomationEligibility,
  AutomationExecutionRequest,
  AutomationExecutorResult,
  AutomationIdGenerator,
  AutomationReason,
  AutomationResult,
  AutomationRuleMetadata,
  AutomationRegistry
} from "@/lib/server/automation/types";

export type AutomationExecutorDependencies = {
  readonly registry: AutomationRegistry;
  readonly controls: AutomationControlProvider;
  readonly authorization: AutomationAuthorizationProvider;
  readonly audit: AutomationAuditSink;
  readonly clock: AutomationClock;
  readonly idGenerator: AutomationIdGenerator;
  readonly idempotency: AutomationIdempotencyStore;
  readonly idempotencyReservationTtlMilliseconds?: number;
};

export interface AutomationExecutor {
  execute(request: AutomationExecutionRequest): Promise<AutomationExecutorResult>;
}

export class DefaultAutomationExecutor implements AutomationExecutor {
  constructor(private readonly dependencies: AutomationExecutorDependencies) {}

  async execute(request: AutomationExecutionRequest): Promise<AutomationExecutorResult> {
    const requestError = validateRequest(request);
    if (requestError) return finalResult(failed(null, false, requestError));

    const trustedOrganization = await this.dependencies.authorization.resolveTrustedOrganization({
      actor: request.actor,
      logicalExecutionId: request.context.logicalExecutionId
    });
    if (trustedOrganization.kind !== "trusted") {
      return finalResult(failed(null, false, reason("unauthorized_actor", "The organization context could not be verified.")));
    }
    if (trustedOrganization.organizationId !== request.context.organizationId) {
      return finalResult(failed(null, false, reason("tenant_mismatch", "The request does not match the trusted organization context.")));
    }

    const rule = this.dependencies.registry.get(request.ruleId);
    if (!rule) {
      return this.blockedWithoutRule(request, trustedOrganization.organizationId, reason("unknown_rule", "The requested automation rule is not registered."));
    }

    const authorization = await this.dependencies.authorization.authorizeExecution({
      actor: request.actor,
      organizationId: trustedOrganization.organizationId,
      rule: rule.metadata
    });
    if (authorization.kind !== "authorized") {
      return this.blocked(request, trustedOrganization.organizationId, rule.metadata, "execution_blocked", reason("unauthorized_actor", "The initiating actor is not authorized to execute this rule."));
    }

    const control = await this.dependencies.controls.resolve({ organizationId: trustedOrganization.organizationId, rule: rule.metadata });
    const controlBlock = controlReason(control.state, control.reason);
    if (controlBlock && control.state !== "approval_required") {
      return this.blocked(request, trustedOrganization.organizationId, rule.metadata, "execution_blocked", controlBlock);
    }

    let eligibility: AutomationEligibility;
    try {
      eligibility = await rule.evaluate(request.context);
    } catch {
      return this.blocked(request, trustedOrganization.organizationId, rule.metadata, "execution_failed", reason("evaluation_failed", "The automation rule could not be evaluated."), "failed");
    }

    const evaluationRecorded = await this.record(this.auditRecord(request, trustedOrganization.organizationId, rule.metadata, "evaluation_completed", null, eligibility.reasons, eligibility.kind === "eligible" ? "Automation rule evaluation completed." : "Automation rule evaluation did not permit execution."));
    if (!evaluationRecorded) {
      return finalResult(failed(null, false, reason("audit_unavailable", "Automation evaluation could not be recorded safely.")));
    }

    if (eligibility.kind !== "eligible" && eligibility.kind !== "requires_approval") {
      const blockedReason = eligibility.reasons[0] ?? reasonForEligibility(eligibility.kind);
      return this.blocked(request, trustedOrganization.organizationId, rule.metadata, "execution_blocked", blockedReason);
    }

    if (control.state === "approval_required" || rule.metadata.requiresHumanApproval || eligibility.kind === "requires_approval") {
      const approvalResult = await this.dependencies.authorization.validateApproval({
        approval: request.approval,
        organizationId: trustedOrganization.organizationId,
        rule: rule.metadata,
        logicalExecutionId: request.context.logicalExecutionId,
        actor: request.actor,
        now: this.dependencies.clock.now()
      });
      if (approvalResult.kind !== "valid") {
        const event: AutomationAuditEvent = approvalResult.kind === "missing" ? "approval_required" : "approval_rejected";
        const approvalReason = reason(approvalResult.kind === "missing" ? "approval_required" : "approval_rejected", approvalResult.kind === "missing" ? "A valid approval is required before this rule can execute." : "The supplied approval could not be accepted.");
        return this.blocked(request, trustedOrganization.organizationId, rule.metadata, event, approvalReason);
      }
    }

    const reservationNow = this.dependencies.clock.now();
    const idempotencyKey = createAutomationIdempotencyKey({
      organizationId: trustedOrganization.organizationId,
      ruleId: rule.metadata.id,
      ruleVersion: rule.metadata.version,
      logicalExecutionId: request.context.logicalExecutionId,
      policyDiscriminator: rule.metadata.idempotencyDiscriminator
    });
    try {
      const reservation = await this.dependencies.idempotency.reserve({
        key: idempotencyKey,
        organizationId: trustedOrganization.organizationId,
        ruleId: rule.metadata.id,
        ruleVersion: rule.metadata.version,
        logicalExecutionId: request.context.logicalExecutionId,
        now: reservationNow,
        expiresAt: new Date(reservationNow.getTime() + (this.dependencies.idempotencyReservationTtlMilliseconds ?? 5 * 60 * 1000))
      });
      if (reservation.kind === "duplicate") {
        return this.blocked(request, trustedOrganization.organizationId, rule.metadata, "execution_blocked", reason("duplicate_execution", "An execution for this logical event already exists."));
      }
      if (reservation.kind === "expired") {
        return finalResult(failed(null, false, reason("idempotency_unavailable", "The automation action could not safely renew its expired duplicate guard.")));
      }
    } catch {
      return finalResult(failed(null, false, reason("idempotency_unavailable", "The automation action could not reserve its duplicate guard.")));
    }

    const executionId = this.dependencies.idGenerator.next();
    const started = await this.record(this.auditRecord(request, trustedOrganization.organizationId, rule.metadata, "execution_started", executionId, [], "Automation execution started."));
    if (!started) {
      await this.releaseReservation(idempotencyKey);
      return finalResult(failed(executionId, false, reason("audit_unavailable", "Automation execution could not be recorded before the action began.")));
    }

    let result: AutomationResult;
    try {
      const ruleResult = await rule.execute({ executionId, organizationId: trustedOrganization.organizationId, context: request.context, actor: request.actor });
      result = normalizeRuleResult(ruleResult, executionId);
    } catch {
      result = failed(executionId, true, reason("execution_failed", "The automation action did not complete."), true);
    }

    const finalEvent = eventForResult(result);
    const finalRecorded = await this.record(this.auditRecord(request, trustedOrganization.organizationId, rule.metadata, finalEvent, executionId, resultReasons(result), result.safeSummary));
    if (!finalRecorded) {
      return finalResult({
        kind: "requires_manual_review",
        executionId,
        attempted: true,
        reason: reason("final_audit_unavailable", "The automation action may have completed, but its final audit record could not be stored."),
        safeSummary: "Manual review is required because the final automation outcome could not be recorded."
      });
    }
    if (result.kind === "succeeded") {
      const completed = await this.completeReservation(idempotencyKey);
      if (!completed) return finalResult(manualReview(executionId, "idempotency_completion_failed", "The automation action completed, but its duplicate guard could not be finalized."));
    } else if (canReleaseReservation(result)) {
      await this.releaseReservation(idempotencyKey);
    }
    return finalResult(result);
  }

  private async blockedWithoutRule(request: AutomationExecutionRequest, organizationId: string, blockedReason: AutomationReason): Promise<AutomationExecutorResult> {
    const recorded = await this.record({
      event: "execution_blocked",
      organizationId,
      executionId: null,
      logicalExecutionId: request.context.logicalExecutionId,
      ruleId: request.ruleId,
      ruleVersion: null,
      actor: request.actor,
      occurredAt: this.dependencies.clock.now().toISOString(),
      reasons: [blockedReason],
      safeSummary: blockedReason.explanation
    });
    return finalResult(recorded ? skipped(null, blockedReason) : failed(null, false, reason("audit_unavailable", "The blocked automation outcome could not be recorded safely.")));
  }

  private async blocked(request: AutomationExecutionRequest, organizationId: string, metadata: AutomationRuleMetadata, event: AutomationAuditEvent, blockedReason: AutomationReason, resultKind: "skipped" | "failed" = "skipped"): Promise<AutomationExecutorResult> {
    const recorded = await this.record(this.auditRecord(request, organizationId, metadata, event, null, [blockedReason], blockedReason.explanation));
    if (!recorded) return finalResult(failed(null, false, reason("audit_unavailable", "The automation outcome could not be recorded safely.")));
    return finalResult(resultKind === "failed" ? failed(null, false, blockedReason) : skipped(null, blockedReason));
  }

  private auditRecord(request: AutomationExecutionRequest, organizationId: string, metadata: AutomationRuleMetadata, event: AutomationAuditEvent, executionId: string | null, reasons: readonly AutomationReason[], safeSummary: string): AutomationAuditRecord {
    return { event, organizationId, executionId, logicalExecutionId: request.context.logicalExecutionId, ruleId: metadata.id, ruleVersion: metadata.version, actor: request.actor, occurredAt: this.dependencies.clock.now().toISOString(), reasons: [...reasons], safeSummary };
  }

  private async record(record: AutomationAuditRecord) {
    try {
      await this.dependencies.audit.append(record);
      return true;
    } catch {
      return false;
    }
  }

  private async completeReservation(key: string) {
    try {
      await this.dependencies.idempotency.complete(key, this.dependencies.clock.now());
      return true;
    } catch {
      return false;
    }
  }

  private async releaseReservation(key: string) {
    try {
      await this.dependencies.idempotency.release(key);
      return true;
    } catch {
      return false;
    }
  }
}

function validateRequest(request: AutomationExecutionRequest): AutomationReason | null {
  if (!request || !request.ruleId || !request.context?.organizationId || !request.context.logicalExecutionId || !request.actor) {
    return reason("invalid_request", "The automation request is incomplete.");
  }
  if ((request.actor.kind !== "system" && request.actor.kind !== "user") || (request.actor.kind === "user" && !request.actor.userId)) {
    return reason("invalid_request", "The automation actor is invalid.");
  }
  return null;
}

function controlReason(state: AutomationControlState, explanation: string): AutomationReason | null {
  if (state === "enabled") return null;
  const code = state === "approval_required" ? "approval_required" : state;
  return reason(code, explanation);
}

function reasonForEligibility(kind: Exclude<AutomationEligibility["kind"], "eligible" | "requires_approval">): AutomationReason {
  const code = kind === "invalid_context" ? "invalid_context" : kind === "ineligible" ? "ineligible" : kind;
  return reason(code, "The automation rule was not eligible for execution.");
}

function normalizeRuleResult(result: AutomationResult, executionId: string): AutomationResult {
  if (!result || !["succeeded", "failed", "skipped", "requires_manual_review", "cancelled"].includes(result.kind)) {
    return failed(executionId, true, reason("invalid_rule_result", "The automation rule returned an invalid result."));
  }
  if (result.kind === "succeeded" || result.kind === "cancelled") return { ...result, executionId };
  return { ...result, executionId };
}

function eventForResult(result: AutomationResult): AutomationAuditEvent {
  if (result.kind === "succeeded") return "execution_succeeded";
  if (result.kind === "failed") return "execution_failed";
  if (result.kind === "skipped") return "execution_skipped";
  if (result.kind === "cancelled") return "cancelled";
  return "manual_review_required";
}

function resultReasons(result: AutomationResult): readonly AutomationReason[] {
  return "reason" in result ? [result.reason] : [];
}

function reason(code: AutomationReason["code"], explanation: string): AutomationReason {
  return { code, explanation };
}

function failed(executionId: string | null, attempted: boolean, failureReason: AutomationReason, sideEffectsMayHaveOccurred = false): AutomationResult {
  return {
    kind: "failed",
    executionId,
    attempted,
    sideEffectsMayHaveOccurred,
    reason: failureReason,
    error: executorError(failureReason),
    safeSummary: failureReason.explanation
  };
}

function skipped(executionId: string | null, skipReason: AutomationReason): AutomationResult {
  return { kind: "skipped", executionId, reason: skipReason, error: executorError(skipReason), safeSummary: skipReason.explanation };
}

function manualReview(executionId: string, code: AutomationReason["code"], safeSummary: string): AutomationResult {
  const reviewReason = reason(code, safeSummary);
  return { kind: "requires_manual_review", executionId, attempted: true, reason: reviewReason, error: executorError(reviewReason), safeSummary };
}

function finalResult(result: AutomationResult): AutomationExecutorResult {
  return { ...result, retry: classifyAutomationRetry(result).classification };
}

function canReleaseReservation(result: AutomationResult) {
  if (result.kind === "cancelled" || result.kind === "skipped") return true;
  return result.kind === "failed" && result.sideEffectsMayHaveOccurred === false;
}

function executorError(failureReason: AutomationReason): AutomationError {
  const details = errorDetails(failureReason.code);
  return automationError(details.category, failureReason.code as AutomationErrorCode, failureReason.explanation, details.retryClassification);
}

function errorDetails(code: AutomationReason["code"]): { category: AutomationErrorCategory; retryClassification: AutomationError["retryClassification"] } {
  if (code === "unauthorized_actor") return { category: "authorization", retryClassification: "non_retryable" };
  if (code === "approval_required" || code === "approval_rejected") return { category: "approval", retryClassification: "manual_review" };
  if (code === "invalid_request" || code === "invalid_context") return { category: "validation", retryClassification: "non_retryable" };
  if (code === "tenant_mismatch") return { category: "tenant", retryClassification: "non_retryable" };
  if (code === "audit_unavailable" || code === "final_audit_unavailable") return { category: "audit", retryClassification: "manual_review" };
  if (code === "paused" || code === "disabled") return { category: "control", retryClassification: "non_retryable" };
  if (code === "unsupported") return { category: "configuration", retryClassification: "unsupported" };
  if (code === "duplicate_execution") return { category: "duplicate", retryClassification: "duplicate" };
  if (code === "idempotency_unavailable" || code === "idempotency_completion_failed") return { category: "idempotency", retryClassification: "manual_review" };
  if (code === "unknown_rule") return { category: "configuration", retryClassification: "unsupported" };
  if (code === "evaluation_failed" || code === "execution_failed") return { category: "rule", retryClassification: "manual_review" };
  if (code === "ineligible" || code === "invalid_rule_result") return { category: "validation", retryClassification: "non_retryable" };
  return { category: "unexpected", retryClassification: "manual_review" };
}
