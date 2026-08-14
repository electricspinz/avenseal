import type { CustomerAppointmentStatus, PaymentStatus } from "@/lib/types";
import { repository } from "@/lib/server/repository";
import type { ExternalSession } from "@/lib/server/external-sessions";
import { isCustomerVisibleExternalSession } from "@/lib/server/external-sessions";
import { createAppointmentDocumentRepository, type CustomerDocumentStatus } from "@/lib/server/document-repository";
import { getSupabaseAdmin, hasSupabaseServiceConfig } from "@/lib/supabase/server";
import { calculateAppointmentReadiness, type AppointmentReadiness, type AppointmentReadinessDocument } from "@/lib/server/appointment-readiness";

export type PortalAvailability = "available" | "unavailable";
export type PortalItemState = "complete" | "current" | "pending" | "unavailable";
export type CustomerReadinessState = "payment_needed" | "documents_needed" | "documents_under_review" | "replacement_needed" | "waiting_for_session" | "ready_for_notarization" | "session_in_progress" | "appointment_completed" | "appointment_cancelled" | "action_required";
export type CustomerReadiness = Readonly<{ state: CustomerReadinessState; label: string; explanation: string; nextStep: string; tone: "neutral" | "warning" | "success" }>;

export type ClientPortalViewModel = Readonly<{
  customerName: string;
  appointment: Readonly<{ reference: string; status: string; statusLabel: string; date: string; time: string; timezone: string; serviceName: string; businessName: string; supportEmail: string; supportPhone: string; meetingUrl: string | null }>;
  workflow: Readonly<{ availability: PortalAvailability; stage: string | null; blockers: readonly string[]; nextAction: string | null; progressPercent: number | null; reason?: string }>;
  documents: Readonly<{ availability: PortalAvailability; items: readonly CustomerDocumentStatus[]; reason?: string }>;
  payment: Readonly<{ availability: PortalAvailability; status: PaymentStatus | null; label: string; amountDueCents: number | null; currency: string; reason?: string }>;
  communications: Readonly<{ availability: PortalAvailability; items: readonly Readonly<{ title: string; occurredAt: string | null }> []; reason?: string }>;
  externalSession: Readonly<{ availability: PortalAvailability; provider: string | null; sessionName: string | null }>;
  readiness: CustomerReadiness;
  checklist: readonly Readonly<{ id: string; label: string; state: PortalItemState; detail: string }> [];
}>;

export type ClientPortalDependencies = Readonly<{ getAppointmentByAccessToken: (token: string) => Promise<CustomerAppointmentStatus | null>; getExternalSession: (organizationId: string, appointmentId: string) => Promise<ExternalSession | null>; getCustomerDocuments?: (organizationId: string, appointmentId: string) => Promise<readonly CustomerDocumentStatus[]>; getReadinessDocuments?: (organizationId: string, appointmentId: string) => Promise<readonly AppointmentReadinessDocument[]> }>;
const dependencies: ClientPortalDependencies = { getAppointmentByAccessToken: (token) => repository.getCustomerAppointmentByAccessToken(token), getExternalSession: (organizationId, appointmentId) => repository.getExternalSession(organizationId, appointmentId), getCustomerDocuments: (organizationId, appointmentId) => hasSupabaseServiceConfig() ? createAppointmentDocumentRepository(getSupabaseAdmin()).getCustomerDocumentStatus(organizationId, appointmentId) : Promise.resolve([]), getReadinessDocuments: (organizationId, appointmentId) => hasSupabaseServiceConfig() ? createAppointmentDocumentRepository(getSupabaseAdmin()).listReadinessSources(organizationId, [appointmentId]) : Promise.resolve([]) };

/** Secure, read-only portal boundary. The access token is verified by the existing repository boundary. */
export async function queryClientPortal(token: string, dataSource: ClientPortalDependencies = dependencies): Promise<ClientPortalViewModel | null> {
  const status = await dataSource.getAppointmentByAccessToken(token);
  if (!status) return null;
  const [sessionResult, documentResult, readinessDocumentResult] = await Promise.allSettled([
    dataSource.getExternalSession(status.organizationId, status.appointmentId),
    dataSource.getCustomerDocuments?.(status.organizationId, status.appointmentId) ?? Promise.resolve([]),
    dataSource.getReadinessDocuments?.(status.organizationId, status.appointmentId) ?? Promise.resolve([])
  ]);
  const externalSession = sessionResult.status === "fulfilled" ? sessionResult.value : null;
  const documents = documentResult.status === "fulfilled" ? documentResult.value : [];
  const readinessDocuments = readinessDocumentResult.status === "fulfilled" ? readinessDocumentResult.value : [];
  const readiness = customerReadinessFromCanonical(safelyCalculateReadiness(status, externalSession, readinessDocuments));
  return projectPortal(status, externalSession, documents, readiness);
}

