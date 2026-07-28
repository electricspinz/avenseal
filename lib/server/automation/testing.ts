import type { AutomationAuditSink } from "@/lib/server/automation/audit";
import type { AutomationApprovalDecision, AutomationApprovalRequest, AutomationAuthorizationDecision, AutomationAuthorizationProvider, TrustedOrganizationRequest, TrustedOrganizationResolution } from "@/lib/server/automation/authorization";
import type { AutomationControlProvider, AutomationControlRequest, AutomationControlResolution } from "@/lib/server/automation/controls";
import type { AutomationActor, AutomationAuditRecord, AutomationClock, AutomationIdGenerator, AutomationRuleMetadata } from "@/lib/server/automation/types";

export class FixedAutomationControlProvider implements AutomationControlProvider {
  constructor(
    private readonly resolution: AutomationControlResolution = { state: "unsupported", reason: "Automation controls are not configured." },
    private readonly organizationResolutions: Readonly<Record<string, AutomationControlResolution>> = {}
  ) {}

  async resolve(request: AutomationControlRequest): Promise<AutomationControlResolution> {
    return { ...(this.organizationResolutions[request.organizationId] ?? this.resolution) };
  }
}

export class FixedAutomationAuthorizationProvider implements AutomationAuthorizationProvider {
  constructor(
    private readonly trustedOrganization: TrustedOrganizationResolution,
    private readonly authorization: AutomationAuthorizationDecision = { kind: "authorized" },
    private readonly approvalOverride?: AutomationApprovalDecision,
    private readonly consumedApprovalIds: ReadonlySet<string> = new Set()
  ) {}

  async resolveTrustedOrganization(request: TrustedOrganizationRequest): Promise<TrustedOrganizationResolution> {
    void request;
    return { ...this.trustedOrganization };
  }

  async authorizeExecution(input: { readonly actor: AutomationActor; readonly organizationId: string; readonly rule: AutomationRuleMetadata }): Promise<AutomationAuthorizationDecision> {
    void input;
    return { ...this.authorization };
  }

  async validateApproval(request: AutomationApprovalRequest): Promise<AutomationApprovalDecision> {
    if (this.approvalOverride) return { ...this.approvalOverride };
    if (!request.approval) return { kind: "missing", reason: "No approval was supplied." };
    if (request.approval.organizationId !== request.organizationId || request.approval.ruleId !== request.rule.id || request.approval.logicalExecutionId !== request.logicalExecutionId) {
      return { kind: "rejected", reason: "The approval does not apply to this execution." };
    }
    const expiresAt = Date.parse(request.approval.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= request.now.getTime() || this.consumedApprovalIds.has(request.approval.id)) {
      return { kind: "rejected", reason: "The approval is expired or already consumed." };
    }
    return { kind: "valid" };
  }
}

export class InMemoryAutomationAuditSink implements AutomationAuditSink {
  private readonly records: AutomationAuditRecord[] = [];
  private readonly failureOrdinals = new Set<number>();
  private appendCount = 0;
  private failuresRemaining = 0;

  failNextAppend(count = 1) {
    this.failuresRemaining += count;
  }

  failAppendAt(ordinal: number) {
    this.failureOrdinals.add(ordinal);
  }

  async append(record: AutomationAuditRecord): Promise<void> {
    this.appendCount += 1;
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error("Injected automation audit failure.");
    }
    if (this.failureOrdinals.has(this.appendCount)) {
      throw new Error("Injected automation audit failure.");
    }
    this.records.push(copyRecord(record));
  }

  all(): readonly AutomationAuditRecord[] {
    return this.records.map(copyRecord);
  }

  byExecutionId(executionId: string): readonly AutomationAuditRecord[] {
    return this.records.filter((record) => record.executionId === executionId).map(copyRecord);
  }

  byOrganizationId(organizationId: string): readonly AutomationAuditRecord[] {
    return this.records.filter((record) => record.organizationId === organizationId).map(copyRecord);
  }
}

export class FixedAutomationClock implements AutomationClock {
  constructor(private readonly current: Date) {}

  now(): Date {
    return new Date(this.current.getTime());
  }
}

export class IncrementingAutomationIdGenerator implements AutomationIdGenerator {
  private value = 0;

  constructor(private readonly prefix = "automation-execution") {}

  next(): string {
    this.value += 1;
    return `${this.prefix}-${this.value}`;
  }
}

function copyRecord(record: AutomationAuditRecord): AutomationAuditRecord {
  return { ...record, reasons: record.reasons.map((item) => ({ ...item })) };
}
