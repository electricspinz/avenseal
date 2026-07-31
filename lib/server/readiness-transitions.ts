import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppointmentReadiness, AppointmentReadinessState } from "@/lib/server/appointment-readiness";

/**
 * An informational, derived-readiness transition. This is deliberately not a
 * persisted readiness state and does not perform workflow actions.
 */
export type ReadinessTransitionCategory =
  | "no_change"
  | "payment_progress"
  | "document_progress"
  | "document_regression"
  | "session_progress"
  | "readiness_achieved"
  | "readiness_lost"
  | "blocked"
  | "terminal";

export type ReadinessTransition = Readonly<{
  previousState: AppointmentReadinessState;
  currentState: AppointmentReadinessState;
  changed: boolean;
  meaningful: boolean;
  category: ReadinessTransitionCategory;
  explanation: string;
  idempotencyDiscriminator: string;
}>;

export type ReadinessTransitionAuditRecord = Readonly<{
  organizationId: string;
  appointmentId: string;
  action: "appointment.readiness_changed";
  metadata: Readonly<{
    previousState: AppointmentReadinessState;
    currentState: AppointmentReadinessState;
    category: Exclude<ReadinessTransitionCategory, "no_change">;
    actorType: "system";
    readinessTransitionDiscriminator: string;
  }>;
}>;

export interface ReadinessTransitionAuditStore {
  hasTransition(scope: Readonly<{ organizationId: string; appointmentId: string; discriminator: string }>): Promise<boolean>;
  append(record: ReadinessTransitionAuditRecord): Promise<void>;
}

const activeStates: readonly AppointmentReadinessState[] = [
  "waiting_for_payment",
  "waiting_for_documents",
  "waiting_for_review",
  "waiting_for_replacement",
  "waiting_for_session",
  "ready_for_notary",
  "in_progress"
];

function isActive(state: AppointmentReadinessState) {
  return activeStates.includes(state);
}

function transition(
  previousState: AppointmentReadinessState,
  currentState: AppointmentReadinessState,
  category: ReadinessTransitionCategory,
  meaningful: boolean,
  explanation: string,
  idempotencyDiscriminator: string
): ReadinessTransition {
  return { previousState, currentState, changed: previousState !== currentState, meaningful, category, explanation, idempotencyDiscriminator };
}

/** Classifies already-calculated readiness; it never re-evaluates readiness rules. */
export function classifyReadinessTransition(
  previous: Pick<AppointmentReadiness, "state">,
  current: Pick<AppointmentReadiness, "state">,
  transitionDiscriminator: string
): ReadinessTransition {
  const idempotencyDiscriminator = validateTransitionDiscriminator(transitionDiscriminator);
  const previousState = previous.state;
  const currentState = current.state;

  if (previousState === currentState) {
    return transition(previousState, currentState, "no_change", false, "Appointment readiness did not change.", idempotencyDiscriminator);
  }
  if (isActive(previousState) && (currentState === "cancelled" || currentState === "completed")) {
    return transition(previousState, currentState, "terminal", true, "Appointment readiness reached a terminal state.", idempotencyDiscriminator);
  }
  if (isActive(previousState) && currentState === "blocked") {
    return transition(previousState, currentState, "blocked", true, "Appointment readiness requires staff attention.", idempotencyDiscriminator);
  }
  if (currentState === "waiting_for_replacement" && isActive(previousState)) {
    return transition(previousState, currentState, "document_regression", true, "Document readiness requires attention.", idempotencyDiscriminator);
  }
  if (previousState === "ready_for_notary" && isActive(currentState) && currentState !== "in_progress") {
    return transition(previousState, currentState, "readiness_lost", true, "The appointment is no longer ready for the online session.", idempotencyDiscriminator);
  }
  if (previousState === "waiting_for_payment" && ["waiting_for_documents", "waiting_for_review", "waiting_for_replacement", "waiting_for_session", "ready_for_notary", "in_progress"].includes(currentState)) {
    return transition(previousState, currentState, "payment_progress", true, "Payment readiness progressed.", idempotencyDiscriminator);
  }
  if (
    (previousState === "waiting_for_documents" && currentState === "waiting_for_review")
    || (previousState === "waiting_for_replacement" && currentState === "waiting_for_review")
    || (previousState === "waiting_for_review" && currentState === "waiting_for_session")
  ) {
    return transition(previousState, currentState, "document_progress", true, "Document readiness progressed.", idempotencyDiscriminator);
  }
  if (previousState === "waiting_for_session" && currentState === "ready_for_notary") {
    return transition(previousState, currentState, "session_progress", true, "The online session is ready.", idempotencyDiscriminator);
  }
  if (currentState === "in_progress" && isActive(previousState)) {
    return transition(previousState, currentState, "session_progress", true, "The online session is in progress.", idempotencyDiscriminator);
  }
  if (currentState === "ready_for_notary" && isActive(previousState)) {
    return transition(previousState, currentState, "readiness_achieved", true, "The appointment is ready for the online session.", idempotencyDiscriminator);
  }
  return transition(previousState, currentState, "no_change", false, "The readiness change is not an auditable transition.", idempotencyDiscriminator);
}

