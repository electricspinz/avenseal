import type { AppointmentStatus } from "@/lib/types";
import type { OperationsFeedEventType, OperationsFeedSeverity } from "@/lib/server/operations-feed";
import { InMemoryAutomationRegistry } from "@/lib/server/automation/registry";
import type { AutomationContext, AutomationEligibility, AutomationReason, AutomationResult, AutomationRule, AutomationRuleExecutionRequest } from "@/lib/server/automation/types";

export type AppointmentCommunicationPurpose =
  | "appointment_confirmation"
  | "appointment_cancellation"
  | "appointment_reminder"
  | "appointment_follow_up"
  | "review_request";

export type AppointmentTimelineEventType =
  | "appointment_created"
  | "confirmation_queued"
  | "appointment_confirmed"
  | "appointment_cancelled"
  | "reminder_queued"
  | "follow_up_queued"
  | "review_request_queued";

export type AppointmentEventBase = {
  readonly eventId: string;
  readonly organizationId: string;
  readonly appointmentId: string;
  readonly customerId: string | null;
  readonly customerOrganizationId: string | null;
  readonly customerEmail: string | null;
  readonly occurredAt: string;
  readonly appointmentStatus: AppointmentStatus;
  readonly appointmentStartsAt: string | null;
};

export type AppointmentCreatedEvent = AppointmentEventBase & { readonly type: "appointment_created" };
export type AppointmentConfirmedEvent = AppointmentEventBase & { readonly type: "appointment_confirmed"; readonly confirmationOrganizationId: string };
export type AppointmentCancelledEvent = AppointmentEventBase & { readonly type: "appointment_cancelled"; readonly cancellationOrganizationId: string };
export type ReminderWindowReachedEvent = AppointmentEventBase & { readonly type: "reminder_window_reached"; readonly reminderWindow: "24h" | "2h"; readonly reminderState: "not_queued" | "queued" | "sent" };
export type AppointmentCompletedEvent = AppointmentEventBase & { readonly type: "appointment_completed"; readonly completedAt: string; readonly followUpState: "not_queued" | "queued" | "sent"; readonly reviewRequestState: "not_queued" | "queued" | "sent"; readonly reviewRequestAllowed: boolean };

export type AppointmentLifecycleEvent = AppointmentCreatedEvent | AppointmentConfirmedEvent | AppointmentCancelledEvent | ReminderWindowReachedEvent | AppointmentCompletedEvent;

export type AppointmentAutomationContext = AutomationContext & { readonly event: AppointmentLifecycleEvent };

export type QueueCommunicationAction = {
  readonly type: "queue_communication";
  readonly organizationId: string;
  readonly appointmentId: string;
  readonly customerId: string;
  readonly purpose: AppointmentCommunicationPurpose;
  readonly sourceEventId: string;
  readonly recipientEmail: string;
  readonly scheduling: { readonly kind: "immediate" } | { readonly kind: "delayed"; readonly notBefore: string };
  readonly safeMetadata: { readonly appointmentStatus: AppointmentStatus; readonly reminderWindow?: "24h" | "2h" };
};

export type CreateTimelineEntryAction = {
  readonly type: "create_timeline_entry";
  readonly organizationId: string;
  readonly appointmentId: string;
  readonly customerId: string | null;
  readonly eventType: AppointmentTimelineEventType;
  readonly sourceEventId: string;
  readonly safeSummary: string;
};

export type UpdateAppointmentStatusAction = {
  readonly type: "update_appointment_status";
  readonly organizationId: string;
  readonly appointmentId: string;
  readonly status: AppointmentStatus;
  readonly sourceEventId: string;
  readonly safeSummary: string;
};

export type CreateOperationsFeedEntryAction = {
  readonly type: "create_operations_feed_entry";
  readonly organizationId: string;
  readonly appointmentId: string;
  readonly sourceEventId: string;
  readonly eventType: OperationsFeedEventType;
  readonly severity: OperationsFeedSeverity;
  readonly occurredAt: string;
  readonly title: string;
  readonly description: string;
};

