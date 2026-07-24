import type { SupabaseClient } from "@supabase/supabase-js";
import { communicationIdempotencyKey, renderEmailTemplate } from "@/lib/server/communications";

export type AppointmentReminderTemplate = "appointment_confirmation" | "appointment_reminder_24h" | "appointment_reminder_2h" | "appointment_followup" | "appointment_review_request" | "appointment_cancelled" | "appointment_rescheduled";
type ScheduledReminderTemplate = "appointment_reminder_24h" | "appointment_reminder_2h" | "appointment_followup" | "appointment_review_request";
type ReminderSettings = { emailRemindersEnabled: boolean; reviewRequestsEnabled: boolean; reminder24hMinutesBefore: number; reminder2hMinutesBefore: number; followupMinutesAfter: number; reviewRequestMinutesAfter: number };

export function reminderSchedule(startsAt: Date, settings: ReminderSettings) {
  return [
    settings.emailRemindersEnabled && { template: "appointment_reminder_24h" as const, scheduledFor: new Date(startsAt.getTime() - settings.reminder24hMinutesBefore * 60_000) },
    settings.emailRemindersEnabled && { template: "appointment_reminder_2h" as const, scheduledFor: new Date(startsAt.getTime() - settings.reminder2hMinutesBefore * 60_000) },
    settings.emailRemindersEnabled && { template: "appointment_followup" as const, scheduledFor: new Date(startsAt.getTime() + settings.followupMinutesAfter * 60_000) },
    settings.reviewRequestsEnabled && { template: "appointment_review_request" as const, scheduledFor: new Date(startsAt.getTime() + settings.reviewRequestMinutesAfter * 60_000) }
  ].filter((item): item is { template: ScheduledReminderTemplate; scheduledFor: Date } => Boolean(item && item.scheduledFor > new Date()));
}

export async function scheduleAppointmentReminders(supabase: SupabaseClient, input: { organizationId: string; appointmentId: string; startsAt: Date; settings: ReminderSettings }) {
  const reminders = reminderSchedule(input.startsAt, input.settings);
  if (!reminders.length) return [];
  const { data: active, error: activeError } = await supabase.from("appointment_reminders").select("template").eq("appointment_id", input.appointmentId).in("status", ["scheduled", "processing", "queued"]);
  if (activeError) throw activeError;
  const activeTemplates = new Set((active ?? []).map((reminder) => reminder.template));
  const pending = reminders.filter((reminder) => !activeTemplates.has(reminder.template));
  if (!pending.length) return [];
  const { data, error } = await supabase.from("appointment_reminders").insert(pending.map((reminder) => ({ organization_id: input.organizationId, appointment_id: input.appointmentId, template: reminder.template, scheduled_for: reminder.scheduledFor.toISOString(), status: "scheduled" }))).select();
  if (error) throw error;
  return data ?? [];
}

export async function cancelAppointmentReminders(supabase: SupabaseClient, appointmentId: string) {
  const { data: reminders, error: queryError } = await supabase.from("appointment_reminders").select("id,communication_message_id").eq("appointment_id", appointmentId).in("status", ["scheduled", "processing", "queued"]);
  if (queryError) throw queryError;
  const ids = (reminders ?? []).map((reminder) => reminder.id);
  if (!ids.length) return;
  const { error } = await supabase.from("appointment_reminders").update({ status: "cancelled" }).in("id", ids).in("status", ["scheduled", "processing", "queued"]);
  if (error) throw error;
  const communicationIds = (reminders ?? []).map((reminder) => reminder.communication_message_id).filter((id): id is string => Boolean(id));
  if (communicationIds.length) {
    const { error: communicationError } = await supabase.from("communication_messages").update({ status: "cancelled" }).in("id", communicationIds).in("status", ["queued", "failed"]);
    if (communicationError) throw communicationError;
  }
}

export async function processAppointmentReminders(supabase: SupabaseClient, limit = 20) {
  const { data, error } = await supabase.from("appointment_reminders").select("*, appointment_requests!inner(*, customers!inner(*))").eq("status", "scheduled").lte("scheduled_for", new Date().toISOString()).order("scheduled_for").limit(Math.min(limit, 50));
  if (error) throw error;
  let queued = 0;
  for (const reminder of data ?? []) {
    const appointment = reminder.appointment_requests;
    const customer = appointment.customers;
    const subject = `Avenseal: appointment reminder`;
    const html = renderEmailTemplate({ greetingName: customer.full_name, body: `This is a reminder about your appointment on ${appointment.preferred_date} at ${String(appointment.preferred_time).slice(0, 5)}.`, footer: "Questions? Reply to this email." });
    const key = communicationIdempotencyKey({ organizationId: reminder.organization_id, appointmentId: reminder.appointment_id, type: reminder.template as "appointment_reminder_24h", recipient: customer.email });
    const { data: communicationId, error: promotionError } = await supabase.rpc("promote_appointment_reminder", { p_reminder_id: reminder.id, p_subject: subject, p_html: html, p_recipient_email: customer.email, p_idempotency_key: key, p_provider: "gmail_smtp" });
    if (promotionError) throw promotionError;
    if (communicationId) queued++;
  }
  return { considered: (data ?? []).length, queued };
}
