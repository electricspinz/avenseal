import type { CustomerAppointmentStatus, PaymentStatus } from "@/lib/types";
import { repository } from "@/lib/server/repository";
import type { ExternalSession } from "@/lib/server/external-sessions";

export type PortalAvailability = "available" | "unavailable";
export type PortalItemState = "complete" | "current" | "pending" | "unavailable";
export type ClientWorkspaceNextStep = Readonly<{ title: string; detail: string; actionLabel: string | null; actionUrl: string | null; tone: "neutral" | "warning" | "success" }>;

export type ClientPortalViewModel = Readonly<{
  customerName: string;
  appointment: Readonly<{ reference: string; status: string; statusLabel: string; date: string; time: string; timezone: string; serviceName: string; businessName: string; supportEmail: string; supportPhone: string; meetingUrl: string | null }>;
  workflow: Readonly<{ availability: PortalAvailability; stage: string | null; blockers: readonly string[]; nextAction: string | null; progressPercent: number | null; reason?: string }>;
  documents: Readonly<{ availability: PortalAvailability; items: readonly Readonly<{ name: string; status: string }> []; reason?: string }>;
  payment: Readonly<{ availability: PortalAvailability; status: PaymentStatus | null; label: string; reason?: string }>;
  communications: Readonly<{ availability: PortalAvailability; items: readonly Readonly<{ title: string; occurredAt: string | null }> []; reason?: string }>;
  externalSession: Readonly<{ availability: PortalAvailability; provider: string | null; sessionName: string | null; launchUrl: string | null; status: string | null }>;
  checklist: readonly Readonly<{ id: string; label: string; state: PortalItemState; detail: string }> [];
  nextStep: ClientWorkspaceNextStep;
}>;

export type ClientPortalDependencies = Readonly<{ getAppointmentByAccessToken: (token: string) => Promise<CustomerAppointmentStatus | null>; getExternalSession: (organizationId: string, appointmentId: string) => Promise<ExternalSession | null> }>;
const dependencies: ClientPortalDependencies = { getAppointmentByAccessToken: (token) => repository.getCustomerAppointmentByAccessToken(token), getExternalSession: (organizationId, appointmentId) => repository.getExternalSession(organizationId, appointmentId) };

/** Secure, read-only portal boundary. The access token is verified by the existing repository boundary. */
export async function queryClientPortal(token: string, dataSource: ClientPortalDependencies = dependencies): Promise<ClientPortalViewModel | null> {
  const status = await dataSource.getAppointmentByAccessToken(token);
  return status ? projectPortal(status, await dataSource.getExternalSession(status.organizationId, status.appointmentId)) : null;
}

export function projectPortal(status: CustomerAppointmentStatus, externalSession: ExternalSession | null = null): ClientPortalViewModel {
  const paymentAvailable = status.paymentStatus !== null;
  const session = deriveClientWorkspaceSessionState(externalSession);
  const checklist = deriveClientWorkspaceChecklist(status, session);
  return {
    customerName: status.customerName,
    appointment: { reference: status.reference, status: status.status, statusLabel: status.customerStatusLabel, date: status.preferredDate, time: status.preferredTime, timezone: status.timezone, serviceName: status.serviceName, businessName: status.businessName, supportEmail: status.businessEmail, supportPhone: status.businessPhone, meetingUrl: status.meetingUrl },
    workflow: { availability: "unavailable", stage: null, blockers: [], nextAction: null, progressPercent: null, reason: "The current secure appointment link does not yet expose a tenant-scoped Workflow Engine read model." },
    documents: { availability: "unavailable", items: [], reason: "The current secure appointment link does not yet expose document records." },
    payment: paymentAvailable ? { availability: "available", status: status.paymentStatus, label: paymentLabel(status.paymentStatus) } : { availability: "unavailable", status: null, label: "Unavailable", reason: "No payment record is available for this appointment." },
    communications: { availability: "unavailable", items: [], reason: "Communication history is not available through the current secure appointment link." },
    externalSession: session,
    checklist,
    nextStep: deriveClientWorkspaceNextStep(status, session)
  };
}

export function deriveClientWorkspaceStatus(status: CustomerAppointmentStatus) { return status.customerStatusLabel || "Appointment scheduled"; }
export function deriveClientWorkspaceSessionState(session: ExternalSession | null) { return session ? { availability: "available" as const, provider: session.provider, sessionName: session.sessionName, launchUrl: session.launchUrl, status: session.status } : { availability: "unavailable" as const, provider: null, sessionName: null, launchUrl: null, status: null }; }
export function deriveClientWorkspaceChecklist(status: CustomerAppointmentStatus, session: ClientPortalViewModel["externalSession"]) { const paid = status.paymentStatus === "paid"; const scheduled = ["confirmed", "ready", "completed"].includes(status.status); return [{ id: "appointment", label: "Appointment scheduled", state: scheduled ? "complete" : "current", detail: deriveClientWorkspaceStatus(status) }, { id: "contact", label: "Contact information confirmed", state: "complete", detail: "Your booking contact information is on file." }, { id: "payment", label: "Payment completed", state: paid ? "complete" : status.paymentStatus ? "current" : "unavailable", detail: paid ? "Payment is recorded as received." : status.paymentStatus ? `Payment is recorded as ${paymentLabel(status.paymentStatus)}.` : "Payment status is not available." }, { id: "documents", label: "Documents prepared", state: "unavailable", detail: "Document preparation is not yet confirmed in this workspace." }, { id: "id", label: "Government-issued photo ID", state: "pending", detail: "Have your government-issued photo ID ready." }, { id: "session", label: "Online session available", state: session.launchUrl ? "complete" : "pending", detail: session.launchUrl ? "Your online session is ready." : "Your online notarization session will appear here when it is ready." }] as const; }

export function deriveClientWorkspaceNextStep(status: CustomerAppointmentStatus, session: ClientPortalViewModel["externalSession"]): ClientWorkspaceNextStep { if (status.status === "cancelled") return { title: "Appointment cancelled", detail: "This appointment has been cancelled.", actionLabel: null, actionUrl: null, tone: "warning" }; if (status.status === "completed") return { title: "Appointment completed", detail: "Your appointment journey is recorded as completed.", actionLabel: null, actionUrl: null, tone: "success" }; if (["payment_link_created", "payment_processing"].includes(status.paymentStatus ?? "")) return { title: "Complete payment", detail: "Payment is needed before your appointment can move forward.", actionLabel: status.checkoutUrl ? "Complete Payment" : null, actionUrl: status.checkoutUrl, tone: "warning" }; if (!session.launchUrl) return { title: "Waiting for online session", detail: "Your online notarization session will appear here when it is ready.", actionLabel: null, actionUrl: null, tone: "neutral" }; if (session.status === "in_progress") return { title: "Session in progress", detail: "Continue with the independent remote online notarization provider.", actionLabel: "Join Online Notarization", actionUrl: session.launchUrl, tone: "success" }; if (["ready", "scheduled"].includes(session.status ?? "")) return { title: "Join online notarization", detail: "You will leave Avenseal and continue with an independent provider for identity verification and the video notary call.", actionLabel: "Join Online Notarization", actionUrl: session.launchUrl, tone: "success" }; return { title: "No action needed", detail: "Your appointment is scheduled and preparation is underway.", actionLabel: null, actionUrl: null, tone: "neutral" }; }

function paymentLabel(status: PaymentStatus | null) { return status ? status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Unavailable"; }
