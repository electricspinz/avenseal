import Link from "next/link";
import { AdminCard } from "@/components/admin-shell";
import { StatusBadge } from "@/components/status-badge";
import type { AppointmentRequest } from "@/lib/types";
import { MissionControlEmptyState } from "@/components/mission-control/empty-state";
import { SectionHeader } from "@/components/mission-control/section-header";
import type { MissionControlAppointmentAction } from "@/lib/server/mission-control-next-actions";

export function SchedulePanel({ appointments, timezone, actions = [] }: { appointments: AppointmentRequest[] | null; timezone: string | null; actions?: readonly MissionControlAppointmentAction[] }) {
  const actionsByAppointment = new Map(actions.map((item) => [item.appointmentId, item]));
  return <AdminCard><SectionHeader id="today-schedule-heading" title="Today’s schedule" action={<Link href="/admin/appointments" className="focus-ring text-sm font-semibold text-emeraldAction underline underline-offset-4">View all</Link>} />
    {!appointments || !timezone ? <MissionControlEmptyState>Today’s schedule is unavailable because appointment data or the organization timezone could not be loaded.</MissionControlEmptyState> : appointments.length === 0 ? <MissionControlEmptyState>No appointments are recorded for today.</MissionControlEmptyState> : <div className="mt-5 divide-y divide-silver">{appointments.slice(0, 5).map((appointment, index) => { const action = actionsByAppointment.get(appointment.id); return <div key={appointment.id} className={`grid gap-2 rounded-md py-4 sm:grid-cols-[1fr_auto] sm:items-center ${index >= 4 ? "hidden sm:grid" : "grid"}`}><span><span className="block font-semibold text-navy">{formatAppointmentTime(appointment.preferredTime)} · {appointment.customer?.fullName || "Customer not recorded"}</span><span className="mt-1 block text-sm text-slateDeep">{appointment.serviceNameSnapshot ?? "Service not recorded"} · {timezone}</span>{action ? <span className="mt-1 block text-sm text-slateDeep">Next: {action.action.title}</span> : null}</span><span className="flex items-center gap-3"><StatusBadge status={appointment.status} /><Link href={`/admin/appointments/${appointment.id}`} className="focus-ring text-sm font-semibold text-emeraldAction underline underline-offset-4">Open details</Link></span></div>; })}</div>}
  </AdminCard>;
}

function formatAppointmentTime(time: string) {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time);
  if (!match) return "Time unavailable";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return "Time unavailable";
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit" }).format(new Date(Date.UTC(2026, 0, 1, hours, minutes)));
}
