import Link from "next/link";
import { AdminCard, AdminShell } from "@/components/admin-shell";
import { AttentionBanner } from "@/components/admin-dashboard/attention-banner";
import { deriveAttentionItems, formatMinutes, getUpcomingAppointments } from "@/components/admin-dashboard/dashboard-helpers";
import { MetricCard } from "@/components/admin-dashboard/metric-card";
import { QuickActions } from "@/components/admin-dashboard/quick-actions";
import { type HealthStatus, SystemHealthCard } from "@/components/admin-dashboard/system-health-card";
import { StatusBadge } from "@/components/status-badge";
import { repository } from "@/lib/server/repository";
import { formatDate, formatTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const [appointments, customers, settings, integrations] = await Promise.all([
    repository.listAppointments(),
    repository.listCustomers(),
    repository.getSettings(),
    repository.listIntegrations()
  ]);
  const now = new Date();
  const today = dateKey(now);
  const attentionItems = deriveAttentionItems(settings);
  const upcomingAppointments = getUpcomingAppointments(appointments, now);
  const awaitingAppointments = appointments.filter((item) => item.status === "awaiting_review");
  const activeServices = settings.services.filter((service) => service.isActive);
  const calendarIntegration = integrations.find((integration) => integration.provider === "google_calendar");
  const calendarStatus: HealthStatus = !calendarIntegration ? "unavailable" : calendarIntegration.status === "connected" ? "healthy" : "unconfigured";

  const healthCards = [
    {
      name: "Booking system",
      status: activeServices.length > 0 && settings.intervals.length > 0 ? "healthy" : "attention",
      detail: activeServices.length > 0 && settings.intervals.length > 0 ? "Active services and availability are ready for booking." : "Bookings need an active service and availability before customers can schedule.",
      href: "/admin/settings"
    },
    {
      name: "Email confirmations",
      status: settings.communications.confirmationMessagingEnabled ? "healthy" : "attention",
      detail: settings.communications.confirmationMessagingEnabled ? "New booking requests receive confirmation messaging." : "New booking requests will not receive confirmation emails.",
      href: "/admin/settings"
    },
    {
      name: "Appointment reminders",
      status: settings.communications.emailRemindersEnabled ? "healthy" : "attention",
      detail: settings.communications.emailRemindersEnabled
        ? `First reminder: ${formatMinutes(settings.communications.reminder24hMinutesBefore)} before. Second reminder: ${formatMinutes(settings.communications.reminder2hMinutesBefore)} before. Follow-up: ${formatMinutes(settings.communications.followupMinutesAfter)} after.`
        : "New appointments will not receive automated reminder emails.",
      href: "/admin/settings"
    },
    {
      name: "AI concierge",
      status: settings.concierge.conciergeEnabled ? "healthy" : "attention",
      detail: settings.concierge.conciergeEnabled ? "Automated booking assistance is available to customers." : "Customers will not receive automated booking assistance.",
      href: "/admin/settings"
    },
    {
      name: "Availability",
      status: settings.intervals.length > 0 ? "healthy" : "attention",
      detail: settings.intervals.length > 0 ? `${settings.intervals.length} availability interval${settings.intervals.length === 1 ? " is" : "s are"} configured.` : "No availability intervals are configured for customer booking.",
      href: "/admin/settings"
    },
    {
      name: "Calendar integration",
      status: calendarStatus,
      detail: calendarStatus === "healthy" ? "Google Calendar is connected and can support appointment synchronization." : calendarStatus === "unconfigured" ? "Google Calendar is not connected for this organization." : "Calendar connection status cannot be verified from the current data.",
      href: "/admin/settings/integrations",
      linkLabel: "Open integrations"
    }
  ] as const;

  return (
    <AdminShell active="Dashboard">
      <header>
        <p className="text-3xl font-semibold tracking-tight text-navy">{greetingForHour(now.getHours())}</p>
        <p className="mt-2 text-lg text-slateDeep">{attentionItems.length === 0 ? "Everything is operating normally." : `${attentionItems.length} item${attentionItems.length === 1 ? "" : "s"} require attention.`}</p>
        <h1 className="mt-3 text-sm font-semibold uppercase tracking-[0.14em] text-slateDeep">{new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(now)}</h1>
      </header>

      <AttentionBanner items={attentionItems} />

      <section className="mt-8" aria-labelledby="health-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="health-heading" className="text-xl font-semibold text-navy">System health</h2>
          <Link href="/admin/settings" className="focus-ring text-sm font-semibold text-emeraldAction underline underline-offset-4">Review settings</Link>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {healthCards.map((card) => <SystemHealthCard key={card.name} {...card} />)}
        </div>
      </section>

      <section className="mt-8" aria-labelledby="snapshot-heading">
        <h2 id="snapshot-heading" className="text-xl font-semibold text-navy">Today&apos;s snapshot</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Appointments today" value={appointments.filter((item) => item.preferredDate === today).length} />
          <MetricCard label="Awaiting review" value={awaitingAppointments.length} />
          <MetricCard label="Confirmed appointments" value={appointments.filter((item) => item.status === "confirmed").length} />
          <MetricCard label="Completed appointments" value={appointments.filter((item) => item.status === "completed").length} />
          <MetricCard label="Total customers" value={customers.length} />
        </div>
      </section>

      <QuickActions />

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.35fr_0.9fr]">
        <AdminCard>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-navy">Upcoming appointments</h2>
            <Link href="/admin/appointments" className="focus-ring shrink-0 text-sm font-semibold text-emeraldAction underline underline-offset-4">View all</Link>
          </div>
          {upcomingAppointments.length > 0 ? (
            <div className="mt-5 divide-y divide-silver">
              {upcomingAppointments.map((appointment) => (
                <Link key={appointment.id} href={`/admin/appointments/${appointment.id}`} className="focus-ring grid gap-2 rounded-md py-4 hover:bg-mist sm:grid-cols-[1fr_auto] sm:items-center">
                  <span><span className="block font-semibold text-navy">{formatDate(appointment.preferredDate)} at {formatTime(appointment.preferredTime)}</span><span className="mt-1 block text-sm text-slateDeep">{appointment.customer.fullName}</span></span>
                  <StatusBadge status={appointment.status} />
                </Link>
              ))}
            </div>
          ) : <EmptyState text="No future appointments are scheduled. New booking requests will appear here when a customer selects a future time." />}
        </AdminCard>

        <AdminCard>
          <div className="flex items-center justify-between gap-4"><h2 className="text-xl font-semibold text-navy">Recent customers</h2><Link href="/admin/customers" className="focus-ring shrink-0 text-sm font-semibold text-emeraldAction underline underline-offset-4">View all</Link></div>
          {customers.length > 0 ? <div className="mt-5 divide-y divide-silver">{customers.slice(0, 5).map((customer) => <Link key={customer.id} href={`/admin/customers/${customer.id}`} className="focus-ring block rounded-md py-4 hover:bg-mist"><span className="font-semibold text-navy">{customer.fullName}</span><span className="mt-1 block text-sm text-slateDeep">{customer.email}</span></Link>)}</div> : <EmptyState text="Customer records will appear here after a booking request is submitted." />}
        </AdminCard>
      </div>

      <AdminCard className="mt-6 overflow-x-auto">
        <div className="flex items-center justify-between gap-4"><h2 className="text-xl font-semibold text-navy">Appointments awaiting review</h2><Link href="/admin/appointments" className="focus-ring shrink-0 text-sm font-semibold text-emeraldAction underline underline-offset-4">Review appointments</Link></div>
        {awaitingAppointments.length > 0 ? <table className="mt-5 w-full min-w-[720px] text-left text-sm"><thead className="text-xs uppercase tracking-wide text-slateDeep"><tr><th className="border-b border-silver py-3">Request</th><th className="border-b border-silver py-3">Customer</th><th className="border-b border-silver py-3">Document type</th><th className="border-b border-silver py-3">Signers</th><th className="border-b border-silver py-3">Status</th></tr></thead><tbody>{awaitingAppointments.map((appointment) => <tr key={appointment.id} className="border-b border-silver/70"><td className="py-4 font-semibold text-navy"><Link className="focus-ring rounded-sm" href={`/admin/appointments/${appointment.id}`}>{appointment.id}</Link></td><td className="py-4 text-slateDeep">{appointment.customer.fullName}</td><td className="py-4 capitalize text-slateDeep">{appointment.documentCategory.replaceAll("_", " ")}</td><td className="py-4 text-slateDeep">{appointment.signerCount}</td><td className="py-4"><StatusBadge status={appointment.status} /></td></tr>)}</tbody></table> : <EmptyState text="No appointment requests are awaiting review. You are caught up." />}
      </AdminCard>
    </AdminShell>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="mt-5 rounded-md border border-dashed border-silver bg-mist/60 p-5 text-sm leading-6 text-slateDeep">{text}</p>;
}

function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
