import Link from "next/link";
import { AdminCard, AdminShell } from "@/components/admin-shell";
import { communicationTypeLabel, communicationTypeLabels, CommunicationStatusBadge, formatCommunicationTime } from "@/components/admin-communications";
import { AttentionBanner } from "@/components/admin-dashboard/attention-banner";
import { MetricCard } from "@/components/admin-dashboard/metric-card";
import { repository } from "@/lib/server/repository";

export const dynamic = "force-dynamic";

const statuses = ["all", "scheduled", "queued", "sent", "failed"] as const;

export default async function CommunicationsPage({ searchParams }: { searchParams?: Promise<{ page?: string; status?: string; type?: string }> }) {
  const params = await searchParams;
  const page = Math.max(Number(params?.page ?? "1") || 1, 1);
  const rawStatus = params?.status;
  const status = rawStatus && rawStatus !== "all" && statuses.includes(rawStatus as (typeof statuses)[number])
    ? rawStatus as (typeof statuses)[number]
    : undefined;
  const type = params?.type && Object.hasOwn(communicationTypeLabels, params.type) ? params.type : undefined;
  const [settings, communications, metrics] = await Promise.all([
    repository.getSettings(),
    repository.listAdminCommunications({ page, status, type }),
    repository.getCommunicationMetrics()
  ]);
  const attention = [
    ...(!settings.communications.emailRemindersEnabled ? [{ id: "email-reminders", title: "Appointment reminders are disabled.", description: "Customers will not receive 24-hour, 2-hour, or follow-up reminder emails for new appointments.", href: "/admin/settings" }] : []),
    ...(!settings.communications.confirmationMessagingEnabled ? [{ id: "confirmations", title: "Booking confirmations are disabled.", description: "Customers will not receive confirmation emails after submitting a booking request.", href: "/admin/settings" }] : []),
    ...(metrics.readyToQueue > 0 ? [{ id: "overdue-reminders", title: `${metrics.readyToQueue} reminder${metrics.readyToQueue === 1 ? " is" : "s are"} ready to queue.`, description: "The scheduled time has passed, but these reminders have not yet entered the communications queue.", href: "/admin/communications" }] : []),
    ...(metrics.failed > 0 ? [{ id: "failed", title: `${metrics.failed} communication${metrics.failed === 1 ? " has" : "s have"} failed.`, description: "Affected customers may not have received the intended appointment communication.", href: "/admin/communications?status=failed" }] : [])
  ];
  const summary = attention.length === 0 ? "No failed communications are recorded. Delivery-provider health is not available here." : `${attention.length} item${attention.length === 1 ? "" : "s"} require attention.`;

  return <AdminShell active="Communications">
    <header><h1 className="text-3xl font-semibold text-navy">Communications</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slateDeep">Monitor appointment confirmations, reminders, follow-ups, and review requests.</p><p className="mt-4 text-sm font-semibold text-slateDeep">{summary}</p></header>
    <AttentionBanner items={attention} />
    <section className="mt-8" aria-labelledby="metrics-heading"><h2 id="metrics-heading" className="text-xl font-semibold text-navy">Communication activity</h2><div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Scheduled" value={metrics.scheduled} /><MetricCard label="Queued" value={metrics.queued} /><MetricCard label="Sent" value={metrics.sent} /><MetricCard label="Failed" value={metrics.failed} /></div></section>
    <section className="mt-8" aria-labelledby="communications-list-heading"><div className="flex flex-wrap items-baseline justify-between gap-3"><h2 id="communications-list-heading" className="text-xl font-semibold text-navy">All communications</h2><p className="text-sm text-slateDeep">{communications.totalRecords} record{communications.totalRecords === 1 ? "" : "s"}</p></div><Filters status={status} type={type} />
      <AdminCard className="mt-4 overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="text-xs uppercase tracking-wide text-slateDeep"><tr><th className="border-b border-silver py-3">Communication</th><th className="border-b border-silver py-3">Customer</th><th className="border-b border-silver py-3">Recipient</th><th className="border-b border-silver py-3">Status</th><th className="border-b border-silver py-3">Scheduled</th><th className="border-b border-silver py-3">Sent</th><th className="border-b border-silver py-3">Action</th></tr></thead><tbody>{communications.records.map((item) => <tr key={item.id} className="border-b border-silver/70 align-top"><td className="py-4"><Link href={`/admin/communications/${encodeURIComponent(item.id)}`} className="focus-ring rounded-sm font-semibold text-navy underline underline-offset-4">{communicationTypeLabel(item.messageType)}</Link>{item.appointmentId && <Link href={`/admin/appointments/${item.appointmentId}`} className="mt-1 block text-xs font-semibold text-emeraldAction underline underline-offset-4">Appointment</Link>}</td><td className="py-4 text-slateDeep">{item.customerName ?? "Not recorded"}</td><td className="py-4 text-slateDeep">{item.recipientEmail}</td><td className="py-4"><CommunicationStatusBadge status={item.status} />{item.lastError && <p className="mt-2 max-w-48 text-xs leading-5 text-red-800">{item.lastError}</p>}</td><td className="py-4 text-slateDeep">{formatCommunicationTime(item.scheduledFor, settings.business.timezone)}</td><td className="py-4 text-slateDeep">{formatCommunicationTime(item.sentAt, settings.business.timezone)}</td><td className="py-4"><Link href={`/admin/communications/${encodeURIComponent(item.id)}`} className="focus-ring rounded-sm font-semibold text-emeraldAction underline underline-offset-4">View</Link></td></tr>)}</tbody></table>{communications.records.length === 0 && <p className="p-5 text-sm leading-6 text-slateDeep">No communications match these filters. Scheduled reminders and queued messages will appear here when records exist.</p>}</AdminCard>
      <Pagination current={communications.currentPage} total={communications.totalPages} status={status} type={type} />
    </section>
  </AdminShell>;
}

