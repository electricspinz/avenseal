import React from "react";
import Link from "next/link";
import { AdminCard } from "@/components/admin-shell";
import { appointmentReadinessStatePresentation } from "@/components/appointment-readiness-presentation";
import { MissionControlEmptyState } from "@/components/mission-control/empty-state";
import { SectionHeader } from "@/components/mission-control/section-header";
import type { AppointmentReadinessState } from "@/lib/server/appointment-readiness";
import type { MissionControlReadinessOverview } from "@/lib/server/mission-control-readiness";

const operationalStates: readonly AppointmentReadinessState[] = ["ready_for_notary", "in_progress", "waiting_for_payment", "waiting_for_documents", "waiting_for_review", "waiting_for_replacement", "waiting_for_session", "blocked"];

export function MissionControlReadinessOverviewCard({ overview }: { overview: MissionControlReadinessOverview | null }) {
  return (
    <section className="mt-10" aria-labelledby="appointment-readiness-overview-heading">
      <details>
        <summary className="focus-ring cursor-pointer list-none rounded-md border border-silver bg-mist px-4 py-3 text-sm font-semibold text-navy">Appointment readiness overview</summary>
        <div className="mt-4">
          <SectionHeader id="appointment-readiness-overview-heading" title="Appointment readiness" />
          {!overview ? <MissionControlEmptyState>Appointment readiness is unavailable because trusted appointment data could not be loaded.</MissionControlEmptyState> : <ReadinessOverview overview={overview} />}
        </div>
      </details>
    </section>
  );
}

function ReadinessOverview({ overview }: { overview: MissionControlReadinessOverview }) {
  const total = Object.values(overview.counts).reduce((sum, count) => sum + count, 0);
  if (total === 0) return <MissionControlEmptyState>No appointments are available for readiness review.</MissionControlEmptyState>;
  return <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.9fr)]"><AdminCard><h3 className="text-base font-semibold text-navy">Operational breakdown</h3><dl className="mt-4 grid gap-3 sm:grid-cols-2">{operationalStates.map((state) => <ReadinessCount key={state} state={state} count={overview.counts[state]} />)}</dl><p className="mt-4 text-sm text-slateDeep">Completed: {overview.counts.completed} · Cancelled: {overview.counts.cancelled}</p></AdminCard><AdminCard><h3 className="text-base font-semibold text-navy">Ready for notarization</h3>{overview.readyForNotary.length === 0 ? <MissionControlEmptyState>No active appointments are ready for notarization.</MissionControlEmptyState> : <ol className="mt-4 divide-y divide-silver">{overview.readyForNotary.map((appointment) => <li key={appointment.appointmentId} className="py-3 first:pt-0"><p className="font-semibold text-navy">{appointment.customerName}</p><p className="mt-1 text-sm text-slateDeep">{formatDateTime(appointment.preferredDate, appointment.preferredTime)} · {appointment.serviceName}</p><span className="mt-2 inline-flex rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-900">{appointmentReadinessStatePresentation.ready_for_notary.label}</span><Link href={appointment.href} className="focus-ring ml-3 text-sm font-semibold text-emeraldAction underline underline-offset-4">Open details</Link></li>)}</ol>}</AdminCard></div>;
}

function ReadinessCount({ state, count }: { state: AppointmentReadinessState; count: number }) {
  const presentation = appointmentReadinessStatePresentation[state];
  return <div className="rounded-md border border-silver/70 px-3 py-3"><dt className="text-sm font-semibold text-slateDeep">{presentation.label}</dt><dd className={`mt-1 inline-flex rounded-md border px-2 py-1 text-sm font-semibold ${presentation.tone}`}>{count}</dd></div>;
}

function formatDateTime(date: string, time: string) {
  const parsed = new Date(`${date}T${time}`);
  if (Number.isNaN(parsed.getTime())) return "Schedule unavailable";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(parsed);
}
