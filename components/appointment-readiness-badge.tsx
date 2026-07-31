import React from "react";
import { appointmentReadinessStatePresentation } from "@/components/appointment-readiness-presentation";
import type { AppointmentReadinessState } from "@/lib/server/appointment-readiness";

export function AppointmentReadinessBadge({ state }: { state: AppointmentReadinessState }) {
  const presentation = appointmentReadinessStatePresentation[state];
  return <span className={`inline-flex max-w-full items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-semibold ${presentation.tone}`}><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" /><span className="break-words">{presentation.label}</span></span>;
}
