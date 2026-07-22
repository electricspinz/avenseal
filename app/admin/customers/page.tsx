import Link from "next/link";
import { AdminCard, AdminShell } from "@/components/admin-shell";
import { repository } from "@/lib/server/repository";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const customers = await repository.listCustomers();
  return (
    <AdminShell active="Customers">
      <h1 className="text-3xl font-semibold text-navy">Customers</h1>
      <AdminCard className="mt-6">
        <div className="divide-y divide-silver">
          {customers.map((customer) => (
            <Link key={customer.id} href={`/admin/customers/${customer.id}`} className="focus-ring block rounded-md py-4 hover:bg-mist">
              <span className="font-semibold text-navy">{customer.fullName}</span>
              <span className="block text-sm text-slateDeep">{customer.email} · {customer.mobilePhone}</span>
            </Link>
          ))}
        </div>
      </AdminCard>
    </AdminShell>
  );
}
