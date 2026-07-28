import type { AttentionIssue } from "@/lib/server/attention-engine";
import type { OperationsFeedItem } from "@/lib/server/operations-feed";
import type { AIProvider } from "@/lib/server/ai/provider";
import type { Recommendation, RecommendationContext, RecommendationEvidence, RecommendationPriority } from "@/lib/server/recommendation-types";

const priorityRank: Record<RecommendationPriority, number> = { high: 0, medium: 1, low: 2 };

export class DeterministicProvider implements AIProvider {
  generateRecommendations(context: RecommendationContext): Recommendation[] {
    const recommendations = [
      failedCommunicationsRecommendation(context),
      reconnectCalendarRecommendation(context),
      reviewAppointmentsRecommendation(context),
      quietDayRecommendation(context)
    ].filter((recommendation): recommendation is Recommendation => Boolean(recommendation));

    return recommendations.sort(compareRecommendations);
  }
}

function failedCommunicationsRecommendation(context: RecommendationContext): Recommendation | null {
  const issues = context.attentionIssues.filter((issue) => issue.id.startsWith("communication-failed:"));
  if (issues.length === 0) return null;
  const latestFeedEvent = latestEvent(context.operationsFeed.items, "communication_failed");
  return {
    id: "review-failed-communications",
    priority: "high",
    title: "Review failed communications",
    summary: `${issues.length} communication${issues.length === 1 ? " requires" : "s require"} review.`,
    rationale: "Failed communications need operator review before any eligible retry.",
    evidence: [
      { source: "attention-engine", label: "Failed communications", detail: `${issues.length} failed communication${issues.length === 1 ? " was" : "s were"} identified.`, timestamp: newestIssueTimestamp(issues) },
      ...(latestFeedEvent ? [feedEvidence(latestFeedEvent)] : [])
    ],
    confidence: "high",
    explainable: true,
    actionLabel: "Open communications",
    href: "/admin/communications",
    source: "deterministic-recommendation-engine"
  };
}

function reconnectCalendarRecommendation(context: RecommendationContext): Recommendation | null {
  const issue = context.attentionIssues.find((item) => item.id === "calendar-integration-disconnected");
  if (!issue) return null;
  return {
    id: "reconnect-calendar",
    priority: "high",
    title: "Reconnect calendar",
    summary: "Google Calendar requires reconnection.",
    rationale: "Calendar synchronization cannot be verified while the integration is disconnected.",
    evidence: [{ source: "attention-engine", label: issue.title, detail: issue.description, timestamp: issue.createdAt }],
    confidence: "high",
    explainable: true,
    actionLabel: issue.actionLabel,
    href: issue.href,
    source: "deterministic-recommendation-engine"
  };
}

function reviewAppointmentsRecommendation(context: RecommendationContext): Recommendation | null {
  const issues = context.attentionIssues.filter((issue) => issue.id.startsWith("appointment-awaiting-review:"));
  if (issues.length === 0) return null;
  return {
    id: "review-awaiting-appointments",
    priority: "medium",
    title: "Review awaiting appointments",
    summary: `${issues.length} appointment${issues.length === 1 ? " is" : "s are"} awaiting review.`,
    rationale: "These appointment requests have a persisted Awaiting Review status.",
    evidence: [{ source: "attention-engine", label: "Appointments awaiting review", detail: `${issues.length} appointment${issues.length === 1 ? " is" : "s are"} awaiting review.`, timestamp: newestIssueTimestamp(issues) }],
    confidence: "high",
    explainable: true,
    actionLabel: "Review appointments",
    href: "/admin/appointments",
    source: "deterministic-recommendation-engine"
  };
}

function quietDayRecommendation(context: RecommendationContext): Recommendation | null {
  if (context.missionControl.dailyBrief.appointmentsToday !== 0) return null;
  if (context.attentionIssues.some((issue) => issue.priority !== "low" || issue.id.startsWith("unknown-"))) return null;
  return {
    id: "quiet-day-review",
    priority: "low",
    title: "Quiet day",
    summary: "No appointments are recorded for today.",
    rationale: "The organization-day appointment count is zero and no higher-priority issue is present.",
    evidence: [{ source: "mission-control", label: "Appointments today", detail: "No appointments are recorded for the organization day.", timestamp: null }],
    confidence: "medium",
    explainable: true,
    actionLabel: "Open appointments",
    href: "/admin/appointments",
    source: "deterministic-recommendation-engine"
  };
}

function latestEvent(items: OperationsFeedItem[], eventType: OperationsFeedItem["eventType"]) {
  return items.find((item) => item.eventType === eventType) ?? null;
}

function feedEvidence(item: OperationsFeedItem): RecommendationEvidence {
  return { source: "operations-feed", label: item.title, detail: item.description, timestamp: item.timestamp };
}

function newestIssueTimestamp(issues: AttentionIssue[]) {
  return issues.reduce<string | null>((latest, issue) => {
    if (!issue.createdAt) return latest;
    if (!latest || timestampValue(issue.createdAt) > timestampValue(latest)) return issue.createdAt;
    return latest;
  }, null);
}

function compareRecommendations(left: Recommendation, right: Recommendation) {
  const priorityDifference = priorityRank[left.priority] - priorityRank[right.priority];
  if (priorityDifference !== 0) return priorityDifference;
  return left.id.localeCompare(right.id);
}

function timestampValue(timestamp: string) {
  const value = Date.parse(timestamp);
  return Number.isNaN(value) ? 0 : value;
}
