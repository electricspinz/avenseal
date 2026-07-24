import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmailIfConfigured, type EmailDeliveryResult } from "@/lib/server/email";

export type CommunicationTemplate = "booking_confirmation" | "payment_required" | "payment_confirmed" | "appointment_updated" | "appointment_cancelled" | "admin_booking_notification";

export type QueuedEmail = {
  organizationId: string;
  appointmentId?: string | null;
  customerId?: string | null;
  type: CommunicationTemplate;
  recipient: string;
  subject: string;
  html: string;
  provider?: string;
};

export type CommunicationBatchResult = { considered: number; claimed: number; sent: number; retryScheduled: number; permanentlyFailed: number; skipped: number; claimConflicts: number };
type QueueRow = { id: string; organization_id: string; appointment_request_id: string | null; customer_id: string | null; message_type: string; recipient_email: string; subject: string; body_html: string | null; provider: string; status: string; attempt_count: number | null; next_attempt_at: string | null; processing_started_at: string | null };
const maximumAttempts = 3;

function safeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function renderEmailTemplate(input: { greetingName: string; body: string; actionLabel?: string; actionUrl?: string; footer: string }) {
  const action = input.actionLabel && input.actionUrl
    ? `<p><a href="${safeHtml(input.actionUrl)}" style="display:inline-block;padding:12px 20px;background:#123B5D;color:#fff;font-weight:700;text-decoration:none;border-radius:6px;">${safeHtml(input.actionLabel)}</a></p>`
    : "";
  return `<p>Hi ${safeHtml(input.greetingName)},</p><p>${safeHtml(input.body)}</p>${action}<p>${safeHtml(input.footer)}</p>`;
}

export function communicationIdempotencyKey(input: Pick<QueuedEmail, "organizationId" | "appointmentId" | "type" | "recipient">) {
  return createHash("sha256").update([input.organizationId, input.appointmentId ?? "", input.type, input.recipient.toLowerCase()].join(":"), "utf8").digest("hex");
}

function stagingRecipientAllowed(recipient: string) {
  if (process.env.LIVE_SUPABASE_ENVIRONMENT !== "staging") return true;
  const allowlist = (process.env.COMMUNICATION_SAFE_RECIPIENTS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  return allowlist.includes(recipient.toLowerCase());
}

export async function enqueueAndProcessEmail(supabase: SupabaseClient, input: QueuedEmail): Promise<EmailDeliveryResult> {
  const idempotencyKey = communicationIdempotencyKey(input);
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
      next_attempt_at: new Date().toISOString()
    }).select().single();
  if (insertError) throw insertError;

  const { data: claimed } = await supabase.from("communication_messages")
    .update({ status: "processing", processing_started_at: new Date().toISOString(), last_attempted_at: new Date().toISOString(), attempt_count: Number(message.attempt_count ?? 0) + 1 })
    .eq("id", message.id).eq("status", "queued").select().maybeSingle();
  if (!claimed) return { status: "skipped", providerMessageId: null, error: "Communication is already being processed." };

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
      type: message.message_type as CommunicationTemplate, recipient: message.recipient_email, subject: message.subject, html: message.body_html ?? "", provider: message.provider
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
