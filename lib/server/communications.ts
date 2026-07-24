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
    ? existing.status === "failed" && Number(existing.attempt_count ?? 0) < 3 && existing.next_attempt_at
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
  const retryable = delivery.status === "failed" && attempts < 3;
  await supabase.from("communication_messages").update({
    status: delivery.status === "sent" ? "sent" : "failed",
    provider_message_id: delivery.providerMessageId,
    last_error: delivery.error,
    sent_at: delivery.status === "sent" ? new Date().toISOString() : null,
    next_attempt_at: retryable ? new Date(Date.now() + attempts * 60_000).toISOString() : null
  }).eq("id", message.id);
  return delivery;
}