export function readinessTransitionAudit(input: Readonly<{ organizationId: string; appointmentId: string; transition: ReadinessTransition }>): ReadinessTransitionAuditRecord | null {
  if (!input.transition.meaningful || input.transition.category === "no_change") return null;
  return {
    organizationId: input.organizationId,
    appointmentId: input.appointmentId,
    action: "appointment.readiness_changed",
    metadata: {
      previousState: input.transition.previousState,
      currentState: input.transition.currentState,
      category: input.transition.category,
      actorType: "system",
      readinessTransitionDiscriminator: input.transition.idempotencyDiscriminator
    }
  };
}

/**
 * Narrow boundary for future trusted workflows. The caller supplies canonical
 * results plus a stable, persisted-fact discriminator after it changes data.
 */
export async function recordReadinessTransition(
  input: Readonly<{
    organizationId: string;
    appointmentId: string;
    previousReadiness: Pick<AppointmentReadiness, "state">;
    currentReadiness: Pick<AppointmentReadiness, "state">;
    transitionDiscriminator: string;
  }>,
  auditStore: ReadinessTransitionAuditStore
): Promise<ReadinessTransition & Readonly<{ auditRecorded: boolean }>> {
  const result = classifyReadinessTransition(input.previousReadiness, input.currentReadiness, input.transitionDiscriminator);
  const audit = readinessTransitionAudit({ organizationId: input.organizationId, appointmentId: input.appointmentId, transition: result });
  if (!audit) return { ...result, auditRecorded: false };

  const exists = await auditStore.hasTransition({ organizationId: input.organizationId, appointmentId: input.appointmentId, discriminator: result.idempotencyDiscriminator });
  if (exists) return { ...result, auditRecorded: false };
  await auditStore.append(audit);
  return { ...result, auditRecorded: true };
}

/** Adapter for the existing audit_logs persistence boundary. */
export function createSupabaseReadinessTransitionAuditStore(supabase: SupabaseClient): ReadinessTransitionAuditStore {
  return {
    async hasTransition(scope) {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id")
        .eq("organization_id", scope.organizationId)
        .eq("action", "appointment.readiness_changed")
        .eq("entity_type", "appointment_request")
        .eq("entity_id", scope.appointmentId)
        .contains("metadata", { readinessTransitionDiscriminator: scope.discriminator })
        .maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
    async append(record) {
      const { error } = await supabase.from("audit_logs").insert({
        organization_id: record.organizationId,
        action: record.action,
        entity_type: "appointment_request",
        entity_id: record.appointmentId,
        metadata: record.metadata
      });
      if (error) throw error;
    }
  };
}

function validateTransitionDiscriminator(value: string) {
  const normalized = value.trim();
  if (!/^[a-zA-Z0-9._:-]{1,200}$/.test(normalized)) {
    throw new Error("Readiness transition discriminator must be a stable safe identifier.");
  }
  return normalized;
}
