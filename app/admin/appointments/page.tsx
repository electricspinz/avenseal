import Link from "next/link";
import { AdminCard, AdminShell } from "@/components/admin-shell";
import { StatusBadge } from "@/components/status-badge";
import { repository } from "@/lib/server/repository";
import { formatDate, formatTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminAppointmentsPage() {
  const appointments = await repository.listAppointments();
  return (
    <AdminShell active="Appointments">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-semibold text-navy">Appointments</h1>
          <p className="mt-2 text-sm text-slateDeep">Review, update, and audit appointment requests.</p>
        </div>
      </div>
      <AdminCard className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slateDeep">
            <tr>
              <th className="border-b border-silver py-3">Request</th>
              <th className="border-b border-silver py-3">Customer</th>
              <th className="border-b border-silver py-3">Requested Time</th>
              <th className="border-b border-silver py-3">Status</th>
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
                <td className="py-4 text-slateDeep">{appointment.documentCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminCard>
    </AdminShell>
  );
}
