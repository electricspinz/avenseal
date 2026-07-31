import { AdminShell } from "@/components/admin-shell";
import { SystemHealthCard } from "@/components/admin-dashboard/system-health-card";
import { AttentionPanel } from "@/components/mission-control/attention-panel";
import { AutomationAttentionWidget, CommunicationsAttentionWidget, RecentCustomerActivityWidget, RecentTimelineActivityWidget } from "@/components/mission-control/dashboard-widgets";
import { DailyBrief } from "@/components/mission-control/daily-brief";
import { OperationsFeedFoundation, QuickActionFoundation } from "@/components/mission-control/foundation-panels";
import { SchedulePanel } from "@/components/mission-control/schedule-panel";
import { SectionHeader } from "@/components/mission-control/section-header";
import { SnapshotMetric } from "@/components/mission-control/snapshot-metric";
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
  return <AdminShell active="Dashboard"><DailyBrief date={missionControl.dailyBrief.date} hour={missionControl.dailyBrief.hour} attentionCount={dashboard.attentionItems.length} appointmentCount={missionControl.dailyBrief.appointmentsToday} awaitingReview={missionControl.dailyBrief.awaitingReview} communicationsUnavailable={missionControl.dailyBrief.communicationsUnavailable} /><div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,0.9fr)]"><SchedulePanel appointments={missionControl.schedule.appointments} timezone={missionControl.schedule.timezone} /><AttentionPanel items={dashboard.attentionItems} /></div><MissionControlReadinessOverviewCard overview={missionControl.readiness} /><div className="mt-8 grid gap-6 lg:grid-cols-2 xl:grid-cols-3"><CommunicationsAttentionWidget communications={dashboard.communications} /><AutomationAttentionWidget automation={dashboard.automation} /><QuickActionFoundation /></div><div className="mt-8 grid gap-6 lg:grid-cols-2"><RecentCustomerActivityWidget timeline={dashboard.timeline} /><RecentTimelineActivityWidget timeline={dashboard.timeline} /></div><section className="mt-8" aria-labelledby="snapshot-heading"><SectionHeader id="snapshot-heading" title="Business snapshot" /><div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{missionControl.snapshot.map((metric) => <SnapshotMetric key={metric.label} {...metric} />)}</div></section><section className="mt-8" aria-labelledby="system-health-heading"><SectionHeader id="system-health-heading" title="System health" /><div className="mt-4 grid gap-4 sm:grid-cols-2">{missionControl.systemHealth.map((card) => <SystemHealthCard key={card.name} {...card} />)}</div></section><OperationsFeedFoundation feed={dashboard.operationsFeed} />{copilot && <MissionControlCopilotCard brief={copilot.brief} recommendations={copilot.brief.topRecommendations} />}</AdminShell>;
}
