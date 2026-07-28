export function DailyBrief({ date, hour, attentionCount, appointmentCount, awaitingReview, communicationsUnavailable }: { date: string | null; hour: number | null; attentionCount: number; appointmentCount: number | null; awaitingReview: number | null; communicationsUnavailable: boolean }) {
  const greeting = hour === null ? "Mission Control" : greetingForHour(hour);
  const summary = appointmentCount === null || awaitingReview === null
    ? "Today’s operational summary is unavailable."
    : communicationsUnavailable
      ? "Some operational information is temporarily unavailable. Available appointment information is shown below."
    : attentionCount > 0
    ? `You have ${appointmentCount} appointment${appointmentCount === 1 ? "" : "s"} today and ${attentionCount} item${attentionCount === 1 ? "" : "s"} that need attention.`
    : appointmentCount === 0
      ? "You have no appointments scheduled today."
      : `You have ${appointmentCount} appointment${appointmentCount === 1 ? "" : "s"} today and ${awaitingReview} awaiting review.`;
  return <header><h1 className="text-3xl font-semibold tracking-tight text-navy">{greeting}</h1><p className="mt-2 text-lg text-slateDeep">{summary}</p>{date && <p className="mt-3 text-sm font-semibold uppercase tracking-[0.14em] text-slateDeep">{date}</p>}</header>;
}

function greetingForHour(hour: number) { return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"; }
