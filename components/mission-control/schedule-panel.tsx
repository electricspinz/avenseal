import Link from "next/link";
import { AdminCard } from "@/components/admin-shell";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatTime } from "@/lib/utils";
import type { AppointmentRequest } from "@/lib/types";
import { MissionControlEmptyState } from "@/components/mission-control/empty-state";
import { SectionHeader } from "@/components/mission-control/section-header";

export function SchedulePanel({ appointments, unavailable = false }: { appointments: AppointmentRequest[]; unavailable?: boolean }) {
  return <AdminCard><SectionHeader id="today-schedule-heading" title="Today’s schedule" action={<Link href="/admin/appointments" className="focus-ring text-sm font-semibold text-emeraldAction underline underline-offset-4">View all</Link>} />
    {unavailable ? <MissionControlEmptyState>Today’s schedule is unavailable. Try again to load appointment information.</MissionControlEmptyState> : appointments.length === 0 ? <MissionControlEmptyState>No appointments are recorded for today.</MissionControlEmptyState> : <div className="mt-5 divide-y divide-silver">{appointments.slice(0, 5).map((appointment, index) => <div key={appointment.id} className={`grid gap-2 rounded-md py-4 sm:grid-cols-[1fr_auto] sm:items-center ${index >= 4 ? "hidden sm:grid" : "grid"}`}><span><span className="block font-semibold text-navy">{formatTime(appointment.preferredTime)} · {appointment.customer.fullName}</span><span className="mt-1 block text-sm text-slateDeep">{appointment.serviceNameSnapshot ?? "Service not recorded"} · {formatDate(appointment.preferredDate)}</span></span><span className="flex items-center gap-3"><StatusBadge status={appointment.status} /><Link href={`/admin/appointments/${appointment.id}`} className="focus-ring text-sm font-semibold text-emeraldAction underline underline-offset-4">Open details</Link></span></div>)}</div>}
  </AdminCard>;
}
