import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmailIfConfigured, type EmailDeliveryResult } from "@/lib/server/email";
import { isCustomerVisibleExternalSession, type ExternalSession } from "@/lib/server/external-sessions";

export type CommunicationTemplate = "booking_confirmation" | "payment_required" | "payment_confirmed" | "external_session_available" | "document_replacement_requested" | "documents_approved" | "appointment_updated" | "appointment_rescheduled" | "appointment_cancelled" | "admin_booking_notification" | "appointment_reminder_24h" | "appointment_reminder_2h" | "appointment_followup" | "appointment_review_request";

export type QueuedEmail = {
  organizationId: string;
  appointmentId?: string | null;
  customerId?: string | null;
  type: CommunicationTemplate;
  recipient: string;
  subject: string;
  html: string;
  provider?: string;
  idempotencyDiscriminator?: string;
  /** Worker-only: preserves the persisted key when a queued visibility cycle is retried. */
  idempotencyKey?: string;
  safeMetadata?: Record<string, string>;
};

export type CommunicationBatchResult = { considered: number; claimed: number; sent: number; retryScheduled: number; permanentlyFailed: number; skipped: number; claimConflicts: number };
type QueueRow = { id: string; organization_id: string; appointment_request_id: string | null; customer_id: string | null; message_type: string; recipient_email: string; subject: string; body_html: string | null; provider: string; status: string; attempt_count: number | null; next_attempt_at: string | null; processing_started_at: string | null; idempotency_key: string | null; metadata: Record<string, string> | null };
const maximumAttempts = 3;
export type ExternalSessionDeliverySuppressionReason = "payment_ineligible" | "appointment_ineligible" | "session_ineligible" | "recipient_changed" | "recipient_unavailable" | "tenant_mismatch" | "appointment_mismatch" | "launch_unavailable" | "workspace_unavailable" | "document_state_changed" | "document_replaced" | "document_removed" | "document_set_changed";

type ExternalSessionDeliveryEligibility = { eligible: true } | { eligible: false; reason: ExternalSessionDeliverySuppressionReason };