function Filters({ status, type }: { status?: string; type?: string }) { return <div className="mt-4 flex flex-wrap gap-2"><span className="sr-only">Filter by status</span>{statuses.map((item) => <Link key={item} href={query({ status: item === "all" ? undefined : item, type })} className={`focus-ring rounded-md border px-3 py-2 text-sm font-semibold ${status === item || (!status && item === "all") ? "border-navy bg-navy text-white" : "border-silver bg-white text-navy hover:bg-mist"}`}>{item === "all" ? "All" : item[0].toUpperCase() + item.slice(1)}</Link>)}<span className="mx-1 hidden h-8 border-l border-silver sm:block" aria-hidden="true" />{Object.entries(communicationTypeLabels).slice(0, 5).map(([key, label]) => <Link key={key} href={query({ status, type: key })} className={`focus-ring rounded-md border px-3 py-2 text-sm font-semibold ${type === key ? "border-navy bg-navy text-white" : "border-silver bg-white text-navy hover:bg-mist"}`}>{label}</Link>)}</div>; }
function Pagination({ current, total, status, type }: { current: number; total: number; status?: string; type?: string }) { if (total <= 1) return null; return <nav aria-label="Communications pagination" className="mt-5 flex items-center justify-between text-sm"><span className="text-slateDeep">Page {current} of {total}</span><div className="flex gap-3">{current > 1 && <Link className="focus-ring font-semibold text-emeraldAction underline underline-offset-4" href={query({ page: current - 1, status, type })}>Previous</Link>}{current < total && <Link className="focus-ring font-semibold text-emeraldAction underline underline-offset-4" href={query({ page: current + 1, status, type })}>Next</Link>}</div></nav>; }
function query(input: { page?: number; status?: string; type?: string }) { const params = new URLSearchParams(); if (input.page && input.page > 1) params.set("page", String(input.page)); if (input.status) params.set("status", input.status); if (input.type) params.set("type", input.type); const value = params.toString(); return value ? `/admin/communications?${value}` : "/admin/communications"; }
