import type { AppointmentReadinessPrerequisiteState, AppointmentReadinessState } from "@/lib/server/appointment-readiness";

export const appointmentReadinessStatePresentation: Record<AppointmentReadinessState, { label: string; tone: string }> = {
  cancelled: { label: "Cancelled", tone: "border-zinc-300 bg-zinc-50 text-zinc-700" },
  completed: { label: "Completed", tone: "border-emerald-300 bg-emerald-50 text-emerald-900" },
  waiting_for_payment: { label: "Waiting for payment", tone: "border-amber-300 bg-amber-50 text-amber-900" },
  waiting_for_documents: { label: "Waiting for documents", tone: "border-amber-300 bg-amber-50 text-amber-900" },
  waiting_for_review: { label: "Waiting for document review", tone: "border-amber-300 bg-amber-50 text-amber-900" },
  waiting_for_replacement: { label: "Waiting for document replacement", tone: "border-amber-300 bg-amber-50 text-amber-900" },
  waiting_for_session: { label: "Waiting for online session", tone: "border-blue-300 bg-blue-50 text-blue-900" },
  ready_for_notary: { label: "Ready for notarization", tone: "border-emerald-300 bg-emerald-50 text-emerald-900" },
  in_progress: { label: "In progress", tone: "border-blue-300 bg-blue-50 text-blue-900" },
  blocked: { label: "Blocked", tone: "border-red-300 bg-red-50 text-red-900" }
};

export const appointmentReadinessPrerequisitePresentation: Record<AppointmentReadinessPrerequisiteState, string> = {
  complete: "Complete",
  required: "Required",
  waiting: "Waiting",
  under_review: "Under review",
  needs_replacement: "Needs replacement",
  available: "Available",
  in_progress: "In progress",
  blocked: "Blocked",
  not_applicable: "Not applicable"
};