export function projectPortal(status: CustomerAppointmentStatus, externalSession: ExternalSession | null = null, documents: readonly CustomerDocumentStatus[] = [], readiness: CustomerReadiness = customerReadinessFromCanonical(safelyCalculateReadiness(status, externalSession, []))): ClientPortalViewModel {
  const paymentAvailable = status.paymentStatus !== null;
  const session = deriveClientWorkspaceSessionState(status, externalSession);
  const checklist = deriveClientWorkspaceChecklist(status, session);
  return {
    customerName: status.customerName,
    appointment: { reference: status.reference, status: status.status, statusLabel: status.customerStatusLabel, date: status.preferredDate, time: status.preferredTime, timezone: status.timezone, serviceName: status.serviceName, businessName: status.businessName, supportEmail: status.businessEmail, supportPhone: status.businessPhone, meetingUrl: status.meetingUrl },
    workflow: { availability: "unavailable", stage: null, blockers: [], nextAction: null, progressPercent: null, reason: "The current secure appointment link does not yet expose a tenant-scoped Workflow Engine read model." },
    documents: { availability: "available", items: documents },
    payment: paymentAvailable ? { availability: "available", status: status.paymentStatus, label: paymentLabel(status.paymentStatus), amountDueCents: status.amountDueCents, currency: status.currency } : { availability: "unavailable", status: null, label: "Unavailable", amountDueCents: null, currency: status.currency, reason: "No payment record is available for this appointment." },
    communications: { availability: "unavailable", items: [], reason: "Communication history is not available through the current secure appointment link." },
    externalSession: session,
    readiness,
    checklist
  };
}

export function customerReadinessFromCanonical(readiness: AppointmentReadiness): CustomerReadiness {
  const customerStates: Record<AppointmentReadiness["state"], CustomerReadiness> = {
    waiting_for_payment: { state: "payment_needed", label: "Payment needed", explanation: "Complete payment to continue preparing for your appointment.", nextStep: "Use the payment section below.", tone: "warning" },
    waiting_for_documents: { state: "documents_needed", label: "Upload your documents", explanation: "Upload the documents needed for your appointment.", nextStep: "Use the Documents section below.", tone: "warning" },
    waiting_for_review: { state: "documents_under_review", label: "Documents under review", explanation: "Your uploaded documents are being reviewed.", nextStep: "No action is needed right now.", tone: "neutral" },
    waiting_for_replacement: { state: "replacement_needed", label: "A replacement document is needed", explanation: "One of your documents needs to be replaced.", nextStep: "Open the Documents section below and upload a replacement.", tone: "warning" },
    waiting_for_session: { state: "waiting_for_session", label: "Your online session is being prepared", explanation: "Your payment and document preparation are complete. Your online notarization session will appear here when it is ready.", nextStep: "Check back here or follow future Avenseal communications.", tone: "neutral" },
    ready_for_notary: { state: "ready_for_notarization", label: "Ready for your online notarization", explanation: "Your payment and document preparation are complete, and your online session is available.", nextStep: "Use the Online Notarization section below when it is time.", tone: "success" },
    in_progress: { state: "session_in_progress", label: "Your online session is in progress", explanation: "Continue through the online notarization session.", nextStep: "Use the Online Notarization section below.", tone: "success" },
    completed: { state: "appointment_completed", label: "Appointment completed", explanation: "Your appointment has been completed.", nextStep: "No further preparation is required.", tone: "success" },
    cancelled: { state: "appointment_cancelled", label: "Appointment cancelled", explanation: "This appointment is no longer active.", nextStep: "Contact Avenseal if you need assistance.", tone: "warning" },
    blocked: { state: "action_required", label: "Action required", explanation: "We need your attention before this appointment can continue.", nextStep: "Review the information below or contact Avenseal.", tone: "warning" }
  };
  return customerStates[readiness.state];
}

function safelyCalculateReadiness(status: CustomerAppointmentStatus, externalSession: ExternalSession | null, documents: readonly AppointmentReadinessDocument[]): AppointmentReadiness {
  try {
    return calculateAppointmentReadiness({ organizationId: status.organizationId, appointmentId: status.appointmentId, appointmentStatus: status.status, paymentStatus: status.paymentStatus, documents, externalSession: externalSession ? { organizationId: externalSession.organizationId, appointmentId: externalSession.appointmentId, status: externalSession.status } : null });
  } catch {
    return { state: "blocked", blockers: [], summary: "Appointment readiness is unavailable.", prerequisites: [] };
  }
}

export function deriveClientWorkspaceStatus(status: CustomerAppointmentStatus) { return status.customerStatusLabel || "Appointment scheduled"; }
export function deriveClientWorkspaceSessionState(status: CustomerAppointmentStatus, session: ExternalSession | null) { return isCustomerVisibleExternalSession({ paymentStatus: status.paymentStatus, appointmentStatus: status.status, organizationId: status.organizationId, appointmentId: status.appointmentId, session }) ? { availability: "available" as const, provider: session!.provider, sessionName: session!.sessionName } : { availability: "unavailable" as const, provider: null, sessionName: null }; }
export function deriveClientWorkspaceChecklist(status: CustomerAppointmentStatus, session: ClientPortalViewModel["externalSession"]) { const paid = status.paymentStatus === "paid"; const scheduled = ["confirmed", "ready", "completed"].includes(status.status); return [{ id: "appointment", label: "Appointment scheduled", state: scheduled ? "complete" : "current", detail: deriveClientWorkspaceStatus(status) }, { id: "contact", label: "Contact information confirmed", state: "complete", detail: "Your booking contact information is on file." }, { id: "payment", label: "Payment completed", state: paid ? "complete" : status.paymentStatus ? "current" : "unavailable", detail: paid ? "Payment is recorded as received." : status.paymentStatus ? `Payment is recorded as ${paymentLabel(status.paymentStatus)}.` : "Payment status is not available." }, { id: "documents", label: "Documents prepared", state: "unavailable", detail: "Document preparation is not yet confirmed in this workspace." }, { id: "id", label: "Government-issued photo ID", state: "pending", detail: "Have your government-issued photo ID ready." }, { id: "session", label: "Online session available", state: session.availability === "available" ? "complete" : "pending", detail: session.availability === "available" ? "Your online session is ready." : "Your online notarization session will appear here when it is ready." }] as const; }

function paymentLabel(status: PaymentStatus | null) { return status ? status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Unavailable"; }
