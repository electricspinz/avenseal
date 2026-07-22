export type EmailTemplateType =
  | "appointment_request_received"
  | "clarification_requested"
  | "payment_required"
  | "payment_confirmed"
  | "payment_expiring_soon"
  | "payment_window_expired"
  | "appointment_rescheduled"
  | "appointment_cancelled"
  | "refund_initiated"
  | "appointment_reminder"
  | "no_show_follow_up"
  | "appointment_completed";

export function renderEmailSubject(type: EmailTemplateType, businessName = "Avenseal") {
  const subjects: Record<EmailTemplateType, string> = {
    appointment_request_received: `${businessName}: appointment request received`,
    clarification_requested: `${businessName}: clarification requested`,
    payment_required: `${businessName}: payment required to confirm your appointment`,
    payment_confirmed: `${businessName}: appointment confirmed`,
    payment_expiring_soon: `${businessName}: payment link expiring soon`,
    payment_window_expired: `${businessName}: payment window expired`,
    appointment_rescheduled: `${businessName}: appointment updated`,
    appointment_cancelled: `${businessName}: appointment cancelled`,
    refund_initiated: `${businessName}: refund initiated`,
    appointment_reminder: `${businessName}: appointment reminder`,
    no_show_follow_up: `${businessName}: follow-up on missed appointment`,
    appointment_completed: `${businessName}: thank you`
  };
  return subjects[type];
}

export function reminderShouldSend(input: { appointmentStartsAt: Date; now: Date; reminderMinutesBefore: number }) {
  const sendAt = new Date(input.appointmentStartsAt.getTime() - input.reminderMinutesBefore * 60_000);
  return sendAt.getTime() > input.now.getTime();
}
