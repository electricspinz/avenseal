import { renderEmailSubject } from "@/lib/milestone3/email";
import { communicationIdempotencyKey, enqueueAndProcessEmail, renderEmailTemplate, type CommunicationTemplate } from "@/lib/server/communications";
import { createAppointmentDocumentRepository, type AppointmentDocumentFile } from "@/lib/server/document-repository";
import { createAppointmentAccessLink, repository } from "@/lib/server/repository";
import { getSupabaseAdmin } from "@/lib/supabase/server";

function validEmail(value: string | null | undefined): value is string { return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)); }

/** Trusted review-boundary orchestration. It never accepts customer, recipient, or link values from a browser. */
export async function queueDocumentReviewOutcome(input: Pick<AppointmentDocumentFile, "organizationId" | "appointmentId" | "id" | "status" | "reviewedAt">) {
  const appointment = await repository.getAppointment(input.appointmentId);
  if (!appointment || appointment.organizationId !== input.organizationId || !validEmail(appointment.customer.email) || ["cancelled", "declined"].includes(appointment.status)) return;
  const supabase = getSupabaseAdmin();
  const documents = await createAppointmentDocumentRepository(supabase).listAppointmentDocuments(input.organizationId, input.appointmentId);
  const template = targetDocumentReviewCommunication(input, documents);
  if (!template) return;
  const key = communicationIdempotencyKey({ organizationId: input.organizationId, appointmentId: input.appointmentId, type: template.type, recipient: appointment.customer.email, idempotencyDiscriminator: template.discriminator });
  const { data: existing } = await supabase.from("communication_messages").select("id").eq("organization_id", input.organizationId).eq("idempotency_key", key).maybeSingle();
  if (existing) return;
  const access = await createAppointmentAccessLink(appointment, template.type);
  if (!access) return;
  await enqueueAndProcessEmail(supabase, { organizationId: input.organizationId, appointmentId: input.appointmentId, customerId: appointment.customerId, type: template.type, recipient: appointment.customer.email, subject: renderEmailSubject(template.type), html: renderEmailTemplate({ greetingName: appointment.customer.fullName, body: template.type === "document_replacement_requested" ? "Avenseal reviewed an uploaded document. Open your appointment to see the request and upload a replacement. Uploading a replacement does not itself mean it has been approved. Avenseal coordinates document preparation." : "All currently active uploaded documents have been approved. Open your appointment for current details. This does not mean identity verification or notarization is complete, and it does not guarantee an online session is immediately available. Avenseal coordinates document preparation; BlueNotary performs identity verification and the live notarization.", actionLabel: "Open Your Appointment", actionUrl: access.url, footer: "Open your appointment through Avenseal to continue securely." }), idempotencyDiscriminator: template.discriminator, safeMetadata: template.type === "document_replacement_requested" ? { documentId: input.id } : { approvedSet: template.discriminator } });
}

export function targetDocumentReviewCommunication(document: Pick<AppointmentDocumentFile, "id" | "status" | "reviewedAt">, active: readonly AppointmentDocumentFile[]): { type: Extract<CommunicationTemplate, "document_replacement_requested" | "documents_approved">; discriminator: string } | null {
  if (document.status === "rejected" && document.reviewedAt) return { type: "document_replacement_requested", discriminator: `${document.id}:${document.reviewedAt}` };
  if (document.status === "approved" && active.length > 0 && active.every((item) => item.status === "approved" && item.reviewedAt)) return { type: "documents_approved", discriminator: active.map((item) => `${item.id}:${item.reviewedAt}`).sort().join("|") };
  return null;
}
