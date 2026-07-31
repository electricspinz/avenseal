import React from "react";
import Link from "next/link";
import { AdminCard, AdminShell } from "@/components/admin-shell";
import { AppointmentReadinessBadge } from "@/components/appointment-readiness-badge";
import { StatusBadge } from "@/components/status-badge";
import { getAppointmentListReadiness } from "@/lib/server/mission-control-readiness";
import { repository } from "@/lib/server/repository";
import { formatDate, formatTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminAppointmentsPage() {
  const appointments = await repository.listAppointments();
  const readinessItems = await getAppointmentListReadiness(appointments[0]?.organizationId ?? "", appointments);
  const readinessByAppointmentId = new Map(readinessItems.map((item) => [item.appointmentId, item]));
  return (
    <AdminShell active="Appointments">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-semibold text-navy">Appointments</h1>
          <p className="mt-2 text-sm text-slateDeep">Review, update, and audit appointment requests.</p>
        </div>
      </div>
      <AdminCard className="mt-6">
        <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slateDeep">
            <tr>
              <th className="border-b border-silver py-3">Request</th>
              <th className="border-b border-silver py-3">Customer</th>
              <th className="border-b border-silver py-3">Requested Time</th>
              <th className="border-b border-silver py-3">Status</th>
              <th className="border-b border-silver py-3">Readiness</th>
              <th className="border-b border-silver py-3">Documents</th>
            </tr>
          </thead>
          <tbody>
            {appointments.map((appointment) => (
              <tr key={appointment.id} className="border-b border-silver/70">
                <td className="py-4 font-semibold text-navy"><Link href={`/admin/appointments/${appointment.id}`}>{appointment.id}</Link></td>
                <td className="py-4 text-slateDeep">{appointment.customer.fullName}</td>
                <td className="py-4 text-slateDeep">{formatDate(appointment.preferredDate)} {formatTime(appointment.preferredTime)}</td>
                <td className="py-4"><StatusBadge status={appointment.status} /></td>
                <td className="py-4">{readinessByAppointmentId.get(appointment.id) && <AppointmentReadinessBadge state={readinessByAppointmentId.get(appointment.id)!.state} />}</td>
                <td className="py-4 text-slateDeep">{appointment.documentCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <ul className="divide-y divide-silver md:hidden">
          {appointments.map((appointment) => {
            const readiness = readinessByAppointmentId.get(appointment.id);
            return <li key={appointment.id} className="space-y-3 py-4 first:pt-0"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><Link href={`/admin/appointments/${appointment.id}`} className="focus-ring break-all font-semibold text-navy underline underline-offset-4">{appointment.id}</Link><p className="mt-1 text-sm text-slateDeep">{appointment.customer.fullName}</p><p className="mt-1 text-sm text-slateDeep">{formatDate(appointment.preferredDate)} {formatTime(appointment.preferredTime)}</p></div><Link href={`/admin/appointments/${appointment.id}`} className="focus-ring shrink-0 text-sm font-semibold text-emeraldAction underline underline-offset-4">Open</Link></div><dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="font-semibold text-slateDeep">Status</dt><dd className="mt-1"><StatusBadge status={appointment.status} /></dd></div><div><dt className="font-semibold text-slateDeep">Readiness</dt><dd className="mt-1">{readiness && <AppointmentReadinessBadge state={readiness.state} />}</dd></div><div><dt className="font-semibold text-slateDeep">Documents</dt><dd className="mt-1 text-navy">{appointment.documentCount}</dd></div></dl></li>;
          })}
        </ul>
      </AdminCard>
    </AdminShell>
  );
}
