import Link from "next/link";
import { AdminCard, AdminShell } from "@/components/admin-shell";
import { StatusBadge } from "@/components/status-badge";
import { repository } from "@/lib/server/repository";
import { formatDate, formatTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const appointments = await repository.listAppointments();
  const customers = await repository.listCustomers();
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = appointments.filter((item) => item.preferredDate === today).length;
  const awaiting = appointments.filter((item) => item.status === "awaiting_review").length;
  const confirmed = appointments.filter((item) => item.status === "confirmed").length;
  const completed = appointments.filter((item) => item.status === "completed").length;

  return (
    <AdminShell active="Dashboard">
      <h1 className="text-3xl font-semibold text-navy">Dashboard</h1>
      <div className="mt-6 grid gap-4 md:grid-cols-4">
        {[
          ["Today's appointment requests", todayCount],
          ["Awaiting-review count", awaiting],
          ["Confirmed appointments", confirmed],
          ["Completed appointments", completed]
        ].map(([label, value]) => (
          <AdminCard key={label as string}>
            <p className="text-sm font-semibold text-slateDeep">{label}</p>
            <p className="mt-3 text-3xl font-semibold text-navy">{value}</p>
          </AdminCard>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <AdminCard>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-navy">Upcoming appointment times</h2>
            <Link href="/admin/appointments" className="text-sm font-semibold text-emeraldAction">View all</Link>
          </div>
          <div className="mt-5 space-y-3">
            {appointments.slice(0, 5).map((appointment) => (
              <Link key={appointment.id} href={`/admin/appointments/${appointment.id}`} className="focus-ring grid rounded-md border border-silver p-4 hover:bg-mist">
                <span className="font-semibold text-navy">{formatDate(appointment.preferredDate)} at {formatTime(appointment.preferredTime)}</span>
                <span className="mt-1 text-sm text-slateDeep">{appointment.customer.fullName}</span>
                <StatusBadge status={appointment.status} className="mt-3 w-max" />
              </Link>
            ))}
          </div>
        </AdminCard>
        <AdminCard>
          <h2 className="text-xl font-semibold text-navy">Recent customers</h2>
          <div className="mt-5 divide-y divide-silver">
            {customers.slice(0, 5).map((customer) => (
              <Link key={customer.id} href={`/admin/customers/${customer.id}`} className="focus-ring block rounded-md py-4 hover:bg-mist">
                <span className="font-semibold text-navy">{customer.fullName}</span>
                <span className="block text-sm text-slateDeep">{customer.email}</span>
              </Link>
            ))}
          </div>
        </AdminCard>
      </div>
      <AdminCard className="mt-6 overflow-x-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-navy">Appointment requests awaiting review</h2>
          <Link href="/admin/appointments" className="text-sm font-semibold text-emeraldAction">View all</Link>
        </div>
        <table className="mt-5 w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slateDeep">
            <tr>
              <th className="border-b border-silver py-3">Request</th>
              <th className="border-b border-silver py-3">Customer</th>
              <th className="border-b border-silver py-3">Document Type</th>
              <th className="border-b border-silver py-3">Signers</th>
              <th className="border-b border-silver py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {appointments.filter((item) => item.status === "awaiting_review").map((appointment) => (
              <tr key={appointment.id} className="border-b border-silver/70">
                <td className="py-4 font-semibold text-navy"><Link href={`/admin/appointments/${appointment.id}`}>{appointment.id}</Link></td>
                <td className="py-4 text-slateDeep">{appointment.customer.fullName}</td>
                <td className="py-4 capitalize text-slateDeep">{appointment.documentCategory.replaceAll("_", " ")}</td>
                <td className="py-4 text-slateDeep">{appointment.signerCount}</td>
                <td className="py-4"><StatusBadge status={appointment.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminCard>
    </AdminShell>
  );
}