export type AppointmentAutomationAction = QueueCommunicationAction | CreateTimelineEntryAction | UpdateAppointmentStatusAction | CreateOperationsFeedEntryAction;
export type AppointmentAutomationActions = { readonly actions: readonly AppointmentAutomationAction[] };

const terminalStatuses: readonly AppointmentStatus[] = ["cancelled", "completed", "declined", "no_show"];

abstract class AppointmentRule<TEvent extends AppointmentLifecycleEvent> implements AutomationRule<AppointmentAutomationContext, AppointmentAutomationActions> {
  abstract readonly metadata: AutomationRule["metadata"];
  abstract readonly eventType: TEvent["type"];

  async evaluate(context: AppointmentAutomationContext): Promise<AutomationEligibility> {
    const event = context.event;
    if (!event || event.type !== this.eventType) return ineligible("invalid_context", "The automation event does not match this appointment rule.");
    const ownership = ownershipReason(context, event);
    if (ownership) return ineligible(ownership.code, ownership.explanation);
    return this.eligibility(event as TEvent);
  }

  async execute(request: AutomationRuleExecutionRequest<AppointmentAutomationContext>): Promise<AutomationResult<AppointmentAutomationActions>> {
    const event = request.context.event;
    const eligibility = await this.evaluate(request.context);
    if (eligibility.kind !== "eligible") {
      const failure = eligibility.reasons[0] ?? reason("invalid_context", "The appointment event is not eligible for this action.");
      return { kind: "failed", executionId: request.executionId, attempted: false, sideEffectsMayHaveOccurred: false, reason: failure, safeSummary: failure.explanation };
    }
    return { kind: "succeeded", executionId: request.executionId, data: { actions: this.actions(event as TEvent) }, safeSummary: "Appointment automation actions were described." };
  }

  protected abstract eligibility(event: TEvent): AutomationEligibility;
  protected abstract actions(event: TEvent): readonly AppointmentAutomationAction[];
}

export class AppointmentCreatedRule extends AppointmentRule<AppointmentCreatedEvent> {
  readonly metadata = { id: "appointment.created", version: "1", name: "Appointment created", requiresHumanApproval: false, idempotencyDiscriminator: "appointment-created" };
  readonly eventType = "appointment_created" as const;

  protected eligibility(event: AppointmentCreatedEvent) {
    if (!hasCustomer(event) || !canCommunicate(event)) return ineligible("invalid_context", "The appointment customer could not be verified.");
    if (event.appointmentStatus === "cancelled") return ineligible("ineligible", "Cancelled appointments do not create confirmation actions.");
    if (!isFuture(event.appointmentStartsAt, event.occurredAt)) return ineligible("invalid_context", "The appointment must be scheduled in the future.");
    return eligible();
  }

  protected actions(event: AppointmentCreatedEvent) {
    return [...communications(event, "appointment_confirmation", "immediate"), timeline(event, "appointment_created", "Appointment created."), feed(event, "appointment_created", "Appointment created", "A booking request was received.")];
  }
}

export class AppointmentConfirmedRule extends AppointmentRule<AppointmentConfirmedEvent> {
  readonly metadata = { id: "appointment.confirmed", version: "1", name: "Appointment confirmed", requiresHumanApproval: true, idempotencyDiscriminator: "appointment-confirmed" };
  readonly eventType = "appointment_confirmed" as const;

  protected eligibility(event: AppointmentConfirmedEvent) {
    if (event.confirmationOrganizationId !== event.organizationId) return ineligible("tenant_mismatch", "The confirmation does not belong to the appointment organization.");
    if (event.appointmentStatus === "cancelled" || terminalStatuses.includes(event.appointmentStatus)) return ineligible("unsupported", "The appointment is in an incompatible terminal state.");
    return eligible();
  }

