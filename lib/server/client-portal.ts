import type { CustomerAppointmentStatus, PaymentStatus } from "@/lib/types";
import { repository } from "@/lib/server/repository";
import { getExternalSession, type ExternalSession } from "@/lib/server/external-sessions";

export type PortalAvailability = "available" | "unavailable";
export type PortalItemState = "complete" | "current" | "pending" | "unavailable";

export type ClientPortalViewModel = Readonly<{
  customerName: string;
  appointment: Readonly<{ reference: string; status: string; statusLabel: string; date: string; time: string; timezone: string; serviceName: string; businessName: string; supportEmail: string; supportPhone: string; meetingUrl: string | null }>;
  workflow: Readonly<{ availability: PortalAvailability; stage: string | null; blockers: readonly string[]; nextAction: string | null; progressPercent: number | null; reason?: string }>;
  documents: Readonly<{ availability: PortalAvailability; items: readonly Readonly<{ name: string; status: string }> []; reason?: string }>;
  payment: Readonly<{ availability: PortalAvailability; status: PaymentStatus | null; label: string; reason?: string }>;
  communications: Readonly<{ availability: PortalAvailability; items: readonly Readonly<{ title: string; occurredAt: string | null }> []; reason?: string }>;
  externalSession: Readonly<{ availability: PortalAvailability; provider: string | null; sessionName: string | null; launchUrl: string | null; status: string | null }>;
  checklist: readonly Readonly<{ id: string; label: string; state: PortalItemState; detail: string }> [];
  nextStep: Readonly<{ title: string; detail: string }>;
}>;

export type ClientPortalDependencies = Readonly<{ getAppointmentByAccessToken: (token: string) => Promise<CustomerAppointmentStatus | null> }>;
const dependencies: ClientPortalDependencies = { getAppointmentByAccessToken: (token) => repository.getCustomerAppointmentByAccessToken(token) };

/** Secure, read-only portal boundary. The access token is verified by the existing repository boundary. */
export async function queryClientPortal(token: string, dataSource: ClientPortalDependencies = dependencies): Promise<ClientPortalViewModel | null> {
  const status = await dataSource.getAppointmentByAccessToken(token);
  return status ? projectPortal(status) : null;
}

export function projectPortal(status: CustomerAppointmentStatus, externalSession = getExternalSession(status.organizationId, status.appointmentId)): ClientPortalViewModel {
  const paymentAvailable = status.paymentStatus !== null;
  const paid = status.paymentStatus === "paid";
  const completed = status.status === "completed";
  const paymentPending = status.paymentStatus === "payment_link_created" || status.paymentStatus === "payment_processing" || status.status === "awaiting_payment" || status.status === "approved_pending_payment";
  const checklist = [
    { id: "appointment", label: "Appointment scheduled", state: completed || status.status === "confirmed" || status.status === "ready" ? "complete" : "current", detail: status.customerStatusLabel },
    { id: "payment", label: "Payment received", state: !paymentAvailable ? "unavailable" : paid ? "complete" : paymentPending ? "current" : "pending", detail: !paymentAvailable ? "Payment status is unavailable." : paid ? "Payment is recorded as received." : `Payment is recorded as ${paymentLabel(status.paymentStatus)}.` },
    { id: "documents", label: "Required documents received", state: "unavailable", detail: "Document readiness is unavailable through this secure portal link." },
    { id: "identity", label: "Identity verification", state: "unavailable", detail: "Identity verification status is unavailable through this secure portal link." },
    { id: "ready", label: "Ready for notarization", state: completed ? "complete" : "unavailable", detail: completed ? "The appointment journey is recorded as completed." : "Workflow readiness is unavailable through this secure portal link." }
  ] as const;
  return {
    customerName: status.customerName,
    appointment: { reference: status.reference, status: status.status, statusLabel: status.customerStatusLabel, date: status.preferredDate, time: status.preferredTime, timezone: status.timezone, serviceName: status.serviceName, businessName: status.businessName, supportEmail: status.businessEmail, supportPhone: status.businessPhone, meetingUrl: status.meetingUrl },
    workflow: { availability: "unavailable", stage: null, blockers: [], nextAction: null, progressPercent: null, reason: "The current secure appointment link does not yet expose a tenant-scoped Workflow Engine read model." },
    documents: { availability: "unavailable", items: [], reason: "The current secure appointment link does not yet expose document records." },
    payment: paymentAvailable ? { availability: "available", status: status.paymentStatus, label: paymentLabel(status.paymentStatus) } : { availability: "unavailable", status: null, label: "Unavailable", reason: "No payment record is available for this appointment." },
    communications: { availability: "unavailable", items: [], reason: "Communication history is not available through the current secure appointment link." },
    externalSession: projectExternalSession(externalSession),
    checklist,
    nextStep: nextStep({ completed, paymentPending, paymentAvailable })
  };
}

function projectExternalSession(session: ExternalSession | null) { return session ? { availability: "available" as const, provider: session.provider, sessionName: session.sessionName, launchUrl: session.launchUrl, status: session.status } : { availability: "unavailable" as const, provider: null, sessionName: null, launchUrl: null, status: null }; }

function nextStep(input: { completed: boolean; paymentPending: boolean; paymentAvailable: boolean }) {
  if (input.completed) return { title: "Appointment completed", detail: "Your appointment journey is recorded as completed." };
  if (input.paymentPending) return { title: "Review payment status", detail: "Payment is the next recorded appointment requirement." };
  if (!input.paymentAvailable) return { title: "Prepare for your appointment", detail: "Review the appointment details and prepare your documents before the session." };
  return { title: "Prepare for your appointment", detail: "Review the appointment details and prepare for your scheduled session." };
}

function paymentLabel(status: PaymentStatus | null) { return status ? status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Unavailable"; }
