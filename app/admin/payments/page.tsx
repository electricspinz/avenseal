import { AdminShell } from "@/components/admin-shell";
import { PaymentsCenter } from "@/components/payments-center";
import { queryPayments } from "@/lib/server/payments";
export const dynamic = "force-dynamic";
export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) { return <AdminShell active="Payments"><PaymentsCenter records={await queryPayments(await searchParams)} /></AdminShell>; }
