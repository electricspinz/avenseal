import type { AppointmentRules } from "@/lib/types";

export function getPaymentWindowMinutes(isSameDay: boolean, rules: AppointmentRules) {
  return isSameDay ? rules.sameDayPaymentWindowMinutes ?? 30 : rules.futurePaymentWindowMinutes ?? 720;
}

export function calculatePaymentExpiration(now: Date, appointmentDate: string, rules: AppointmentRules) {
  const today = now.toISOString().slice(0, 10);
  const windowMinutes = getPaymentWindowMinutes(today === appointmentDate, rules);
  return new Date(now.getTime() + windowMinutes * 60_000);
}

export function calculateCancellationRefund(input: {
  amountCents: number;
  appointmentStartsAt: Date;
  cancelledAt: Date;
  rules: Pick<AppointmentRules, "lateCancellationCutoffMinutes" | "lateCancellationRetainedCents">;
  cancelledByAvenseal?: boolean;
}) {
  if (input.cancelledByAvenseal) {
    return { refundCents: input.amountCents, retainedCents: 0, outcome: "full_refund" as const };
  }
  const cutoffMinutes = input.rules.lateCancellationCutoffMinutes ?? 120;
  const retainedCents = input.rules.lateCancellationRetainedCents ?? 1500;
  const minutesUntilAppointment = (input.appointmentStartsAt.getTime() - input.cancelledAt.getTime()) / 60_000;
  if (minutesUntilAppointment > cutoffMinutes) {
    return { refundCents: input.amountCents, retainedCents: 0, outcome: "full_refund" as const };
  }
  const retained = Math.min(retainedCents, input.amountCents);
  return {
    refundCents: input.amountCents - retained,
    retainedCents: retained,
    outcome: "late_cancellation_partial_refund" as const
  };
}
