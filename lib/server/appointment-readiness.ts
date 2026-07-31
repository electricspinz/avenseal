import type { AppointmentStatus, PaymentStatus } from "@/lib/types";
import type { AppointmentDocumentStatus } from "@/lib/server/document-review";
import type { ExternalSessionStatus } from "@/lib/server/external-sessions";

/**
 * A derived, server-only statement of whether an appointment can proceed.
 *
 * This model is deliberately independent of presentation and persistence. It
 * consumes trusted records that have already been loaded through their owning
 * repository boundaries; it neither changes appointment state nor treats an
 * external provider session as proof that notarization is complete.
 */
export const appointmentReadinessStates = [
  "waiting_for_payment",
  "waiting_for_documents",
  "waiting_for_review",
  "waiting_for_replacement",
  "waiting_for_session",
  "ready_for_notary",
  "in_progress",
  "completed",
  "cancelled",
  "blocked"
] as const;

export type AppointmentReadinessState = (typeof appointmentReadinessStates)[number];

export const appointmentReadinessBlockers = [
  "appointment_requires_review",
  "appointment_requires_clarification",
  "appointment_requires_follow_up",
  "appointment_declined",
  "appointment_no_show",
  "payment_required",
  "payment_requires_review",
  "documents_required",
  "documents_need_replacement",
  "documents_pending_review",
  "external_session_required",
  "external_session_cancelled",
  "external_session_completion_pending",
  "dependency_scope_mismatch"
] as const;

export type AppointmentReadinessBlocker = (typeof appointmentReadinessBlockers)[number];

export const appointmentReadinessPrerequisiteStates = [
  "complete",
  "required",
  "waiting",
  "under_review",
  "needs_replacement",
  "available",
  "in_progress",
  "blocked",
  "not_applicable"
] as const;

export type AppointmentReadinessPrerequisiteState = (typeof appointmentReadinessPrerequisiteStates)[number];
export type AppointmentReadinessPrerequisiteKey = "appointment" | "payment" | "documents" | "online_session";
export type AppointmentReadinessPrerequisite = Readonly<{
  key: AppointmentReadinessPrerequisiteKey;
  label: string;
  state: AppointmentReadinessPrerequisiteState;
}>;

export type AppointmentReadiness = Readonly<{
  state: AppointmentReadinessState;
  blockers: readonly AppointmentReadinessBlocker[];
  /** A safe, stable description for future server-side projections. */
  summary: string;
  /** Safe, presentation-ready facts; never source records or identifiers. */
  prerequisites: readonly AppointmentReadinessPrerequisite[];
}>;

export type AppointmentReadinessDocument = Readonly<{
  organizationId: string;
  appointmentId: string;
  status: AppointmentDocumentStatus;
  deletedAt: string | null;
}>;

export type AppointmentReadinessExternalSession = Readonly<{
  organizationId: string;
  appointmentId: string;
  status: ExternalSessionStatus;
}>;

export type AppointmentReadinessInput = Readonly<{
  organizationId: string;
  appointmentId: string;
  appointmentStatus: AppointmentStatus;
  paymentStatus: PaymentStatus | null;
  documents: readonly AppointmentReadinessDocument[];
  externalSession: AppointmentReadinessExternalSession | null;
  /**
   * Defaults to required. A future durable organization setting may provide
   * `false`; callers must not derive this from browser input or a service name.
   */
  documentsRequired?: boolean;
}>;

type AppointmentReadinessEvaluation = Omit<AppointmentReadiness, "prerequisites">;

function result(state: AppointmentReadinessState, summary: string, ...blockers: AppointmentReadinessBlocker[]): AppointmentReadinessEvaluation {
  return { state, blockers, summary };
}

function dependenciesMatch(input: AppointmentReadinessInput): boolean {
  return input.documents.every((document) => document.organizationId === input.organizationId && document.appointmentId === input.appointmentId)
    && (!input.externalSession || (input.externalSession.organizationId === input.organizationId && input.externalSession.appointmentId === input.appointmentId));
}

function appointmentHold(input: AppointmentReadinessInput): AppointmentReadinessEvaluation | null {
  switch (input.appointmentStatus) {
    case "cancelled":
      return result("cancelled", "This appointment has been cancelled.");
    case "completed":
      return result("completed", "This appointment is recorded as completed.");
    case "declined":
      return result("blocked", "This appointment was declined.", "appointment_declined");
    case "no_show":
      return result("blocked", "This appointment requires staff follow-up after a no-show.", "appointment_no_show");
    case "awaiting_review":
      return result("blocked", "This appointment requires staff review.", "appointment_requires_review");
    case "clarification_needed":
      return result("blocked", "This appointment requires clarification.", "appointment_requires_clarification");
    case "follow_up_required":
      return result("blocked", "This appointment requires staff follow-up.", "appointment_requires_follow_up");
    default:
      return null;
  }
}

