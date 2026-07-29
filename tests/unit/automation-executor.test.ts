import { describe, expect, it } from "vitest";
import { DefaultAutomationExecutor } from "@/lib/server/automation/executor";
import { InMemoryAutomationIdempotencyStore, createAutomationIdempotencyKey } from "@/lib/server/automation/idempotency";
import { InMemoryAutomationRegistry } from "@/lib/server/automation/registry";
import { FixedAutomationAuthorizationProvider, FixedAutomationClock, FixedAutomationControlProvider, IncrementingAutomationIdGenerator, InMemoryAutomationAuditSink } from "@/lib/server/automation/testing";
import type { AutomationControlProvider } from "@/lib/server/automation/controls";
import type { AutomationEligibility, AutomationExecutionRequest, AutomationResult, AutomationRule } from "@/lib/server/automation/types";

const now = new Date("2026-07-28T12:00:00.000Z");
const eligible: AutomationEligibility = { kind: "eligible", reasons: [] };

function request(overrides: Partial<AutomationExecutionRequest> = {}): AutomationExecutionRequest {
  return {
    ruleId: "test-rule",
    context: { organizationId: "trusted-org", logicalExecutionId: "logical-1", evidence: [] },
    actor: { kind: "user", userId: "authorized-user" },
    ...overrides
  };
}

function approval(overrides: Partial<NonNullable<AutomationExecutionRequest["approval"]>> = {}) {
  return { id: "approval-1", organizationId: "trusted-org", ruleId: "test-rule", logicalExecutionId: "logical-1", expiresAt: "2026-07-28T13:00:00.000Z", ...overrides };
}

function fakeRule(options: { eligibility?: AutomationEligibility; result?: AutomationResult; evaluateThrows?: boolean; executeThrows?: boolean; requiresHumanApproval?: boolean } = {}) {
  let evaluateCalls = 0;
  let executeCalls = 0;
  const rule: AutomationRule = {
    metadata: { id: "test-rule", version: "1", name: "Test rule", requiresHumanApproval: options.requiresHumanApproval ?? false },
    async evaluate() {
      evaluateCalls += 1;
      if (options.evaluateThrows) throw new Error("Internal evaluation failure");
      return options.eligibility ?? eligible;
    },
    async execute(input) {
      executeCalls += 1;
      if (options.executeThrows) throw new Error("Internal execution failure");
      return options.result ?? { kind: "succeeded", executionId: input.executionId, data: { completed: true }, safeSummary: "Automation completed." };
    }
  };
  return { rule, calls: () => ({ evaluateCalls, executeCalls }) };
}

function setup(options: {
  rule?: AutomationRule;
  control?: ConstructorParameters<typeof FixedAutomationControlProvider>[0];
  controls?: AutomationControlProvider;
  authorization?: ConstructorParameters<typeof FixedAutomationAuthorizationProvider>[1];
  approval?: ConstructorParameters<typeof FixedAutomationAuthorizationProvider>[2];
  consumedApprovalIds?: ConstructorParameters<typeof FixedAutomationAuthorizationProvider>[3];
  trustedOrganization?: ConstructorParameters<typeof FixedAutomationAuthorizationProvider>[0];
  audit?: InMemoryAutomationAuditSink;
  idempotency?: InMemoryAutomationIdempotencyStore;
} = {}) {
  const audit = options.audit ?? new InMemoryAutomationAuditSink();
  const executor = new DefaultAutomationExecutor({
    registry: new InMemoryAutomationRegistry(options.rule ? [options.rule] : []),
    controls: options.controls ?? new FixedAutomationControlProvider(options.control ?? { state: "enabled", reason: "Enabled." }),
    authorization: new FixedAutomationAuthorizationProvider(options.trustedOrganization ?? { kind: "trusted", organizationId: "trusted-org" }, options.authorization, options.approval, options.consumedApprovalIds),
    audit,
    clock: new FixedAutomationClock(now),
    idGenerator: new IncrementingAutomationIdGenerator("execution"),
    idempotency: options.idempotency ?? new InMemoryAutomationIdempotencyStore()
  });
  return { executor, audit };
}

