import type { AppointmentStatus, CommunicationMessage, PaymentStatus } from "@/lib/types";
import type { AppointmentDocumentStatus, DocumentScanStatus, DocumentStorageStatus } from "@/lib/server/document-repository";
import type { ExternalSessionStatus } from "@/lib/server/external-sessions";

export const appointmentNextActionKinds = ["no_action_required", "review_completion", "review_appointment", "review_payment", "review_payment_status", "waiting_for_customer_document", "security_processing", "review_document_security", "review_uploaded_document", "resolve_rejected_document", "provider_handoff", "prepare_session", "review_session_communication", "ready_for_appointment_review", "session_in_progress", "confirm_appointment_outcome", "resolve_cancelled_session"] as const;
export type AppointmentNextActionKind = (typeof appointmentNextActionKinds)[number];
export type AppointmentNextActionTone = "neutral" | "warning" | "danger" | "success" | "info";
export type AppointmentNextAction = Readonly<{ kind: AppointmentNextActionKind; title: string; description: string; ctaLabel?: string; targetId?: "status-management" | "payment" | "documents" | "client-workspace" | "communications" | "external-session"; tone: AppointmentNextActionTone; context?: string }>;
export type AppointmentNextActionDocument = Readonly<{ status: AppointmentDocumentStatus | string; scanStatus: DocumentScanStatus | string | null | undefined; storageStatus: DocumentStorageStatus | string | null | undefined; deletedAt: string | null }>;
export type AppointmentNextActionSession = Readonly<{ status: ExternalSessionStatus | string; customerVisible: boolean }> | null;
export type AppointmentNextActionInput = Readonly<{ appointmentStatus: AppointmentStatus | string; paymentStatus: PaymentStatus | string | null; documents: readonly AppointmentNextActionDocument[]; externalSession: AppointmentNextActionSession; communications: readonly Pick<CommunicationMessage, "messageType" | "status">[] }>;

const holdStatuses = new Set(["declined", "no_show", "clarification_needed", "awaiting_review", "follow_up_required"]);
const paymentReviewStatuses = new Set(["refunded", "partially_refunded", "disputed"]);
const documentStatuses = new Set(["uploaded", "approved", "rejected"]);
const scanStatuses = new Set(["pending", "clean", "infected", "suspicious", "failed"]);
const storageStatuses = new Set(["quarantined", "active", "removed"]);
const sessionStatuses = new Set(["pending", "scheduled", "ready", "in_progress", "completed", "cancelled", "unknown"]);

function action(kind: AppointmentNextActionKind, title: string, description: string, tone: AppointmentNextActionTone, ctaLabel?: string, targetId?: AppointmentNextAction["targetId"], context?: string): AppointmentNextAction { return { kind, title, description, tone, ctaLabel, targetId, context }; }
function reviewAppointment(): AppointmentNextAction { return action("review_appointment", "Review appointment", "Review the appointment status and existing staff controls before taking another action.", "warning", "Review status", "status-management"); }
function latestSessionCommunication(communications: AppointmentNextActionInput["communications"]) { return communications.find((message) => message.messageType === "external_session_available") ?? null; }

/** Produces one conservative recommendation without inferring provider-side actions or notarial outcomes. */
export function deriveAppointmentNextAction(input: AppointmentNextActionInput): AppointmentNextAction {
  if (input.appointmentStatus === "cancelled") return action("no_action_required", "No action required", "This appointment has been cancelled.", "neutral");
  if (input.appointmentStatus === "completed") return action("review_completion", "Review completion status", "Review the recorded appointment outcome and completion communications.", "success", "Review communications", "communications");
  if (holdStatuses.has(input.appointmentStatus) || !["awaiting_payment", "approved_pending_payment", "payment_processing", "confirmed", "ready"].includes(input.appointmentStatus)) return reviewAppointment();
  if (input.paymentStatus !== "paid") return paymentReviewStatuses.has(input.paymentStatus ?? "") ? action("review_payment_status", "Review payment status", "This payment requires staff review before the appointment can proceed.", "danger", "Review payment", "payment") : action("review_payment", "Review payment", "Payment is required before the appointment can proceed.", "warning", "Review payment", "payment");
  const documents = input.documents.filter((document) => document.deletedAt === null);
  if (documents.length === 0) return action("waiting_for_customer_document", "Waiting for customer document", "A document is required before staff can continue preparation.", "warning", "View Client Workspace access", "client-workspace");
  if (documents.some((document) => !documentStatuses.has(document.status) || !scanStatuses.has(document.scanStatus ?? "") || !storageStatuses.has(document.storageStatus ?? ""))) return reviewAppointment();
  if (documents.some((document) => ["infected", "suspicious", "failed"].includes(document.scanStatus ?? "") || document.storageStatus === "removed")) return action("review_document_security", "Review document security issue", "A document cannot be used for preparation until its security state is resolved through existing staff processes.", "danger", "Review documents", "documents");
  if (documents.some((document) => document.scanStatus === "pending" || document.storageStatus === "quarantined")) return action("security_processing", "Security processing in progress", "Document security processing must complete before preview or provider handoff is available.", "info", "View documents", "documents");
  if (documents.some((document) => document.status === "rejected")) return action("resolve_rejected_document", "Resolve rejected document", "A replacement document is required before preparation can continue.", "warning", "Review documents", "documents");
  if (documents.some((document) => document.status === "uploaded")) return action("review_uploaded_document", "Review uploaded document", "A clean, active document is ready for staff review.", "warning", "Review documents", "documents");
  if (!documents.every((document) => document.status === "approved" && document.scanStatus === "clean" && document.storageStatus === "active")) return reviewAppointment();
  const session = input.externalSession;
  if (session && !sessionStatuses.has(session.status)) return reviewAppointment();
  if (!session || session.status === "pending" || session.status === "unknown") return action("provider_handoff", "Download approved document for provider handoff", "A clean, active, approved document is available for an intentional provider-handoff download.", "info", "Review documents", "documents", "Downloading a document does not confirm that it was uploaded to a provider.");
  if (session.status === "cancelled") return action("resolve_cancelled_session", "Resolve cancelled session", "The recorded provider session is cancelled and requires staff follow-up.", "danger", "Manage session", "external-session");
  if (session.status === "in_progress") return action("session_in_progress", "Session in progress", "The provider session is in progress. Keep appointment outcomes with the commissioned notary.", "info", "Review session", "external-session");
  if (session.status === "completed") return action("confirm_appointment_outcome", "Confirm appointment outcome", "A completed provider session requires staff confirmation before the appointment status is changed.", "warning", "Review status", "status-management");
  if (!session.customerVisible) return action("prepare_session", "Prepare notarization session", "Record a customer-eligible provider session before customer session information can be sent.", "info", "Manage session", "external-session");
  const communication = latestSessionCommunication(input.communications);
  if (!communication || !["sent", "delivered"].includes(communication.status)) return action("review_session_communication", "Review session communication", "Review the existing customer session communication before treating appointment preparation as complete.", "warning", "Review communications", "communications");
  return action("ready_for_appointment_review", "Ready for appointment review", "Stored preparation records are complete. The commissioned notary remains responsible for all notarial determinations.", "success", "Review session", "external-session");
}
