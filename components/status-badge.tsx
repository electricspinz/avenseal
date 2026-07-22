import { appointmentStatusLabels, type AppointmentStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const styles: Record<AppointmentStatus, string> = {
  awaiting_review: "border-amber-300 bg-amber-50 text-amber-900",
  awaiting_payment: "border-yellow-300 bg-yellow-50 text-yellow-900",
  clarification_needed: "border-purple-300 bg-purple-50 text-purple-900",
  approved_pending_payment: "border-yellow-300 bg-yellow-50 text-yellow-900",
  payment_processing: "border-blue-300 bg-blue-50 text-blue-900",
  confirmed: "border-emerald-300 bg-emerald-50 text-emerald-900",
  ready: "border-blue-300 bg-blue-50 text-blue-900",
  completed: "border-slate-300 bg-slate-50 text-slate-800",
  cancelled: "border-zinc-300 bg-zinc-50 text-zinc-700",
  declined: "border-red-300 bg-red-50 text-red-900",
  follow_up_required: "border-purple-300 bg-purple-50 text-purple-900",
  no_show: "border-red-300 bg-red-50 text-red-900"
};

export function StatusBadge({ status, className }: { status: AppointmentStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-semibold", styles[status], className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {appointmentStatusLabels[status]}
    </span>
  );
}
