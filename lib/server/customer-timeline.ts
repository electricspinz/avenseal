import type { AppointmentTimelineEventType, CreateTimelineEntryAction } from "@/lib/server/automation/appointment-rules";
import type { CommunicationExecutionResult } from "@/lib/server/communication-execution";
import type { AutomationClock } from "@/lib/server/automation/types";

export type TimelineCategory = "appointment" | "communication" | "automation" | "payment" | "document" | "customer" | "staff" | "system";
export type TimelineOutcome = "informational" | "pending" | "succeeded" | "failed" | "skipped" | "cancelled" | "requires_attention";
export type TimelineType = AppointmentTimelineEventType | "appointment_status_changed" | "communication_queued" | "communication_delivered" | "communication_failed" | "communication_skipped" | "communication_cancelled" | "communication_unsupported" | "automation_completed" | "automation_skipped" | "automation_failed" | "automation_manual_review_required" | "duplicate_automation_blocked" | "payment_link_created" | "payment_requested" | "payment_received" | "payment_failed" | "payment_cancelled" | "payment_partially_refunded" | "payment_refunded" | "document_received" | "document_prepared" | "document_sent" | "document_signed" | "document_completed" | "document_failed" | "customer_created" | "customer_updated" | "staff_action_completed";
export type TimelineActor = { readonly kind: "customer" | "staff" | "automation" | "system" | "provider"; readonly actorId: string | null; readonly safeDisplayName: string | null };
export type TimelineSource = "appointment_service" | "automation_engine" | "communications_engine" | "payment_service" | "document_service" | "admin" | "public_booking" | "system";
export type TimelineMetadata = Readonly<Record<string, string | number | boolean | null>>;

export type TimelineEvent = Readonly<{ id: string; organizationId: string; customerId: string; appointmentId: string | null; category: TimelineCategory; type: TimelineType; outcome: TimelineOutcome; title: string; safeSummary: string; occurredAt: string; recordedAt: string; actor: TimelineActor; source: TimelineSource; correlationId: string | null; causationId: string | null; sourceEventId: string | null; automationExecutionId: string | null; automationRuleId: string | null; automationRuleVersion: string | null; communicationRequestId: string | null; paymentId: string | null; documentId: string | null; metadata: TimelineMetadata }>;
export type TimelineDraft = Omit<TimelineEvent, "id" | "recordedAt"> & { readonly id?: string; readonly recordedAt?: string };
export type TimelineQuery = { readonly organizationId: string; readonly customerId?: string; readonly appointmentId?: string; readonly category?: TimelineCategory; readonly outcome?: TimelineOutcome; readonly occurredFrom?: string; readonly occurredTo?: string; readonly limit?: number };
export type TimelineAppendResult = { readonly kind: "recorded" | "duplicate" | "rejected" | "failed"; readonly event: TimelineEvent | null; readonly safeSummary: string };

export interface TimelineStore { append(event: TimelineEvent): Promise<{ readonly kind: "recorded" | "duplicate"; readonly event: TimelineEvent }>; list(query: TimelineQuery): Promise<readonly TimelineEvent[]>; getById(organizationId: string, id: string): Promise<TimelineEvent | null>; }

export class InMemoryTimelineStore implements TimelineStore {
  private readonly events = new Map<string, TimelineEvent>();
  async append(event: TimelineEvent) { const key = `${event.organizationId}:${event.id}`; const existing = this.events.get(key); if (existing) return { kind: "duplicate" as const, event: copy(existing) }; this.events.set(key, copy(event)); return { kind: "recorded" as const, event: copy(event) }; }
  async getById(organizationId: string, id: string) { const event = this.events.get(`${organizationId}:${id}`); return event ? copy(event) : null; }
  async list(query: TimelineQuery) { return [...this.events.values()].filter((event) => event.organizationId === query.organizationId && (!query.customerId || event.customerId === query.customerId) && (!query.appointmentId || event.appointmentId === query.appointmentId) && (!query.category || event.category === query.category) && (!query.outcome || event.outcome === query.outcome) && (!query.occurredFrom || event.occurredAt >= query.occurredFrom) && (!query.occurredTo || event.occurredAt <= query.occurredTo)).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.recordedAt.localeCompare(a.recordedAt) || a.id.localeCompare(b.id)).slice(0, query.limit ?? 50).map(copy); }
  async reset() { this.events.clear(); }
}

