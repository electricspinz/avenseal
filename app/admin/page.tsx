import { AdminShell } from "@/components/admin-shell";
import { SystemHealthCard } from "@/components/admin-dashboard/system-health-card";
import { AttentionPanel } from "@/components/mission-control/attention-panel";
import { DailyBrief } from "@/components/mission-control/daily-brief";
import { OperationsFeedFoundation } from "@/components/mission-control/foundation-panels";
import { SchedulePanel } from "@/components/mission-control/schedule-panel";
import { SectionHeader } from "@/components/mission-control/section-header";
import { MissionControlReadinessOverviewCard } from "@/components/mission-control/readiness-overview";
import { MissionControlCopilotCard } from "@/components/copilot/copilot-components";
import { queryAvenCopilot } from "@/lib/server/copilot";
import { loadMissionControlDashboard } from "@/lib/server/mission-control-dashboard";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const [dashboard, copilot] = await Promise.all([
    loadMissionControlDashboard(),
    queryAvenCopilot().catch(() => null)
  ]);
  const { missionControl } = dashboard;
  return (
    <AdminShell active="Dashboard">
      <DailyBrief
        date={missionControl.dailyBrief.date}
        hour={missionControl.dailyBrief.hour}
        attentionCount={dashboard.attentionItems.length}
        appointmentCount={missionControl.dailyBrief.appointmentsToday}
        awaitingReview={missionControl.dailyBrief.awaitingReview}
        communicationsUnavailable={missionControl.dailyBrief.communicationsUnavailable}
      />
      <section className="mt-7">
        <AttentionPanel items={dashboard.attentionItems} />
      </section>
      <section className="mt-8">
        <SchedulePanel
          appointments={missionControl.schedule.appointments}
          timezone={missionControl.schedule.timezone}
          actions={dashboard.appointmentActions}
        />
      </section>
      <section className="mt-8" aria-labelledby="system-health-heading">
        <SectionHeader id="system-health-heading" title="Operational health" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {missionControl.systemHealth.map((card) => <SystemHealthCard key={card.name} {...card} />)}
        </div>
      </section>
      <OperationsFeedFoundation feed={dashboard.operationsFeed} />
      <MissionControlReadinessOverviewCard overview={missionControl.readiness} />
      {copilot && <MissionControlCopilotCard brief={copilot.brief} recommendations={copilot.brief.topRecommendations} />}
    </AdminShell>
  );
}
