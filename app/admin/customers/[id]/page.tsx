import { notFound } from "next/navigation";
import { AdminCard, AdminShell } from "@/components/admin-shell";
import { repository } from "@/lib/server/repository";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await repository.getCustomer(id);
  if (!customer) notFound();
  const appointments = (await repository.listAppointments()).filter((appointment) => appointment.customerId === id);
  return (
    <AdminShell active="Customers">
      <h1 className="text-3xl font-semibold text-navy">{customer.fullName}</h1>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <AdminCard>
          <h2 className="text-xl font-semibold text-navy">Customer Details</h2>
          <p className="mt-4 text-slateDeep">{customer.email}</p>
          <p className="mt-2 text-slateDeep">{customer.mobilePhone}</p>
        </AdminCard>
        <AdminCard>
          <h2 className="text-xl font-semibold text-navy">Appointment History</h2>
          <div className="mt-4 space-y-3 text-sm text-slateDeep">
            {appointments.map((appointment) => <p key={appointment.id}>{appointment.id} · {appointment.status.replaceAll("_", " ")}</p>)}
            {appointments.length === 0 && <p>No appointments yet.</p>}
          </div>
        </AdminCard>
      </div>
    </AdminShell>
  );
}
