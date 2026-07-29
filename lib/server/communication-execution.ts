import type { OperationsFeedEventType, OperationsFeedSeverity } from "@/lib/server/operations-feed";
import type { QueueCommunicationAction } from "@/lib/server/automation/appointment-rules";
import { automationError, type AutomationError, type AutomationRetryClassification } from "@/lib/server/automation/errors";
import { createAutomationIdempotencyKey, type AutomationIdempotencyStore } from "@/lib/server/automation/idempotency";
import type { AutomationClock, AutomationIdGenerator } from "@/lib/server/automation/types";

export type CommunicationChannel = "email" | "sms" | "push" | "in_app";
export type CommunicationDeliveryStatus = "delivered" | "queued" | "failed" | "skipped" | "cancelled" | "unsupported";

export type CommunicationRequest = {
  readonly requestId: string;
  readonly organizationId: string;
  readonly customerId: string;
  readonly appointmentId: string;
  readonly purpose: QueueCommunicationAction["purpose"];
  readonly preferredChannel: CommunicationChannel;
  readonly fallbackChannels: readonly CommunicationChannel[];
  readonly locale: "en-US";
  readonly safeMetadata: QueueCommunicationAction["safeMetadata"];
  readonly sourceRuleId: string;
  readonly sourceRuleVersion: string;
  readonly sourceEventId: string;
  readonly correlationId: string;
  readonly recipient: string;
};

export type CommunicationProviderResponse = {
  readonly status: CommunicationDeliveryStatus;
  readonly safeSummary: string;
  readonly retryClassification: AutomationRetryClassification;
  readonly sideEffectsMayHaveOccurred: boolean;
};

export interface CommunicationProvider {
  readonly id: string;
  supports(channel: CommunicationChannel): boolean;
  send(request: CommunicationRequest): Promise<CommunicationProviderResponse>;
}

export type CommunicationExecutionAuditEvent = "execution_started" | "provider_selected" | "provider_result" | "execution_completed";
export type CommunicationExecutionAuditRecord = {
  readonly event: CommunicationExecutionAuditEvent;
  readonly organizationId: string;
  readonly requestId: string;
  readonly correlationId: string;
  readonly provider: string | null;
  readonly occurredAt: string;
  readonly safeSummary: string;
};

export interface CommunicationExecutionAuditSink {
  append(record: CommunicationExecutionAuditRecord): Promise<void>;
}

export type CommunicationTimelineEntry = {
  readonly organizationId: string;
  readonly appointmentId: string;
  readonly customerId: string;
  readonly sourceEventId: string;
  readonly eventType: "confirmation_sent" | "cancellation_sent" | "reminder_sent" | "follow_up_sent" | "review_request_sent";
  readonly safeSummary: string;
};

export type CommunicationOperationsFeedEntry = {
  readonly organizationId: string;
  readonly appointmentId: string;
  readonly sourceEventId: string;
  readonly eventType: OperationsFeedEventType;
  readonly severity: OperationsFeedSeverity;
  readonly occurredAt: string;
  readonly title: string;
  readonly description: string;
};

export type CommunicationExecutionResult = {
  readonly request: CommunicationRequest;
  readonly status: CommunicationDeliveryStatus;
  readonly provider: string | null;
  readonly occurredAt: string;
  readonly retryClassification: AutomationRetryClassification;
  readonly safeSummary: string;
  readonly correlationId: string;
  readonly error: AutomationError | null;
  readonly timelineEntry: CommunicationTimelineEntry | null;
  readonly operationsFeedEntry: CommunicationOperationsFeedEntry | null;
};

export type CommunicationsExecutionDependencies = {
  readonly providers: readonly CommunicationProvider[];
  readonly idempotency: AutomationIdempotencyStore;
  readonly audit: CommunicationExecutionAuditSink;
  readonly clock: AutomationClock;
  readonly idGenerator: AutomationIdGenerator;
};

