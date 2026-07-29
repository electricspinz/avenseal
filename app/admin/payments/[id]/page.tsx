import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { PaymentDetail } from "@/components/payments-center";
import { getPayment } from "@/lib/server/payments";
export const dynamic = "force-dynamic";
export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) { const payment = await getPayment((await params).id); if (!payment) notFound(); return <AdminShell active="Payments"><Link href="/admin/payments" className="focus-ring text-sm font-semibold text-emeraldAction underline underline-offset-4">Back to Payments Center</Link><div className="mt-6"><PaymentDetail payment={payment} /></div></AdminShell>; }