function paymentReadiness(paymentStatus: PaymentStatus | null): AppointmentReadinessEvaluation | null {
  if (paymentStatus === "paid") return null;
  if (["refunded", "partially_refunded", "disputed"].includes(paymentStatus ?? "")) {
    return result("blocked", "Payment requires staff review before this appointment can proceed.", "payment_requires_review");
  }
  return result("waiting_for_payment", "Payment is required before this appointment can proceed.", "payment_required");
}

function documentReadiness(input: AppointmentReadinessInput): AppointmentReadinessEvaluation | null {
  if (input.documentsRequired === false) return null;
  const activeDocuments = input.documents.filter((document) => document.deletedAt === null);
  if (activeDocuments.length === 0) {
    return result("waiting_for_documents", "Documents are required before this appointment can proceed.", "documents_required");
  }
  if (activeDocuments.some((document) => document.status === "rejected")) {
    return result("waiting_for_replacement", "A replacement document is required before this appointment can proceed.", "documents_need_replacement");
  }
  if (activeDocuments.some((document) => document.status === "uploaded")) {
    return result("waiting_for_review", "Uploaded documents are awaiting staff review.", "documents_pending_review");
  }
  return null;
}

function sessionReadiness(session: AppointmentReadinessExternalSession | null): AppointmentReadinessEvaluation {
  if (!session || session.status === "pending" || session.status === "unknown") {
    return result("waiting_for_session", "An online notarization session is not ready yet.", "external_session_required");
  }
  if (session.status === "cancelled") {
    return result("blocked", "The online notarization session was cancelled.", "external_session_cancelled");
  }
  if (session.status === "in_progress") {
    return result("in_progress", "The online notarization session is in progress.");
  }
  if (session.status === "completed") {
    return result("blocked", "The external session is complete and requires staff confirmation.", "external_session_completion_pending");
  }
  return result("ready_for_notary", "This appointment is ready for the online notarization session.");
}

function appointmentPrerequisite(status: AppointmentStatus): AppointmentReadinessPrerequisite {
  if (status === "completed") return { key: "appointment", label: "Appointment", state: "complete" };
  if (["cancelled", "declined", "no_show", "clarification_needed", "follow_up_required"].includes(status)) return { key: "appointment", label: "Appointment", state: "blocked" };
  if (status === "awaiting_review") return { key: "appointment", label: "Appointment", state: "waiting" };
  return { key: "appointment", label: "Appointment", state: "complete" };
}

function paymentPrerequisite(status: PaymentStatus | null): AppointmentReadinessPrerequisite {
  if (status === "paid") return { key: "payment", label: "Payment", state: "complete" };
  if (["refunded", "partially_refunded", "disputed"].includes(status ?? "")) return { key: "payment", label: "Payment", state: "blocked" };
  return { key: "payment", label: "Payment", state: "required" };
}

function documentPrerequisite(input: AppointmentReadinessInput): AppointmentReadinessPrerequisite {
  if (input.documentsRequired === false) return { key: "documents", label: "Documents", state: "not_applicable" };
  const activeDocuments = input.documents.filter((document) => document.deletedAt === null);
  if (activeDocuments.length === 0) return { key: "documents", label: "Documents", state: "required" };
  if (activeDocuments.some((document) => document.status === "rejected")) return { key: "documents", label: "Documents", state: "needs_replacement" };
  if (activeDocuments.some((document) => document.status === "uploaded")) return { key: "documents", label: "Documents", state: "under_review" };
  return { key: "documents", label: "Documents", state: "complete" };
}

function sessionPrerequisite(session: AppointmentReadinessExternalSession | null): AppointmentReadinessPrerequisite {
  if (!session || session.status === "pending" || session.status === "unknown") return { key: "online_session", label: "Online Session", state: "waiting" };
  if (session.status === "scheduled" || session.status === "ready") return { key: "online_session", label: "Online Session", state: "available" };
  if (session.status === "in_progress") return { key: "online_session", label: "Online Session", state: "in_progress" };
  return { key: "online_session", label: "Online Session", state: "blocked" };
}

function prerequisites(input: AppointmentReadinessInput): readonly AppointmentReadinessPrerequisite[] {
  return [
    appointmentPrerequisite(input.appointmentStatus),
    paymentPrerequisite(input.paymentStatus),
    documentPrerequisite(input),
    sessionPrerequisite(input.externalSession)
  ];
}

/**
 * Evaluates readiness in precedence order: scoped data, terminal/held
 * appointment state, payment, documents, then external session state.
 */
export function calculateAppointmentReadiness(input: AppointmentReadinessInput): AppointmentReadiness {
  const evaluation = !dependenciesMatch(input)
    ? result("blocked", "Appointment readiness cannot be determined from mismatched records.", "dependency_scope_mismatch")
    : appointmentHold(input)
    ?? paymentReadiness(input.paymentStatus)
    ?? documentReadiness(input)
    ?? sessionReadiness(input.externalSession);
  return { ...evaluation, prerequisites: prerequisites(input) };
}