export class CommunicationsExecutionEngine {
  constructor(private readonly dependencies: CommunicationsExecutionDependencies) {}

  async execute(action: QueueCommunicationAction): Promise<CommunicationExecutionResult> {
    const validation = validateAction(action);
    if (validation) return this.result(null, "unsupported", null, validation.safeSummary, validation.retryClassification, validation);
    const request = this.requestFromAction(action);
    const now = this.dependencies.clock.now();
    const key = createAutomationIdempotencyKey({ organizationId: request.organizationId, ruleId: request.sourceRuleId, ruleVersion: request.sourceRuleVersion, logicalExecutionId: request.sourceEventId, policyDiscriminator: `${request.purpose}:${request.safeMetadata.reminderWindow ?? ""}` });
    try {
      const reservation = await this.dependencies.idempotency.reserve({ key, organizationId: request.organizationId, ruleId: request.sourceRuleId, ruleVersion: request.sourceRuleVersion, logicalExecutionId: request.sourceEventId, now, expiresAt: new Date(now.getTime() + 5 * 60 * 1000) });
      if (reservation.kind !== "reserved") return this.result(request, "skipped", null, "A communication for this source event was already processed.", "duplicate", automationError("duplicate", "duplicate_execution", "A communication for this source event was already processed.", "duplicate"));
    } catch {
      return this.result(request, "failed", null, "The communication duplicate guard is unavailable.", "manual_review", automationError("idempotency", "idempotency_unavailable", "The communication duplicate guard is unavailable.", "manual_review"));
    }

    if (!await this.audit(request, "execution_started", null, "Communication execution started.")) {
      await this.dependencies.idempotency.release(key).catch(() => undefined);
      return this.result(request, "failed", null, "Communication execution could not be audited before delivery.", "manual_review", automationError("audit", "audit_unavailable", "Communication execution could not be audited before delivery.", "manual_review"));
    }
    const provider = this.dependencies.providers.find((candidate) => candidate.supports(request.preferredChannel));
    if (!provider) {
      await this.audit(request, "execution_completed", null, "No provider supports the requested communication channel.");
      await this.dependencies.idempotency.release(key).catch(() => undefined);
      return this.result(request, "unsupported", null, "No provider supports the requested communication channel.", "unsupported", automationError("configuration", "unsupported", "No provider supports the requested communication channel.", "unsupported"));
    }
    if (!await this.audit(request, "provider_selected", provider.id, "Communication provider selected.")) {
      await this.dependencies.idempotency.release(key).catch(() => undefined);
      return this.result(request, "failed", provider.id, "Communication provider selection could not be audited.", "manual_review", automationError("audit", "audit_unavailable", "Communication provider selection could not be audited.", "manual_review"));
    }

    let response: CommunicationProviderResponse;
    try {
      response = await provider.send(request);
    } catch {
      return this.result(request, "failed", provider.id, "The communication provider did not return a safe delivery result.", "manual_review", automationError("unexpected", "execution_failed", "The communication provider did not return a safe delivery result.", "manual_review"));
    }
    const recorded = await this.audit(request, "provider_result", provider.id, response.safeSummary) && await this.audit(request, "execution_completed", provider.id, "Communication execution completed.");
    if (!recorded) return this.result(request, "failed", provider.id, "Communication delivery may have completed, but its audit record is incomplete.", "manual_review", automationError("audit", "final_audit_unavailable", "Communication delivery may have completed, but its audit record is incomplete.", "manual_review"));
    if (response.status === "delivered" || response.status === "queued") {
      try {
        await this.dependencies.idempotency.complete(key, this.dependencies.clock.now());
      } catch {
        return this.result(request, "failed", provider.id, "Communication delivery completed, but its duplicate guard could not be finalized.", "manual_review", automationError("idempotency", "idempotency_completion_failed", "Communication delivery completed, but its duplicate guard could not be finalized.", "manual_review"));
      }
    } else if (!response.sideEffectsMayHaveOccurred) {
      await this.dependencies.idempotency.release(key).catch(() => undefined);
    }
    return this.result(request, response.status, provider.id, response.safeSummary, response.retryClassification, response.status === "failed" ? automationError("rule", "execution_failed", response.safeSummary, response.retryClassification) : null);
  }

