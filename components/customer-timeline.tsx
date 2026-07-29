import React from "react";
import { CalendarDays, CheckCircle2, CircleAlert, Clock3, Mail, Settings2, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TimelineCategory, TimelineEvent, TimelineOutcome } from "@/lib/server/customer-timeline";

const categoryStyles: Record<TimelineCategory, string> = { appointment: "border-blue-300 bg-blue-50 text-blue-900", communication: "border-cyan-300 bg-cyan-50 text-cyan-900", automation: "border-violet-300 bg-violet-50 text-violet-900", payment: "border-emerald-300 bg-emerald-50 text-emerald-900", document: "border-amber-300 bg-amber-50 text-amber-900", customer: "border-slate-300 bg-slate-50 text-slate-800", staff: "border-indigo-300 bg-indigo-50 text-indigo-900", system: "border-zinc-300 bg-zinc-50 text-zinc-800" };
const outcomeStyles: Record<TimelineOutcome, string> = { informational: "border-slate-300 bg-slate-50 text-slate-800", pending: "border-blue-300 bg-blue-50 text-blue-900", succeeded: "border-emerald-300 bg-emerald-50 text-emerald-900", failed: "border-red-300 bg-red-50 text-red-900", skipped: "border-zinc-300 bg-zinc-50 text-zinc-800", cancelled: "border-zinc-300 bg-zinc-50 text-zinc-800", requires_attention: "border-amber-300 bg-amber-50 text-amber-900" };
const icons = { appointment: CalendarDays, communication: Mail, automation: Settings2, customer: UserRound, payment: CheckCircle2, document: Clock3, staff: UserRound, system: CircleAlert };
const categories: readonly TimelineCategory[] = ["appointment", "communication", "automation", "payment", "document", "customer", "staff", "system"];
const outcomes: readonly TimelineOutcome[] = ["informational", "pending", "succeeded", "failed", "skipped", "cancelled", "requires_attention"];

export type TimelineFilters = { readonly category?: TimelineCategory; readonly outcome?: TimelineOutcome; readonly appointmentId?: string };

export function TimelineFiltersForm({ filters, appointments = [] }: { filters: TimelineFilters; appointments?: readonly { readonly id: string; readonly label: string }[] }) {
  return <form className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Filter timeline activity">
    <label className="grid gap-1 text-sm font-medium text-navy">Category<select name="category" defaultValue={filters.category ?? ""} className="rounded-md border border-silver bg-white px-3 py-2 text-sm text-navy"><option value="">All categories</option>{categories.map((category) => <option key={category} value={category}>{labelFor(category)}</option>)}</select></label>
    <label className="grid gap-1 text-sm font-medium text-navy">Outcome<select name="outcome" defaultValue={filters.outcome ?? ""} className="rounded-md border border-silver bg-white px-3 py-2 text-sm text-navy"><option value="">All outcomes</option>{outcomes.map((outcome) => <option key={outcome} value={outcome}>{labelFor(outcome)}</option>)}</select></label>
    {appointments.length > 0 && <label className="grid gap-1 text-sm font-medium text-navy">Appointment<select name="appointmentId" defaultValue={filters.appointmentId ?? ""} className="rounded-md border border-silver bg-white px-3 py-2 text-sm text-navy"><option value="">All appointments</option>{appointments.map((appointment) => <option key={appointment.id} value={appointment.id}>{appointment.label}</option>)}</select></label>}
    <div className="flex items-end"><button type="submit" className="focus-ring rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy/90">Apply filters</button></div>
  </form>;
}

export function TimelineLoading({ title = "Customer Timeline" }: { title?: string }) {
  return <section aria-busy="true" aria-labelledby="timeline-loading-heading"><h2 id="timeline-loading-heading" className="text-xl font-semibold text-navy">{title}</h2><div className="mt-4 space-y-3" role="status"><span className="sr-only">Loading timeline activity.</span>{[1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-md bg-mist motion-reduce:animate-none" />)}</div></section>;
}

export function TimelineError({ title = "Customer Timeline" }: { title?: string }) {
  return <section aria-labelledby="timeline-error-heading" role="alert"><h2 id="timeline-error-heading" className="text-xl font-semibold text-navy">{title}</h2><p className="mt-4 text-sm text-slateDeep">Timeline activity is unavailable right now.</p></section>;
}

export function CustomerTimeline({ events, title = "Customer Timeline" }: { events: readonly TimelineEvent[]; title?: string }) {
  if (!events.length) return <section aria-labelledby="customer-timeline-heading"><h2 id="customer-timeline-heading" className="text-xl font-semibold text-navy">{title}</h2><p className="mt-4 text-sm text-slateDeep">No activity has been recorded yet.</p></section>;
  return <section aria-labelledby="customer-timeline-heading"><h2 id="customer-timeline-heading" className="text-xl font-semibold text-navy">{title}</h2><ol className="mt-5 space-y-6">{groupEvents(events).map(([label, group]) => <li key={label}><h3 className="text-xs font-semibold uppercase tracking-wide text-slateDeep">{label}</h3><ol className="mt-3 space-y-3 border-l border-silver pl-4">{group.map((event) => <TimelineItem key={event.id} event={event} />)}</ol></li>)}</ol></section>;
}

export function TimelineItem({ event }: { event: TimelineEvent }) { const Icon = icons[event.category]; return <li className="relative rounded-md border border-silver bg-white p-4 shadow-sm"><Icon className="absolute -left-[29px] top-5 rounded-full bg-mist p-1 text-navy" size={22} aria-hidden="true" /><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-semibold text-navy">{event.title}</p><p className="mt-1 text-sm leading-6 text-slateDeep">{event.safeSummary}</p></div><time dateTime={event.occurredAt} aria-label={new Date(event.occurredAt).toLocaleString()} className="shrink-0 text-xs text-slateDeep">{relativeTime(event.occurredAt)}</time></div><div className="mt-3 flex flex-wrap gap-2 text-xs"><Badge label={labelFor(event.category)} className={categoryStyles[event.category]} /><Badge label={labelFor(event.outcome)} className={outcomeStyles[event.outcome]} />{event.appointmentId && <Badge label="Appointment linked" className="border-silver bg-mist text-slateDeep" />}{event.communicationRequestId && <Badge label="Communication" className="border-silver bg-mist text-slateDeep" />}{event.automationExecutionId && <Badge label="Automation" className="border-silver bg-mist text-slateDeep" />}<span className="self-center text-slateDeep">{event.actor.safeDisplayName ?? event.actor.kind} · {event.source.replaceAll("_", " ")}</span></div></li>; }
function Badge({ label, className }: { label: string; className: string }) { return <span className={cn("rounded-md border px-2 py-1 font-semibold capitalize", className)}>{label}</span>; }
function labelFor(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
export function relativeTime(value: string, now = new Date()) { const delta = now.getTime() - Date.parse(value); if (delta < 60_000) return "Just now"; if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} minutes ago`; if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} hours ago`; const date = new Date(value); return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: date.getFullYear() === now.getFullYear() ? undefined : "numeric" }); }
export function groupEvents(events: readonly TimelineEvent[], now = new Date()) { const groups = new Map<string, TimelineEvent[]>(); for (const event of events) { const days = Math.floor((now.getTime() - Date.parse(event.occurredAt)) / 86_400_000); const label = days < 1 ? "Today" : days < 2 ? "Yesterday" : days < 7 ? "Earlier This Week" : days < 31 ? "Earlier This Month" : "Older"; groups.set(label, [...(groups.get(label) ?? []), event]); } return [...groups.entries()]; }