  protected actions(event: AppointmentConfirmedEvent) {
    return [
      timeline(event, "appointment_confirmed", "Appointment confirmed."),
      ...(event.appointmentStatus === "confirmed" ? [] : [status(event, "confirmed", "Appointment confirmation should be recorded.")]),
      feed(event, "appointment_updated", "Appointment confirmed", "The appointment was confirmed.")
    ];
  }
}

export class AppointmentCancelledRule extends AppointmentRule<AppointmentCancelledEvent> {
  readonly metadata = { id: "appointment.cancelled", version: "1", name: "Appointment cancelled", requiresHumanApproval: false, idempotencyDiscriminator: "appointment-cancelled" };
  readonly eventType = "appointment_cancelled" as const;

  protected eligibility(event: AppointmentCancelledEvent) {
    if (event.cancellationOrganizationId !== event.organizationId) return ineligible("tenant_mismatch", "The cancellation does not belong to the appointment organization.");
    if (event.appointmentStatus !== "cancelled") return ineligible("invalid_context", "The appointment cancellation event must represent a cancelled appointment.");
    return eligible();
  }

  protected actions(event: AppointmentCancelledEvent) {
    return [
      timeline(event, "appointment_cancelled", "Appointment cancelled."),
      ...communications(event, "appointment_cancellation", "immediate"),
      feed(event, "appointment_updated", "Appointment cancelled", "The appointment was cancelled.")
    ];
  }
}

export class AppointmentReminderDueRule extends AppointmentRule<ReminderWindowReachedEvent> {
  readonly metadata = { id: "appointment.reminder-due", version: "1", name: "Appointment reminder due", requiresHumanApproval: false, idempotencyDiscriminator: "appointment-reminder" };
  readonly eventType = "reminder_window_reached" as const;

  protected eligibility(event: ReminderWindowReachedEvent) {
    if (!hasCustomer(event) || !canCommunicate(event)) return ineligible("invalid_context", "A reminder requires a verified customer recipient.");
    if (terminalStatuses.includes(event.appointmentStatus)) return ineligible("unsupported", "The appointment is not active for reminders.");
    if (!isFuture(event.appointmentStartsAt, event.occurredAt)) return ineligible("invalid_context", "The appointment must still be in the future for a reminder.");
    if (event.reminderState !== "not_queued") return ineligible("ineligible", "The reminder was already queued or sent.");
    return eligible();
  }

  protected actions(event: ReminderWindowReachedEvent) {
    return [...communications(event, "appointment_reminder", "immediate", event.reminderWindow), timeline(event, "reminder_queued", "Appointment reminder queued.")];
  }
}

export class AppointmentFollowUpDueRule extends AppointmentRule<AppointmentCompletedEvent> {
  readonly metadata = { id: "appointment.follow-up-due", version: "1", name: "Appointment follow-up due", requiresHumanApproval: false, idempotencyDiscriminator: "appointment-follow-up" };
  readonly eventType = "appointment_completed" as const;

  protected eligibility(event: AppointmentCompletedEvent) {
    if (!hasCustomer(event) || !canCommunicate(event)) return ineligible("invalid_context", "A follow-up requires a verified customer recipient.");
    if (event.appointmentStatus !== "completed") return ineligible("unsupported", "Only completed appointments can receive follow-up actions.");
    if (event.followUpState !== "not_queued") return ineligible("ineligible", "The follow-up was already queued or sent.");
    if (!isTimestamp(event.completedAt)) return ineligible("invalid_context", "The appointment completion time is invalid.");
    return eligible();
  }

  protected actions(event: AppointmentCompletedEvent) {
    const delayedUntil = new Date(Date.parse(event.completedAt) + 24 * 60 * 60 * 1000).toISOString();
    return [
      ...communications(event, "appointment_follow_up", { kind: "delayed", notBefore: delayedUntil }),
      ...(event.reviewRequestAllowed && event.reviewRequestState === "not_queued" ? communications(event, "review_request", { kind: "delayed", notBefore: delayedUntil }) : []),
      timeline(event, "follow_up_queued", "Appointment follow-up queued."),
      ...(event.reviewRequestAllowed && event.reviewRequestState === "not_queued" ? [timeline(event, "review_request_queued", "Review request queued.")] : [])
    ];
  }
}

