import type { AutomationAuditSink } from "@/lib/server/automation/audit";
import type { AutomationAuthorizationProvider } from "@/lib/server/automation/authorization";
import type { AutomationControlProvider } from "@/lib/server/automation/controls";
import type {
  AutomationAuditEvent,
  AutomationAuditRecord,
  AutomationClock,
  AutomationControlState,
  AutomationEligibility,
  AutomationExecutionRequest,
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
};

export interface AutomationExecutor {
  execute(request: AutomationExecutionRequest): Promise<AutomationResult>;
}

export class DefaultAutomationExecutor implements AutomationExecutor {
  constructor(private readonly dependencies: AutomationExecutorDependencies) {}

  async execute(request: AutomationExecutionRequest): Promise<AutomationResult> {
    const requestError = validateRequest(request);
    if (requestError) return failed(null, false, requestError);

    const trustedOrganization = await this.dependencies.authorization.resolveTrustedOrganization({
      actor: request.actor,
      logicalExecutionId: request.context.logicalExecutionId
    });
    if (trustedOrganization.kind !== "trusted") {
      return failed(null, false, reason("unauthorized_actor", "The organization context could not be verified."));
    }
    if (trustedOrganization.organizationId !== request.context.organizationId) {
      return failed(null, false, reason("tenant_mismatch", "The request does not match the trusted organization context."));
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
      return failed(null, false, reason("audit_unavailable", "Automation evaluation could not be recorded safely."));
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

    const executionId = this.dependencies.idGenerator.next();
    // Sprint 6B.3 inserts authoritative idempotency reservation at this point, after approval and before execution-start audit.
    const started = await this.record(this.auditRecord(request, trustedOrganization.organizationId, rule.metadata, "execution_started", executionId, [], "Automation execution started."));
    if (!started) {
      return failed(executionId, false, reason("audit_unavailable", "Automation execution could not be recorded before the action began."));
    }

    let result: AutomationResult;
    try {
      const ruleResult = await rule.execute({ executionId, organizationId: trustedOrganization.organizationId, context: request.context, actor: request.actor });
      result = normalizeRuleResult(ruleResult, executionId);
    } catch {
      result = failed(executionId, true, reason("execution_failed", "The automation action did not complete."));
    }

    const finalEvent = eventForResult(result);
    const finalRecorded = await this.record(this.auditRecord(request, trustedOrganization.organizationId, rule.metadata, finalEvent, executionId, resultReasons(result), result.safeSummary));
    if (!finalRecorded) {
      return {
        kind: "requires_manual_review",
        executionId,
        attempted: true,
        reason: reason("final_audit_unavailable", "The automation action may have completed, but its final audit record could not be stored."),
        safeSummary: "Manual review is required because the final automation outcome could not be recorded."
      };
    }
    return result;
  }

  private async blockedWithoutRule(request: AutomationExecutionRequest, organizationId: string, blockedReason: AutomationReason): Promise<AutomationResult> {
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
    return recorded ? skipped(null, blockedReason) : failed(null, false, reason("audit_unavailable", "The blocked automation outcome could not be recorded safely."));
  }

  private async blocked(request: AutomationExecutionRequest, organizationId: string, metadata: AutomationRuleMetadata, event: AutomationAuditEvent, blockedReason: AutomationReason, resultKind: "skipped" | "failed" = "skipped"): Promise<AutomationResult> {
    const recorded = await this.record(this.auditRecord(request, organizationId, metadata, event, null, [blockedReason], blockedReason.explanation));
    if (!recorded) return failed(null, false, reason("audit_unavailable", "The automation outcome could not be recorded safely."));
    return resultKind === "failed" ? failed(null, false, blockedReason) : skipped(null, blockedReason);
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

function failed(executionId: string | null, attempted: boolean, failureReason: AutomationReason): AutomationResult {
  return { kind: "failed", executionId, attempted, reason: failureReason, safeSummary: failureReason.explanation };
}

function skipped(executionId: string | null, skipReason: AutomationReason): AutomationResult {
  return { kind: "skipped", executionId, reason: skipReason, safeSummary: skipReason.explanation };
}