  private requestFromAction(action: QueueCommunicationAction): CommunicationRequest {
    const requestId = this.dependencies.idGenerator.next();
    return { requestId, organizationId: action.organizationId, customerId: action.customerId, appointmentId: action.appointmentId, purpose: action.purpose, preferredChannel: "email", fallbackChannels: [], locale: "en-US", safeMetadata: action.safeMetadata, sourceRuleId: action.sourceRuleId!, sourceRuleVersion: action.sourceRuleVersion!, sourceEventId: action.sourceEventId, correlationId: action.sourceEventId, recipient: action.recipientEmail };
  }

  private async audit(request: CommunicationRequest, event: CommunicationExecutionAuditEvent, provider: string | null, safeSummary: string) {
    try {
      await this.dependencies.audit.append({ event, organizationId: request.organizationId, requestId: request.requestId, correlationId: request.correlationId, provider, occurredAt: this.dependencies.clock.now().toISOString(), safeSummary });
      return true;
    } catch {
      return false;
    }
  }

  private result(request: CommunicationRequest | null, status: CommunicationDeliveryStatus, provider: string | null, safeSummary: string, retryClassification: AutomationRetryClassification, error: AutomationError | null): CommunicationExecutionResult {
    const current = request ?? { requestId: "invalid", organizationId: "", customerId: "", appointmentId: "", purpose: "appointment_confirmation" as const, preferredChannel: "email" as const, fallbackChannels: [], locale: "en-US" as const, safeMetadata: { appointmentStatus: "awaiting_review" as const }, sourceRuleId: "", sourceRuleVersion: "", sourceEventId: "", correlationId: "", recipient: "" };
    const occurredAt = this.dependencies.clock.now().toISOString();
    return { request: current, status, provider, occurredAt, retryClassification, safeSummary, correlationId: current.correlationId, error, timelineEntry: status === "delivered" ? timeline(current, safeSummary) : null, operationsFeedEntry: feed(current, status, occurredAt, safeSummary) };
  }
}

function validateAction(action: QueueCommunicationAction): AutomationError | null {
  if (!action || action.type !== "queue_communication" || !action.organizationId || !action.customerId || !action.appointmentId || !action.sourceEventId || !action.sourceRuleId || !action.sourceRuleVersion || !action.recipientEmail) {
    return automationError("validation", "invalid_request", "The communication action is incomplete.", "non_retryable");
  }
  return null;
}

function timeline(request: CommunicationRequest, safeSummary: string): CommunicationTimelineEntry {
  const eventType = request.purpose === "appointment_confirmation" ? "confirmation_sent" : request.purpose === "appointment_cancellation" ? "cancellation_sent" : request.purpose === "appointment_reminder" ? "reminder_sent" : request.purpose === "appointment_follow_up" ? "follow_up_sent" : "review_request_sent";
  return { organizationId: request.organizationId, appointmentId: request.appointmentId, customerId: request.customerId, sourceEventId: request.sourceEventId, eventType, safeSummary };
}

function feed(request: CommunicationRequest, status: CommunicationDeliveryStatus, occurredAt: string, safeSummary: string): CommunicationOperationsFeedEntry | null {
  if (status !== "delivered" && status !== "queued" && status !== "failed") return null;
  const eventType = status === "delivered" ? "communication_sent" : status === "queued" ? "communication_queued" : "communication_failed";
  return { organizationId: request.organizationId, appointmentId: request.appointmentId, sourceEventId: request.sourceEventId, eventType, severity: status === "failed" ? "error" : status === "delivered" ? "success" : "info", occurredAt, title: status === "failed" ? "Communication failed" : status === "delivered" ? "Communication delivered" : "Communication queued", description: safeSummary };
}