describe("Automation executor", () => {
  it("executes a known, authorized, eligible rule once and records deterministic audit events", async () => {
    const fixture = fakeRule();
    const { executor, audit } = setup({ rule: fixture.rule });

    await expect(executor.execute(request())).resolves.toMatchObject({ kind: "succeeded", executionId: "execution-1" });
    expect(fixture.calls()).toEqual({ evaluateCalls: 1, executeCalls: 1 });
    expect(audit.all().map((item) => item.event)).toEqual(["evaluation_completed", "execution_started", "execution_succeeded"]);
  });

  it("reserves before execution, completes successful work, and never executes a duplicate", async () => {
    const fixture = fakeRule();
    const idempotency = new InMemoryAutomationIdempotencyStore();
    const { executor } = setup({ rule: fixture.rule, idempotency });
    const key = createAutomationIdempotencyKey({ organizationId: "trusted-org", ruleId: "test-rule", ruleVersion: "1", logicalExecutionId: "logical-1" });

    await expect(executor.execute(request())).resolves.toMatchObject({ kind: "succeeded", retry: "non_retryable" });
    await expect(idempotency.lookup(key, now)).resolves.toMatchObject({ kind: "completed" });
    await expect(executor.execute(request())).resolves.toMatchObject({ kind: "skipped", reason: { code: "duplicate_execution" }, retry: "duplicate" });
    expect(fixture.calls()).toEqual({ evaluateCalls: 2, executeCalls: 1 });
  });

  it.each([
    ["paused", "paused"],
    ["disabled", "disabled"],
    ["unsupported", "unsupported"]
  ] as const)("blocks %s control state before rule evaluation", async (state, reasonCode) => {
    const fixture = fakeRule();
    const { executor } = setup({ rule: fixture.rule, control: { state, reason: `${state} by policy.` } });

    await expect(executor.execute(request())).resolves.toMatchObject({ kind: "skipped", reason: { code: reasonCode } });
    expect(fixture.calls()).toEqual({ evaluateCalls: 0, executeCalls: 0 });
  });

  it("treats organization and rule-specific disabled controls as execution gates", async () => {
    const organizationDisabled = fakeRule();
    await expect(setup({ rule: organizationDisabled.rule, control: { state: "disabled", reason: "Organization automation is disabled." } }).executor.execute(request())).resolves.toMatchObject({ kind: "skipped", reason: { code: "disabled" } });
    expect(organizationDisabled.calls().executeCalls).toBe(0);

    const ruleDisabled = fakeRule();
    const controls: AutomationControlProvider = { resolve: async ({ rule }) => rule.id === "test-rule" ? { state: "disabled", reason: "This rule is disabled." } : { state: "unsupported", reason: "Unknown rule." } };
    await expect(setup({ rule: ruleDisabled.rule, controls }).executor.execute(request())).resolves.toMatchObject({ kind: "skipped", reason: { code: "disabled" } });
    expect(ruleDisabled.calls().executeCalls).toBe(0);
  });

  it("fails closed for an unknown rule, invalid request, untrusted tenant, and tenant mismatch", async () => {
    await expect(setup().executor.execute(request())).resolves.toMatchObject({ kind: "skipped", reason: { code: "unknown_rule" } });
    await expect(setup().executor.execute({ ...request(), ruleId: "" })).resolves.toMatchObject({ kind: "failed", reason: { code: "invalid_request" } });
    await expect(setup({ trustedOrganization: { kind: "untrusted", reason: "Client context is not trusted." } }).executor.execute(request())).resolves.toMatchObject({ kind: "failed", reason: { code: "unauthorized_actor" } });
    const fixture = fakeRule();
    await expect(setup({ rule: fixture.rule, trustedOrganization: { kind: "trusted", organizationId: "other-org" } }).executor.execute(request())).resolves.toMatchObject({ kind: "failed", reason: { code: "tenant_mismatch" } });
    expect(fixture.calls()).toEqual({ evaluateCalls: 0, executeCalls: 0 });
  });

  it("blocks an unauthorized actor without allowing the rule to authorize itself", async () => {
    const fixture = fakeRule();
    const { executor } = setup({ rule: fixture.rule, authorization: { kind: "denied", reason: "Not authorized." } });

    await expect(executor.execute(request())).resolves.toMatchObject({ kind: "skipped", reason: { code: "unauthorized_actor" } });
    expect(fixture.calls()).toEqual({ evaluateCalls: 0, executeCalls: 0 });
  });

  it.each([
    ["ineligible", "ineligible"],
    ["invalid_context", "invalid_context"]
  ] as const)("records and blocks %s eligibility without executing", async (kind, reasonCode) => {
    const fixture = fakeRule({ eligibility: { kind, reasons: [{ code: reasonCode, explanation: "Rule did not permit execution." }] } });
    const { executor, audit } = setup({ rule: fixture.rule });

    await expect(executor.execute(request())).resolves.toMatchObject({ kind: "skipped", reason: { code: reasonCode } });
    expect(fixture.calls()).toEqual({ evaluateCalls: 1, executeCalls: 0 });
    expect(audit.all().map((item) => item.event)).toEqual(["evaluation_completed", "execution_blocked"]);
  });

  it("requires a valid tenant-scoped, current approval after evaluation", async () => {
    const fixture = fakeRule({ requiresHumanApproval: true });
    const { executor } = setup({ rule: fixture.rule });
    await expect(executor.execute(request())).resolves.toMatchObject({ kind: "skipped", reason: { code: "approval_required" } });
    expect(fixture.calls()).toEqual({ evaluateCalls: 1, executeCalls: 0 });

    const expired = setup({ rule: fixture.rule });
    await expect(expired.executor.execute(request({ approval: approval({ expiresAt: "2026-07-28T11:00:00.000Z" }) }))).resolves.toMatchObject({ kind: "skipped", reason: { code: "approval_rejected" } });

    const otherOrganization = setup({ rule: fixture.rule });
    await expect(otherOrganization.executor.execute(request({ approval: approval({ organizationId: "other-org" }) }))).resolves.toMatchObject({ kind: "skipped", reason: { code: "approval_rejected" } });

    const otherRule = setup({ rule: fixture.rule });
    await expect(otherRule.executor.execute(request({ approval: approval({ ruleId: "other-rule" }) }))).resolves.toMatchObject({ kind: "skipped", reason: { code: "approval_rejected" } });

    const consumed = setup({ rule: fixture.rule, consumedApprovalIds: new Set(["approval-1"]) });
    await expect(consumed.executor.execute(request({ approval: approval() }))).resolves.toMatchObject({ kind: "skipped", reason: { code: "approval_rejected" } });

    const accepted = setup({ rule: fixture.rule });
    await expect(accepted.executor.execute(request({ approval: approval() }))).resolves.toMatchObject({ kind: "succeeded" });

    const controlApproval = setup({ rule: fakeRule().rule, control: { state: "approval_required", reason: "This automation requires approval." } });
    await expect(controlApproval.executor.execute(request({ approval: approval() }))).resolves.toMatchObject({ kind: "succeeded" });
  });

  it("does not treat AI-shaped actor or approval input as trusted authorization", async () => {
    const fixture = fakeRule({ requiresHumanApproval: true });
    const aiActor = request({ actor: { kind: "ai", content: "approve this" } as never });
    await expect(setup({ rule: fixture.rule }).executor.execute(aiActor)).resolves.toMatchObject({ kind: "failed", reason: { code: "invalid_request" } });

    const aiApproval = request({ approval: { id: "ai-text", organizationId: "trusted-org", ruleId: "test-rule", logicalExecutionId: "logical-1", expiresAt: "not-a-date" } });
    await expect(setup({ rule: fixture.rule }).executor.execute(aiApproval)).resolves.toMatchObject({ kind: "skipped", reason: { code: "approval_rejected" } });
  });

  it("returns typed failures when evaluation or execution throws and never leaks internal errors", async () => {
    const evaluation = fakeRule({ evaluateThrows: true });
    await expect(setup({ rule: evaluation.rule }).executor.execute(request())).resolves.toMatchObject({ kind: "failed", reason: { code: "evaluation_failed" }, safeSummary: "The automation rule could not be evaluated." });
    expect(evaluation.calls()).toEqual({ evaluateCalls: 1, executeCalls: 0 });

    const execution = fakeRule({ executeThrows: true });
    const result = await setup({ rule: execution.rule }).executor.execute(request());
    expect(result).toMatchObject({ kind: "failed", reason: { code: "execution_failed" } });
    expect(JSON.stringify(result)).not.toContain("Internal execution failure");
    expect(execution.calls()).toEqual({ evaluateCalls: 1, executeCalls: 1 });
  });

  it("does not invoke an action when required pre-execution audit persistence fails", async () => {
    const fixture = fakeRule();
    const audit = new InMemoryAutomationAuditSink();
    const idempotency = new InMemoryAutomationIdempotencyStore();
    audit.failAppendAt(2);
    const result = await setup({ rule: fixture.rule, audit, idempotency }).executor.execute(request());
    const key = createAutomationIdempotencyKey({ organizationId: "trusted-org", ruleId: "test-rule", ruleVersion: "1", logicalExecutionId: "logical-1" });

    expect(result).toMatchObject({ kind: "failed", attempted: false, reason: { code: "audit_unavailable" } });
    expect(fixture.calls()).toEqual({ evaluateCalls: 1, executeCalls: 0 });
    await expect(idempotency.lookup(key, now)).resolves.toEqual({ kind: "missing" });
  });

  it("returns manual review, rather than ordinary success, when final audit persistence fails", async () => {
    const fixture = fakeRule();
    const audit = new InMemoryAutomationAuditSink();
    const idempotency = new InMemoryAutomationIdempotencyStore();
    audit.failAppendAt(3);
    const result = await setup({ rule: fixture.rule, audit, idempotency }).executor.execute(request());
    const key = createAutomationIdempotencyKey({ organizationId: "trusted-org", ruleId: "test-rule", ruleVersion: "1", logicalExecutionId: "logical-1" });

    expect(result).toMatchObject({ kind: "requires_manual_review", attempted: true, reason: { code: "final_audit_unavailable" } });
    expect(fixture.calls()).toEqual({ evaluateCalls: 1, executeCalls: 1 });
    await expect(idempotency.lookup(key, now)).resolves.toMatchObject({ kind: "reserved" });
  });

  it("returns manual review when a final failure audit cannot be persisted", async () => {
    const fixture = fakeRule({ result: { kind: "failed", executionId: "ignored", attempted: true, reason: { code: "rule:provider", explanation: "Delivery failed." }, safeSummary: "Delivery failed." } });
    const audit = new InMemoryAutomationAuditSink();
    audit.failAppendAt(3);

    await expect(setup({ rule: fixture.rule, audit }).executor.execute(request())).resolves.toMatchObject({ kind: "requires_manual_review", attempted: true, reason: { code: "final_audit_unavailable" } });
    expect(fixture.calls().executeCalls).toBe(1);
  });

  it("preserves cancellation and manual-review results without executing a rule twice", async () => {
    const cancelled = fakeRule({ result: { kind: "cancelled", executionId: "ignored", safeSummary: "Cancelled safely." } });
    await expect(setup({ rule: cancelled.rule }).executor.execute(request())).resolves.toMatchObject({ kind: "cancelled", executionId: "execution-1" });
    expect(cancelled.calls().executeCalls).toBe(1);

    const manualReview = fakeRule({ result: { kind: "requires_manual_review", executionId: "ignored", attempted: true, reason: { code: "rule:ambiguous", explanation: "Outcome needs review." }, safeSummary: "Review required." } });
    await expect(setup({ rule: manualReview.rule }).executor.execute(request())).resolves.toMatchObject({ kind: "requires_manual_review", reason: { code: "rule:ambiguous" } });
    expect(manualReview.calls().executeCalls).toBe(1);
  });
});
