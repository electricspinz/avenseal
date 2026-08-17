import Link from "next/link";
import { AdminCard } from "@/components/admin-shell";
import { StatusBadge } from "@/components/status-badge";
import type { AppointmentRequest } from "@/lib/types";
import { MissionControlEmptyState } from "@/components/mission-control/empty-state";
import { SectionHeader } from "@/components/mission-control/section-header";
import type { MissionControlAppointmentAction } from "@/lib/server/mission-control-next-actions";

export function SchedulePanel({ appointments, timezone, actions = [] }: { appointments: AppointmentRequest[] | null; timezone: string | null; actions?: readonly MissionControlAppointmentAction[] }) {
  const actionsByAppointment = new Map(actions.map((item) => [item.appointmentId, item]));
  return <AdminCard><SectionHeader id="today-schedule-heading" title="Today’s appointments" action={<Link href="/admin/appointments" className="focus-ring text-sm font-semibold text-emeraldAction underline underline-offset-4">View all</Link>} />
    {!appointments || !timezone ? <MissionControlEmptyState>Today’s schedule is unavailable because appointment data or the organization timezone could not be loaded.</MissionControlEmptyState> : appointments.length === 0 ? <MissionControlEmptyState>No appointments are recorded for today.</MissionControlEmptyState> : <div className="mt-4 divide-y divide-silver">{appointments.slice(0, 5).map((appointment) => { const action = actionsByAppointment.get(appointment.id); return <div key={appointment.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="min-w-0"><Link href={`/admin/appointments/${appointment.id}`} className="focus-ring block font-semibold text-navy"><span>{formatAppointmentTime(appointment.preferredTime)} · {appointment.customer?.fullName || "Customer not recorded"}</span><span className="mt-1 block truncate text-sm font-normal text-slateDeep">{appointment.serviceNameSnapshot ?? "Service not recorded"}</span></Link>{action ? <p className={`mt-2 text-sm ${action.attention ? "font-semibold text-amber-900" : "text-slateDeep"}`}>{action.attention ? "Needs attention: " : "Next: "}{action.action.title}</p> : null}</div><div className="flex flex-wrap items-center gap-3 sm:justify-end"><StatusBadge status={appointment.status} /><Link href={`/admin/appointments/${appointment.id}`} className="focus-ring text-sm font-semibold text-emeraldAction underline underline-offset-4">Open details</Link></div></div>; })}</div>}
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
