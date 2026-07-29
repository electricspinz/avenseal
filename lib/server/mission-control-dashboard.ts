import { loadAttentionIssues, type AttentionIssue } from "@/lib/server/attention-engine";
import { loadMissionControlViewModel, type MissionControlViewModel } from "@/lib/server/mission-control";
import { loadOperationsFeed, type OperationsFeedViewModel } from "@/lib/server/operations-feed";

export type MissionControlDashboard = Readonly<{
  missionControl: MissionControlViewModel;
  attentionItems: readonly AttentionIssue[];
  operationsFeed: OperationsFeedViewModel;
  communications: Readonly<{
    failed: number | null;
    queued: number | null;
    pending: number | null;
    deliveredToday: number | null;
  }>;
  automation: Readonly<{
    manualReview: number | null;
    skipped: number | null;
    duplicateBlocked: number | null;
    recentFailures: number | null;
  }>;
  timeline: Readonly<{
    available: boolean;
    message: string;
  }>;
}>;

export type MissionControlDashboardDependencies = Readonly<{
  loadMissionControl: () => Promise<MissionControlViewModel>;
  loadAttention: () => Promise<AttentionIssue[]>;
  loadOperationsFeed: () => Promise<OperationsFeedViewModel>;
}>;

const dependencies: MissionControlDashboardDependencies = {
  loadMissionControl: () => loadMissionControlViewModel(),
  loadAttention: () => loadAttentionIssues(),
  loadOperationsFeed: () => loadOperationsFeed()
};

export async function loadMissionControlDashboard(dataSource: MissionControlDashboardDependencies = dependencies): Promise<MissionControlDashboard> {
  const [missionControl, attentionItems, operationsFeed] = await Promise.all([
    dataSource.loadMissionControl(),
    dataSource.loadAttention(),
    dataSource.loadOperationsFeed()
  ]);
  const metric = (label: string) => missionControl.snapshot.find((item) => item.label === label)?.value ?? null;

  return {
    missionControl,
    attentionItems,
    operationsFeed,
    communications: {
      failed: metric("Failed communications"),
      queued: metric("Scheduled communications"),
      pending: null,
      deliveredToday: null
    },
    // Automation execution audit records do not have a repository-backed dashboard query yet.
    automation: { manualReview: null, skipped: null, duplicateBlocked: null, recentFailures: null },
    // The current Timeline boundary supports customer/appointment-scoped reads only.
    timeline: { available: false, message: "Recent customer timeline activity is unavailable until an organization-wide timeline query is supported." }
  };
}