export class TimelineRecorder {
  constructor(private readonly store: TimelineStore, private readonly clock: AutomationClock) {}
  async record(draft: TimelineDraft): Promise<TimelineAppendResult> {
    const error = validate(draft); if (error) return { kind: "rejected", event: null, safeSummary: error };
    const event: TimelineEvent = { ...draft, id: draft.id ?? timelineId(draft), recordedAt: draft.recordedAt ?? this.clock.now().toISOString(), metadata: { ...draft.metadata } };
    try { const result = await this.store.append(event); return { kind: result.kind, event: result.event, safeSummary: result.kind === "recorded" ? "Timeline event recorded." : "Timeline event already exists." }; } catch { return { kind: "failed", event: null, safeSummary: "Timeline event could not be recorded." }; }
  }
  listByCustomer(query: TimelineQuery) { return this.store.list(query); }
  listByAppointment(query: TimelineQuery & { readonly appointmentId: string }) { return this.store.list(query); }
}

export function timelineId(draft: Omit<TimelineDraft, "id" | "recordedAt">) { return [draft.organizationId, draft.type, draft.customerId, draft.appointmentId ?? "", draft.sourceEventId ?? "", draft.automationRuleVersion ?? "", draft.communicationRequestId ?? ""].map((value) => `${value.length}:${value}`).join("."); }

export function timelineFromAppointmentAction(action: CreateTimelineEntryAction, ruleId: string, ruleVersion: string, occurredAt: string): TimelineDraft { return { organizationId: action.organizationId, customerId: action.customerId ?? "", appointmentId: action.appointmentId, category: "appointment", type: action.eventType, outcome: "informational", title: title(action.eventType), safeSummary: action.safeSummary, occurredAt, actor: { kind: "automation", actorId: null, safeDisplayName: "Automation" }, source: "automation_engine", correlationId: action.sourceEventId, causationId: action.sourceEventId, sourceEventId: action.sourceEventId, automationExecutionId: null, automationRuleId: ruleId, automationRuleVersion: ruleVersion, communicationRequestId: null, paymentId: null, documentId: null, metadata: {} }; }

export function timelineFromCommunication(result: CommunicationExecutionResult): TimelineDraft { const type = result.status === "delivered" ? "communication_delivered" : result.status === "queued" ? "communication_queued" : result.status === "failed" ? "communication_failed" : result.status === "skipped" ? "communication_skipped" : result.status === "cancelled" ? "communication_cancelled" : "communication_unsupported"; const outcome: TimelineOutcome = result.status === "delivered" ? "succeeded" : result.status === "queued" ? "pending" : result.status === "failed" ? result.retryClassification === "manual_review" ? "requires_attention" : "failed" : result.status === "cancelled" ? "cancelled" : "skipped"; return { organizationId: result.request.organizationId, customerId: result.request.customerId, appointmentId: result.request.appointmentId, category: "communication", type, outcome, title: title(type), safeSummary: result.safeSummary, occurredAt: result.occurredAt, actor: { kind: "provider", actorId: result.provider, safeDisplayName: result.provider }, source: "communications_engine", correlationId: result.correlationId, causationId: result.request.sourceEventId, sourceEventId: result.request.sourceEventId, automationExecutionId: null, automationRuleId: result.request.sourceRuleId, automationRuleVersion: result.request.sourceRuleVersion, communicationRequestId: result.request.requestId, paymentId: null, documentId: null, metadata: { channel: result.request.preferredChannel } }; }

function validate(draft: TimelineDraft) { if (!draft.organizationId || !draft.customerId || !draft.title || !draft.safeSummary || !validDate(draft.occurredAt)) return "Timeline event is incomplete."; if (draft.safeSummary.length > 500 || /token|secret|password|authorization/i.test(Object.keys(draft.metadata).join(" "))) return "Timeline event contains unsafe metadata."; return null; }
function validDate(value: string) { return Number.isFinite(Date.parse(value)); }
function copy(event: TimelineEvent): TimelineEvent { return { ...event, actor: { ...event.actor }, metadata: { ...event.metadata } }; }
function title(type: TimelineType) { return type.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
