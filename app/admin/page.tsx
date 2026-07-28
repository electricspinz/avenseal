import { AdminShell } from "@/components/admin-shell";
import { deriveAttentionItems } from "@/components/admin-dashboard/dashboard-helpers";
import { type HealthStatus, SystemHealthCard } from "@/components/admin-dashboard/system-health-card";
import { AttentionPanel } from "@/components/mission-control/attention-panel";
import { DailyBrief } from "@/components/mission-control/daily-brief";
import { RecommendationsFoundation, OperationsFeedFoundation, QuickActionFoundation } from "@/components/mission-control/foundation-panels";
import { getAppointmentsForDate, dateKey } from "@/components/mission-control/helpers";
import { SchedulePanel } from "@/components/mission-control/schedule-panel";
import { SectionHeader } from "@/components/mission-control/section-header";
import { SnapshotMetric } from "@/components/mission-control/snapshot-metric";
import { repository } from "@/lib/server/repository";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const [appointmentsResult, settingsResult, integrationsResult, communicationMetricsResult] = await Promise.allSettled([
    repository.listAppointments(),
    repository.getSettings(),
    repository.listIntegrations(),
    repository.getCommunicationMetrics()
  ]);
  const now = new Date();
  const today = dateKey(now);
  const appointments = appointmentsResult.status === "fulfilled" ? appointmentsResult.value : null;
  const settings = settingsResult.status === "fulfilled" ? settingsResult.value : null;
  const integrations = integrationsResult.status === "fulfilled" ? integrationsResult.value : null;
  const communicationMetrics = communicationMetricsResult.status === "fulfilled" ? communicationMetricsResult.value : null;
  const todaysAppointments = appointments ? getAppointmentsForDate(appointments, today) : [];
  const attentionItems = settings ? deriveAttentionItems(settings) : [];
  const awaitingReview = appointments?.filter((appointment) => appointment.status === "awaiting_review").length ?? null;
  const calendarIntegration = integrations?.find((integration) => integration.provider === "google_calendar");
  const calendarStatus: HealthStatus = !integrations
    ? "unknown"
    : !calendarIntegration
      ? "unavailable"
      : calendarIntegration.status === "connected"
        ? "healthy"
        : "unconfigured";

  const healthCards = [
    {
      name: "Communications",
      status: !settings || !communicationMetrics ? "unknown" : settings.communications.confirmationMessagingEnabled && communicationMetrics.failed === 0 ? "healthy" : "attention",
      detail: !settings || !communicationMetrics ? "Communication health could not be loaded." : settings.communications.confirmationMessagingEnabled
        ? communicationMetrics.failed === 0 ? "Confirmation messaging is enabled and no failed communications are recorded." : `${communicationMetrics.failed} failed communication${communicationMetrics.failed === 1 ? " requires" : "s require"} review.`
        : "Booking confirmation messaging is disabled.",
      href: "/admin/communications",
      linkLabel: "Open communications"
    },
    {
      name: "Reminder queue",
      status: !settings || !communicationMetrics ? "unknown" : !settings.communications.emailRemindersEnabled ? "attention" : communicationMetrics.readyToQueue > 0 ? "attention" : "healthy",
      detail: !settings || !communicationMetrics ? "Reminder-queue health could not be loaded." : !settings.communications.emailRemindersEnabled
        ? "Automated appointment reminders are disabled."
        : communicationMetrics.readyToQueue > 0 ? `${communicationMetrics.readyToQueue} reminder${communicationMetrics.readyToQueue === 1 ? " is" : "s are"} ready to queue.` : "Reminder scheduling is enabled with no messages awaiting queueing.",
      href: "/admin/communications",
      linkLabel: "Open communications"
    },
    {
      name: "Calendar sync",
      status: calendarStatus,
      detail: calendarStatus === "healthy"
        ? "Google Calendar is connected."
        : calendarStatus === "unconfigured" ? "Google Calendar is not connected for this organization." : "Calendar connection status is unavailable from the current data.",
      href: "/admin/settings/integrations",
      linkLabel: "Open integrations"
    },
    {
      name: "AI concierge",
      status: !settings ? "unknown" : settings.concierge.conciergeEnabled ? "healthy" : "attention",
      detail: !settings ? "AI concierge configuration could not be loaded." : settings.concierge.conciergeEnabled ? "Automated booking assistance is enabled." : "Automated booking assistance is disabled.",
      href: "/admin/settings"
    }
  ] as const;

  return (
    <AdminShell active="Dashboard">
      <DailyBrief
        date={new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(now)}
        hour={now.getHours()}
        attentionCount={attentionItems.length}
        appointmentCount={todaysAppointments.length}
        awaitingReview={awaitingReview ?? 0}
        scheduledReminders={communicationMetrics?.scheduled ?? 0}
        appointmentsUnavailable={!appointments}
        attentionUnavailable={!settings}
        communicationsUnavailable={!communicationMetrics}
      />

      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(20rem,0.9fr)_minmax(0,1.5fr)]">
        <AttentionPanel items={attentionItems} unavailable={!settings} />
        <SchedulePanel appointments={todaysAppointments} unavailable={!appointments} />
      </div>

      <section className="mt-8" aria-labelledby="snapshot-heading">
        <SectionHeader id="snapshot-heading" title="Business snapshot" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <SnapshotMetric label="Appointments today" value={appointments ? todaysAppointments.length : null} />
          <SnapshotMetric label="Awaiting review" value={awaitingReview} />
          <SnapshotMetric label="Scheduled communications" value={communicationMetrics?.scheduled ?? null} />
          <SnapshotMetric label="Failed communications" value={communicationMetrics?.failed ?? null} />
          <SnapshotMetric label="Completed appointments" value={appointments?.filter((appointment) => appointment.status === "completed").length ?? null} />
        </div>
      </section>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,0.9fr)]">
        <section aria-labelledby="system-health-heading">
          <SectionHeader id="system-health-heading" title="System health" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {healthCards.map((card) => <SystemHealthCard key={card.name} {...card} />)}
          </div>
        </section>
        <QuickActionFoundation />
      </div>

      <RecommendationsFoundation />
      <OperationsFeedFoundation />
    </AdminShell>
  );
}