export function createAppointmentAutomationRegistry() {
  return new InMemoryAutomationRegistry([new AppointmentCreatedRule(), new AppointmentConfirmedRule(), new AppointmentCancelledRule(), new AppointmentReminderDueRule(), new AppointmentFollowUpDueRule()]);
}

function ownershipReason(context: AppointmentAutomationContext, event: AppointmentLifecycleEvent): AutomationReason | null {
  if (context.organizationId !== event.organizationId) return reason("tenant_mismatch", "The event organization does not match the trusted automation context.");
  if (event.customerId && event.customerOrganizationId !== event.organizationId) return reason("tenant_mismatch", "The customer does not belong to the appointment organization.");
  return null;
}

function eligible(): AutomationEligibility {
  return { kind: "eligible", reasons: [] };
}

function ineligible(code: AutomationReason["code"], explanation: string): AutomationEligibility {
  return { kind: code === "tenant_mismatch" ? "invalid_context" : "ineligible", reasons: [reason(code, explanation)] };
}

function reason(code: AutomationReason["code"], explanation: string): AutomationReason {
  return { code, explanation };
}

function hasCustomer(event: AppointmentEventBase) {
  return Boolean(event.customerId && event.customerOrganizationId === event.organizationId);
}

function canCommunicate(event: AppointmentEventBase): event is AppointmentEventBase & { readonly customerId: string; readonly customerEmail: string } {
  return Boolean(event.customerId && event.customerEmail);
}

function isFuture(timestamp: string | null, reference: string) {
  return Boolean(timestamp && isTimestamp(timestamp) && isTimestamp(reference) && Date.parse(timestamp) > Date.parse(reference));
}

function isTimestamp(value: string) {
  return Number.isFinite(Date.parse(value));
}

function communication(event: AppointmentEventBase & { readonly customerId: string; readonly customerEmail: string }, purpose: AppointmentCommunicationPurpose, scheduling: QueueCommunicationAction["scheduling"] | "immediate", reminderWindow?: "24h" | "2h"): QueueCommunicationAction {
  return { type: "queue_communication", organizationId: event.organizationId, appointmentId: event.appointmentId, customerId: event.customerId, purpose, sourceEventId: event.eventId, recipientEmail: event.customerEmail, scheduling: scheduling === "immediate" ? { kind: "immediate" } : scheduling, safeMetadata: { appointmentStatus: event.appointmentStatus, ...(reminderWindow ? { reminderWindow } : {}) } };
}

function communications(event: AppointmentEventBase, purpose: AppointmentCommunicationPurpose, scheduling: QueueCommunicationAction["scheduling"] | "immediate", reminderWindow?: "24h" | "2h"): QueueCommunicationAction[] {
  return canCommunicate(event) ? [communication(event, purpose, scheduling, reminderWindow)] : [];
}

function timeline(event: AppointmentEventBase, eventType: AppointmentTimelineEventType, safeSummary: string): CreateTimelineEntryAction {
  return { type: "create_timeline_entry", organizationId: event.organizationId, appointmentId: event.appointmentId, customerId: event.customerId, eventType, sourceEventId: event.eventId, safeSummary };
}

function status(event: AppointmentEventBase, nextStatus: AppointmentStatus, safeSummary: string): UpdateAppointmentStatusAction {
  return { type: "update_appointment_status", organizationId: event.organizationId, appointmentId: event.appointmentId, status: nextStatus, sourceEventId: event.eventId, safeSummary };
}

function feed(event: AppointmentEventBase, eventType: OperationsFeedEventType, title: string, description: string): CreateOperationsFeedEntryAction {
  return { type: "create_operations_feed_entry", organizationId: event.organizationId, appointmentId: event.appointmentId, sourceEventId: event.eventId, eventType, severity: "info", occurredAt: event.occurredAt, title, description };
}