function isValidRecipient(value: string | null | undefined): value is string {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

function mapEligibilitySession(row: Record<string, unknown>): ExternalSession {
  return {
    organizationId: String(row.organization_id), appointmentId: String(row.appointment_request_id), provider: String(row.provider ?? ""),
    sessionName: String(row.session_name ?? ""), launchUrl: typeof row.launch_url === "string" ? row.launch_url : null,
    referenceNumber: typeof row.reference_number === "string" ? row.reference_number : null,
    status: String(row.status) as ExternalSession["status"], notes: typeof row.notes === "string" ? row.notes : null,
    createdAt: String(row.created_at ?? ""), updatedAt: String(row.updated_at ?? ""),
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata as ExternalSession["metadata"] : {}
  };
}

/** Re-reads only trusted persisted state immediately before this sensitive handoff email leaves Avenseal. */
export async function checkExternalSessionAvailableDeliveryEligibility(supabase: SupabaseClient, message: Pick<QueueRow, "organization_id" | "appointment_request_id" | "customer_id" | "recipient_email">): Promise<ExternalSessionDeliveryEligibility> {
  if (!message.appointment_request_id) return { eligible: false, reason: "appointment_mismatch" };
  const { data: appointment } = await supabase.from("appointment_requests")
    .select("id,organization_id,status,customer_id,customers!inner(email)")
    .eq("id", message.appointment_request_id).eq("organization_id", message.organization_id).maybeSingle();
  if (!appointment) return { eligible: false, reason: "appointment_ineligible" };
  if (appointment.organization_id !== message.organization_id) return { eligible: false, reason: "tenant_mismatch" };
  if (appointment.id !== message.appointment_request_id || appointment.customer_id !== message.customer_id) return { eligible: false, reason: "appointment_mismatch" };
  const customer = Array.isArray(appointment.customers) ? appointment.customers[0] : appointment.customers;
  const customerEmail = customer?.email as string | null | undefined;
  if (!isValidRecipient(customerEmail)) return { eligible: false, reason: "recipient_unavailable" };
  if (customerEmail.toLowerCase() !== message.recipient_email.toLowerCase()) return { eligible: false, reason: "recipient_changed" };

  const { data: session } = await supabase.from("external_sessions").select("*")
    .eq("organization_id", message.organization_id).eq("appointment_request_id", message.appointment_request_id).maybeSingle();
  if (!session) return { eligible: false, reason: "session_ineligible" };
  const { data: payment } = await supabase.from("appointment_payments").select("status")
    .eq("organization_id", message.organization_id).eq("appointment_request_id", message.appointment_request_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (payment?.status !== "paid") return { eligible: false, reason: "payment_ineligible" };
  if (!["confirmed", "ready"].includes(appointment.status)) return { eligible: false, reason: "appointment_ineligible" };
  const externalSession = mapEligibilitySession(session as Record<string, unknown>);
  if (!externalSession.launchUrl) return { eligible: false, reason: "launch_unavailable" };
  try {
    const launchUrl = new URL(externalSession.launchUrl);
    if (launchUrl.protocol !== "https:" || launchUrl.username || launchUrl.password) return { eligible: false, reason: "launch_unavailable" };
  } catch {
    return { eligible: false, reason: "launch_unavailable" };
  }
  if (!isCustomerVisibleExternalSession({ paymentStatus: payment.status, appointmentStatus: appointment.status, organizationId: message.organization_id, appointmentId: message.appointment_request_id, session: externalSession })) return { eligible: false, reason: "session_ineligible" };

  const { data: workspaceToken } = await supabase.from("appointment_access_tokens").select("id")
    .eq("organization_id", message.organization_id).eq("appointment_request_id", message.appointment_request_id).eq("purpose", "client_workspace")
    .is("revoked_at", null).gt("expires_at", new Date().toISOString()).limit(1).maybeSingle();
  return workspaceToken ? { eligible: true } : { eligible: false, reason: "workspace_unavailable" };
}

async function suppressExternalSessionAvailableDelivery(supabase: SupabaseClient, message: QueueRow, reason: ExternalSessionDeliverySuppressionReason) {
  const safeReason = `External session delivery suppressed: ${reason}.`;
  await supabase.from("communication_messages").update({ status: "cancelled", last_error: safeReason, next_attempt_at: null }).eq("id", message.id).eq("status", "processing");
  await supabase.from("audit_logs").insert({ organization_id: message.organization_id, action: "external_session.communication_suppressed", entity_type: "appointment_request", entity_id: message.appointment_request_id, metadata: { communicationType: "external_session_available", deliveryStatus: "cancelled", reason } });
  return { status: "skipped" as const, providerMessageId: null, error: safeReason };
}

async function checkDocumentReviewDeliveryEligibility(supabase: SupabaseClient, message: QueueRow, type: "document_replacement_requested" | "documents_approved"): Promise<ExternalSessionDeliveryEligibility> {
  if (!message.appointment_request_id) return { eligible: false, reason: "appointment_mismatch" };
  const { data: appointment } = await supabase.from("appointment_requests").select("id,organization_id,status,customer_id,customers!inner(email)").eq("id", message.appointment_request_id).eq("organization_id", message.organization_id).maybeSingle();
  if (!appointment || appointment.organization_id !== message.organization_id) return { eligible: false, reason: "appointment_ineligible" };
  if (appointment.customer_id !== message.customer_id) return { eligible: false, reason: "appointment_mismatch" };
  if (["cancelled", "declined"].includes(appointment.status)) return { eligible: false, reason: "appointment_ineligible" };
  const customer = Array.isArray(appointment.customers) ? appointment.customers[0] : appointment.customers;
  if (!isValidRecipient(customer?.email)) return { eligible: false, reason: "recipient_unavailable" };
  if (customer.email.toLowerCase() !== message.recipient_email.toLowerCase()) return { eligible: false, reason: "recipient_changed" };
  const { data: documents } = await supabase.from("appointment_document_files").select("id,status,reviewed_at").eq("organization_id", message.organization_id).eq("appointment_request_id", message.appointment_request_id).is("deleted_at", null);
  const active = documents ?? [];
  if (type === "document_replacement_requested") {
    const targetId = message.metadata?.documentId;
    const target = active.find((document) => document.id === targetId);
    if (!target) return { eligible: false, reason: "document_removed" };
    if (target.status !== "rejected") return { eligible: false, reason: "document_state_changed" };
  } else if (active.length === 0 || active.some((document) => document.status !== "approved")) return { eligible: false, reason: "document_set_changed" };
  const { data: token } = await supabase.from("appointment_access_tokens").select("id").eq("organization_id", message.organization_id).eq("appointment_request_id", message.appointment_request_id).eq("purpose", "client_workspace").is("revoked_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  return token ? { eligible: true } : { eligible: false, reason: "workspace_unavailable" };
}

function safeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function renderEmailTemplate(input: { greetingName: string; body: string; actionLabel?: string; actionUrl?: string; footer: string }) {
  const action = input.actionLabel && input.actionUrl
    ? `<p><a href="${safeHtml(input.actionUrl)}" style="display:inline-block;padding:12px 20px;background:#123B5D;color:#fff;font-weight:700;text-decoration:none;border-radius:6px;">${safeHtml(input.actionLabel)}</a></p>`
    : "";
  return `<p>Hi ${safeHtml(input.greetingName)},</p><p>${safeHtml(input.body)}</p>${action}<p>${safeHtml(input.footer)}</p>`;
}

export function communicationIdempotencyKey(input: Pick<QueuedEmail, "organizationId" | "appointmentId" | "type" | "recipient" | "idempotencyDiscriminator">) {
  return createHash("sha256").update([input.organizationId, input.appointmentId ?? "", input.type, input.recipient.toLowerCase(), input.idempotencyDiscriminator ?? ""].join(":"), "utf8").digest("hex");
}

function stagingRecipientAllowed(recipient: string) {
  if (process.env.LIVE_SUPABASE_ENVIRONMENT !== "staging") return true;
  const allowlist = (process.env.COMMUNICATION_SAFE_RECIPIENTS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  return allowlist.includes(recipient.toLowerCase());
}

export async function enqueueAndProcessEmail(supabase: SupabaseClient, input: QueuedEmail): Promise<EmailDeliveryResult> {
  const idempotencyKey = input.idempotencyKey ?? communicationIdempotencyKey(input);
  const { data: existing, error: existingError } = await supabase
    .from("communication_messages")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.status === "sent") return { status: "sent", providerMessageId: existing.provider_message_id ?? null, error: null };

  const { data: message, error: insertError } = existing
    ? existing.status === "failed" && Number(existing.attempt_count ?? 0) < maximumAttempts && existing.next_attempt_at
      ? await supabase.from("communication_messages").update({ status: "queued" }).eq("id", existing.id).select().single()
      : { data: existing, error: null }
    : await supabase.from("communication_messages").insert({
      organization_id: input.organizationId,
      appointment_request_id: input.appointmentId ?? null,
      customer_id: input.customerId ?? null,
      channel: "email",
      provider: input.provider ?? "gmail_smtp",
      message_type: input.type,
      recipient_email: input.recipient,
      subject: input.subject,
      body_html: input.html,
      status: "queued",
      idempotency_key: idempotencyKey,
      metadata: input.safeMetadata ?? {},
      next_attempt_at: new Date().toISOString()
    }).select().single();
  if (insertError) throw insertError;

  const preSendEligibleMessage = input.type === "external_session_available" || input.type === "document_replacement_requested" || input.type === "documents_approved";
  const { data: claimed } = await supabase.from("communication_messages")
    .update(preSendEligibleMessage
      ? { status: "processing", processing_started_at: new Date().toISOString() }
      : { status: "processing", processing_started_at: new Date().toISOString(), last_attempted_at: new Date().toISOString(), attempt_count: Number(message.attempt_count ?? 0) + 1 })
    .eq("id", message.id).eq("status", "queued").select().maybeSingle();
  if (!claimed) return { status: "skipped", providerMessageId: null, error: "Communication is already being processed." };

  if (preSendEligibleMessage) {
    const eligibility = input.type === "external_session_available" ? await checkExternalSessionAvailableDeliveryEligibility(supabase, message) : await checkDocumentReviewDeliveryEligibility(supabase, message, input.type as "document_replacement_requested" | "documents_approved");
    if (!eligibility.eligible) return suppressExternalSessionAvailableDelivery(supabase, message, eligibility.reason);
    const { data: attempted } = await supabase.from("communication_messages")
      .update({ last_attempted_at: new Date().toISOString(), attempt_count: Number(message.attempt_count ?? 0) + 1 })
      .eq("id", message.id).eq("status", "processing").select().maybeSingle();
    if (!attempted) return { status: "skipped", providerMessageId: null, error: "Communication is no longer available for delivery." };
  }

  if (!stagingRecipientAllowed(input.recipient)) {
    console.info("[communications] delivery skipped by staging recipient policy.", { communicationId: message.id });
    await supabase.from("communication_messages").update({ status: "failed", last_error: "Staging recipient policy blocked delivery.", next_attempt_at: null }).eq("id", message.id);
    return { status: "skipped", providerMessageId: null, error: "Staging recipient policy blocked delivery." };
  }

  const delivery = await sendEmailIfConfigured({ to: input.recipient, subject: input.subject, html: input.html });
  const attempts = Number(claimed.attempt_count);
  const retryable = delivery.status === "failed" && attempts < maximumAttempts;
  await supabase.from("communication_messages").update({
    status: delivery.status === "sent" ? "sent" : "failed",
    provider_message_id: delivery.providerMessageId,
    last_error: delivery.error,
    sent_at: delivery.status === "sent" ? new Date().toISOString() : null,
    next_attempt_at: retryable ? new Date(Date.now() + attempts * 60_000).toISOString() : null
  }).eq("id", message.id);
  return delivery;
}

// Workers claim with a conditional status update before SMTP I/O; overlapping workers therefore
// cannot both send the same row. A crashed claim is recoverable after the configured timeout.
export async function processCommunicationBatch(supabase: SupabaseClient, options: { batchSize?: number; processingTimeoutMinutes?: number } = {}): Promise<CommunicationBatchResult> {
  const batchSize = Math.min(Math.max(options.batchSize ?? 10, 1), 50);
  const staleBefore = new Date(Date.now() - (options.processingTimeoutMinutes ?? 10) * 60_000).toISOString();
  const now = new Date().toISOString();
  const { data, error } = await supabase.from("communication_messages").select("*").in("status", ["queued", "failed", "processing"]).order("created_at").limit(batchSize * 3);
  if (error) throw error;
  const candidates = ((data ?? []) as QueueRow[]).filter((message) =>
    message.status === "queued" ||
    (message.status === "failed" && Number(message.attempt_count ?? 0) < maximumAttempts && message.next_attempt_at && message.next_attempt_at <= now) ||
    (message.status === "processing" && message.processing_started_at && message.processing_started_at <= staleBefore)
  ).slice(0, batchSize);
  const result: CommunicationBatchResult = { considered: candidates.length, claimed: 0, sent: 0, retryScheduled: 0, permanentlyFailed: 0, skipped: 0, claimConflicts: 0 };
  for (const message of candidates) {
    if (message.status === "processing") {
      const { data: recovered } = await supabase.from("communication_messages").update({ status: "queued" }).eq("id", message.id).eq("status", "processing").lte("processing_started_at", staleBefore).select().maybeSingle();
      if (!recovered) { result.claimConflicts++; continue; }
    }
    const delivery = await enqueueAndProcessEmail(supabase, {
      organizationId: message.organization_id, appointmentId: message.appointment_request_id, customerId: message.customer_id,
      type: message.message_type as CommunicationTemplate, recipient: message.recipient_email, subject: message.subject, html: message.body_html ?? "", provider: message.provider,
      idempotencyKey: message.idempotency_key ?? undefined
    });
    if (delivery.status === "sent") { result.claimed++; result.sent++; }
    else if (delivery.status === "failed") {
      result.claimed++;
      if (Number(message.attempt_count ?? 0) + 1 < maximumAttempts) result.retryScheduled++;
      else result.permanentlyFailed++;
    }
    else result.skipped++;
  }
  console.info("[communications] batch complete", { considered: result.considered, claimed: result.claimed, sent: result.sent, retryScheduled: result.retryScheduled, permanentlyFailed: result.permanentlyFailed, skipped: result.skipped, claimConflicts: result.claimConflicts });
  return result;
}
