export function DailyBrief({ date, hour, attentionCount, appointmentCount, awaitingReview, scheduledReminders, appointmentsUnavailable, attentionUnavailable, communicationsUnavailable }: { date: string; hour: number; attentionCount: number; appointmentCount: number; awaitingReview: number; scheduledReminders: number; appointmentsUnavailable?: boolean; attentionUnavailable?: boolean; communicationsUnavailable?: boolean }) {
  const greeting = greetingForHour(hour);
  const summary = appointmentsUnavailable && attentionUnavailable && communicationsUnavailable
    ? "Today’s operational summary is unavailable."
    : appointmentsUnavailable || attentionUnavailable || communicationsUnavailable
      ? "Some operational information is temporarily unavailable. Available appointment information is shown below."
      : attentionCount > 0
    ? `You have ${appointmentCount} appointment${appointmentCount === 1 ? "" : "s"} today and ${attentionCount} item${attentionCount === 1 ? "" : "s"} that need attention.`
    : appointmentCount === 0
      ? "You have no appointments scheduled today."
      : `You have ${appointmentCount} appointment${appointmentCount === 1 ? "" : "s"} today, ${awaitingReview} awaiting review, and ${scheduledReminders} reminder${scheduledReminders === 1 ? "" : "s"} scheduled.`;
  return <header><h1 className="text-3xl font-semibold tracking-tight text-navy">{greeting}</h1><p className="mt-2 text-lg text-slateDeep">{summary}</p><p className="mt-3 text-sm font-semibold uppercase tracking-[0.14em] text-slateDeep">{date}</p></header>;
}

function greetingForHour(hour: number) { return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"; }
