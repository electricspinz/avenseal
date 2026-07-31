import React from "react";
import { AdminCard } from "@/components/admin-shell";
import { appointmentReadinessPrerequisitePresentation, appointmentReadinessStatePresentation } from "@/components/appointment-readiness-presentation";
import type { AppointmentReadiness } from "@/lib/server/appointment-readiness";

export function AppointmentReadinessCard({ readiness }: { readiness: AppointmentReadiness }) {
  const presentation = appointmentReadinessStatePresentation[readiness.state];
  return (
    <AdminCard>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-navy">Appointment Readiness</h2>
          <p className="mt-2 max-w-2xl break-words text-sm text-slateDeep">{readiness.summary}</p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-semibold ${presentation.tone}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
          {presentation.label}
        </span>
      </div>
      <section className="mt-5" aria-labelledby="readiness-prerequisites-heading">
        <h3 id="readiness-prerequisites-heading" className="text-sm font-semibold text-navy">Prerequisites</h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          {readiness.prerequisites.map((prerequisite) => (
            <div key={prerequisite.key} className="flex items-center justify-between gap-3 rounded-md border border-silver/70 px-3 py-2 text-sm">
              <dt className="font-semibold text-slateDeep">{prerequisite.label}</dt>
              <dd className="text-right font-medium text-navy">{appointmentReadinessPrerequisitePresentation[prerequisite.state]}</dd>
            </div>
          ))}
        </dl>
      </section>
    </AdminCard>
  );
}
