import { appointmentReadinessStates, type AppointmentReadinessState } from "@/lib/server/appointment-readiness";
import type { ReadinessTransition } from "@/lib/server/readiness-transitions";

export type ReadinessStaffAlertCategory = "readiness_achieved" | "document_regression" | "session_lost" | "blocked" | "cancelled";
export type ReadinessStaffAlertSeverity = "info" | "success" | "warning" | "error";

/** A safe Operations Feed projection of one readiness-transition audit event. */
export type ReadinessStaffAlert = Readonly<{
  id: string;
  organizationId: string;
  appointmentId: string;
  category: ReadinessStaffAlertCategory;
  severity: ReadinessStaffAlertSeverity;
  title: string;
  description: string;
  transitionCategory: ReadinessTransition["category"];
  createdAt: string;
  destinationUrl: string;
  idempotencyDiscriminator: string;
}>;

export type ReadinessTransitionAuditSource = Readonly<{
  id: string;
  organizationId: string;
  appointmentId: string;
  createdAt: string;
  previousState: AppointmentReadinessState;
  currentState: AppointmentReadinessState;
  transitionCategory: ReadinessTransition["category"];
  idempotencyDiscriminator: string;
}>;

/**
 * Derives the small, approved set of staff alerts. Persistence is intentionally
 * the existing readiness-transition audit event, not a parallel alert system.
 */
export function createReadinessAlertFromTransition(input: Readonly<{
  organizationId: string;
  appointmentId: string;
  transition: ReadinessTransition;
  createdAt: string;
}>): ReadinessStaffAlert | null {
  const { transition } = input;
  if (!transition.meaningful) return null;

  if (transition.previousState === "waiting_for_session" && transition.currentState === "ready_for_notary") {
    return alert(input, "readiness_achieved", "success", "Ready for notarization", "Payment and document preparation are complete, and the online session is available.");
  }
  if (transition.previousState === "ready_for_notary" && transition.currentState === "waiting_for_replacement") {
    return alert(input, "document_regression", "warning", "Document replacement needed", "The appointment is no longer ready because a document requires replacement.");
  }
  if (transition.previousState === "ready_for_notary" && transition.currentState === "waiting_for_session") {
    return alert(input, "session_lost", "warning", "Online session unavailable", "The appointment is waiting for a new or restored online session.");
  }
  if (transition.currentState === "blocked" && isActiveState(transition.previousState)) {
    return alert(input, "blocked", "error", "Appointment requires attention", "The appointment is blocked and needs staff review.");
  }
  if (transition.currentState === "cancelled" && isActiveState(transition.previousState)) {
    return alert(input, "cancelled", "warning", "Appointment cancelled", "The appointment is no longer active.");
  }
  return null;
}

/** Maps safe persisted audit facts into the same alert projection. */
export function readinessAlertFromAudit(source: ReadinessTransitionAuditSource): ReadinessStaffAlert | null {
  return createReadinessAlertFromTransition({
    organizationId: source.organizationId,
    appointmentId: source.appointmentId,
    createdAt: source.createdAt,
    transition: {
      previousState: source.previousState,
      currentState: source.currentState,
      changed: source.previousState !== source.currentState,
      meaningful: source.transitionCategory !== "no_change",
      category: source.transitionCategory,
      explanation: "",
      idempotencyDiscriminator: source.idempotencyDiscriminator
    }
  });
}

export function readinessTransitionAuditSource(value: Readonly<{
  id: string;
  organizationId: string;
  appointmentId: string;
  createdAt: string;
  metadata: unknown;
}>): ReadinessTransitionAuditSource | null {
  if (!value.metadata || typeof value.metadata !== "object" || Array.isArray(value.metadata)) return null;
  const metadata = value.metadata as Record<string, unknown>;
  if (!(isReadinessState(metadata.previousState)
    && isReadinessState(metadata.currentState)
    && isTransitionCategory(metadata.category)
    && typeof metadata.readinessTransitionDiscriminator === "string")) return null;
  return {
    id: value.id,
    organizationId: value.organizationId,
    appointmentId: value.appointmentId,
    createdAt: value.createdAt,
    previousState: metadata.previousState,
    currentState: metadata.currentState,
    transitionCategory: metadata.category,
    idempotencyDiscriminator: metadata.readinessTransitionDiscriminator
  };
}

function alert(
  input: Readonly<{ organizationId: string; appointmentId: string; transition: ReadinessTransition; createdAt: string }>,
  category: ReadinessStaffAlertCategory,
  severity: ReadinessStaffAlertSeverity,
  title: string,
  description: string
): ReadinessStaffAlert {
  const idempotencyDiscriminator = `${category}:${input.transition.idempotencyDiscriminator}`;
  return {
    id: `readiness-alert:${input.organizationId}:${input.appointmentId}:${idempotencyDiscriminator}`,
    organizationId: input.organizationId,
    appointmentId: input.appointmentId,
    category,
    severity,
    title,
    description,
    transitionCategory: input.transition.category,
    createdAt: input.createdAt,
    destinationUrl: `/admin/appointments/${encodeURIComponent(input.appointmentId)}`,
    idempotencyDiscriminator
  };
}

function isActiveState(state: AppointmentReadinessState) {
  return !["completed", "cancelled"].includes(state);
}

function isReadinessState(value: unknown): value is AppointmentReadinessState {
  return typeof value === "string" && appointmentReadinessStates.includes(value as AppointmentReadinessState);
}

function isTransitionCategory(value: unknown): value is ReadinessTransition["category"] {
  return typeof value === "string" && ["no_change", "payment_progress", "document_progress", "document_regression", "session_progress", "readiness_achieved", "readiness_lost", "blocked", "terminal"].includes(value);
}
