import { repository } from "@/lib/server/repository";
import type { AppointmentPayment, PaymentStatus } from "@/lib/types";
import type { TimelineDraft, TimelineOutcome, TimelineType } from "@/lib/server/customer-timeline";

export type PaymentPurpose = "appointment_fee";
export type PaymentSource = "appointment" | "system";
export type PaymentCenterStatus = PaymentStatus;
export type PaymentRecord = Readonly<{ id: string; organizationId: string; customerId: string; customerName: string; appointmentId: string; amountMinor: number; currency: "USD"; purpose: PaymentPurpose; status: PaymentCenterStatus; description: string; requestedAt: string; dueAt: string | null; paidAt: string | null; refundedAt: string | null; createdAt: string; updatedAt: string; source: PaymentSource; correlationId: string | null; safeReference: string | null }>;

export function paymentIdentity(input: Pick<PaymentRecord, "organizationId" | "customerId" | "appointmentId" | "purpose">) { return [input.organizationId, input.customerId, input.appointmentId, input.purpose].map((value) => `${value.length}:${value}`).join("."); }
export function formatPaymentAmount(amountMinor: number, currency: string) { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountMinor / 100); }

export type PaymentQuery = Readonly<{ status?: string; customerId?: string; appointmentId?: string; search?: string; sort?: string; limit?: string }>;

export async function queryPayments(input: PaymentQuery, dataSource = repository) {
  const appointments = await dataSource.listAppointments();
  const records = (await Promise.all(appointments.map(async (appointment) => (await dataSource.listPayments(appointment.id)).map((payment) => mapPayment(payment, appointment))))).flat()
    .filter((payment) => (!input.status || payment.status === input.status) && (!input.customerId || payment.customerId === input.customerId) && (!input.appointmentId || payment.appointmentId === input.appointmentId) && matchesSearch(payment, input.search))
    .sort((a, b) => input.sort === "oldest" ? a.requestedAt.localeCompare(b.requestedAt) : b.requestedAt.localeCompare(a.requestedAt));
  return records.slice(0, Math.min(Math.max(Number(input.limit ?? "50") || 50, 1), 100));
}

export async function getPayment(id: string, dataSource = repository) { return (await queryPayments({}, dataSource)).find((payment) => payment.id === id) ?? null; }

function mapPayment(payment: AppointmentPayment, appointment: Awaited<ReturnType<typeof repository.listAppointments>>[number]): PaymentRecord {
  const currency = payment.currency.toUpperCase() === "USD" ? "USD" : "USD";
  return { id: payment.id, organizationId: appointment.organizationId, customerId: appointment.customerId, customerName: appointment.customer.fullName, appointmentId: appointment.id, amountMinor: payment.amountCents, currency, purpose: "appointment_fee", status: payment.status, description: "Appointment service payment.", requestedAt: payment.createdAt, dueAt: payment.expiresAt, paidAt: payment.paidAt, refundedAt: payment.refundedAt, createdAt: payment.createdAt, updatedAt: payment.updatedAt, source: "appointment", correlationId: null, safeReference: null };
}
function matchesSearch(payment: PaymentRecord, search: string | undefined) { const value = search?.trim().toLowerCase(); return !value || [payment.id, payment.customerName, payment.appointmentId].some((item) => item.toLowerCase().includes(value)); }

export function timelineFromPayment(payment: PaymentRecord): TimelineDraft { const type: TimelineType = payment.status === "paid" ? "payment_received" : payment.status === "failed" ? "payment_failed" : payment.status === "refunded" ? "payment_refunded" : payment.status === "partially_refunded" ? "payment_partially_refunded" : payment.status === "expired" ? "payment_cancelled" : payment.status === "payment_link_created" ? "payment_link_created" : "payment_requested"; const outcome: TimelineOutcome = payment.status === "paid" || payment.status === "refunded" || payment.status === "partially_refunded" ? "succeeded" : payment.status === "failed" ? "failed" : payment.status === "expired" ? "cancelled" : "pending"; return { organizationId: payment.organizationId, customerId: payment.customerId, appointmentId: payment.appointmentId, category: "payment", type, outcome, title: type.replaceAll("_", " "), safeSummary: `${formatPaymentAmount(payment.amountMinor, payment.currency)} payment ${type.replace("payment_", "").replaceAll("_", " ")}.`, occurredAt: payment.updatedAt, actor: { kind: "system", actorId: null, safeDisplayName: "Payments" }, source: "payment_service", correlationId: payment.correlationId, causationId: payment.id, sourceEventId: payment.id, automationExecutionId: null, automationRuleId: null, automationRuleVersion: null, communicationRequestId: null, paymentId: payment.id, documentId: null, metadata: { amountMinor: payment.amountMinor, currency: payment.currency } }; }
