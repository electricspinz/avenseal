import { AdminShell } from "@/components/admin-shell";
import { SystemHealthCard } from "@/components/admin-dashboard/system-health-card";
import { AttentionPanel } from "@/components/mission-control/attention-panel";
import { DailyBrief } from "@/components/mission-control/daily-brief";
import { RecommendationsFoundation, OperationsFeedFoundation, QuickActionFoundation } from "@/components/mission-control/foundation-panels";
import { SchedulePanel } from "@/components/mission-control/schedule-panel";
import { SectionHeader } from "@/components/mission-control/section-header";
import { SnapshotMetric } from "@/components/mission-control/snapshot-metric";
import { loadMissionControlViewModel } from "@/lib/server/mission-control";
import { loadOperationsFeed } from "@/lib/server/operations-feed";
import { loadAttentionIssues } from "@/lib/server/attention-engine";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const [missionControl, operationsFeed, attentionItems] = await Promise.all([loadMissionControlViewModel(), loadOperationsFeed(), loadAttentionIssues()]);

  return (
    <AdminShell active="Dashboard">
      <DailyBrief
        date={missionControl.dailyBrief.date}
        hour={missionControl.dailyBrief.hour}
        attentionCount={attentionItems.length}
        appointmentCount={missionControl.dailyBrief.appointmentsToday}
        awaitingReview={missionControl.dailyBrief.awaitingReview}
        communicationsUnavailable={missionControl.dailyBrief.communicationsUnavailable}
      />

      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(20rem,0.9fr)_minmax(0,1.5fr)]">
        <AttentionPanel items={attentionItems} />
        <SchedulePanel appointments={missionControl.schedule.appointments} timezone={missionControl.schedule.timezone} />
      </div>

      <section className="mt-8" aria-labelledby="snapshot-heading">
        <SectionHeader id="snapshot-heading" title="Business snapshot" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {missionControl.snapshot.map((metric) => <SnapshotMetric key={metric.label} {...metric} />)}
        </div>
      </section>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,0.9fr)]">
        <section aria-labelledby="system-health-heading">
          <SectionHeader id="system-health-heading" title="System health" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {missionControl.systemHealth.map((card) => <SystemHealthCard key={card.name} {...card} />)}
          </div>
        </section>
        <QuickActionFoundation />
      </div>

      <RecommendationsFoundation />
      <OperationsFeedFoundation feed={operationsFeed} />
    </AdminShell>
  );
}
