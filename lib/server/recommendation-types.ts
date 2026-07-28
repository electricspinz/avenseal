import type { AttentionIssue } from "@/lib/server/attention-engine";
import type { MissionControlViewModel } from "@/lib/server/mission-control";
import type { OperationsFeedItem, OperationsFeedViewModel } from "@/lib/server/operations-feed";

export type RecommendationPriority = "high" | "medium" | "low";
export type RecommendationConfidence = "high" | "medium";

export type RecommendationEvidence = {
  source: "mission-control" | "attention-engine" | "operations-feed";
  label: string;
  detail: string;
  timestamp: string | null;
};

export type Recommendation = {
  id: string;
  priority: RecommendationPriority;
  title: string;
  summary: string;
  rationale: string;
  evidence: RecommendationEvidence[];
  confidence: RecommendationConfidence;
  explainable: true;
  actionLabel?: string;
  href?: string;
  source: "deterministic-recommendation-engine";
};

export type RecommendationContext = {
  missionControl: MissionControlViewModel;
  attentionIssues: AttentionIssue[];
  operationsFeed: OperationsFeedViewModel;
};

export type RecommendationFeedEvent = OperationsFeedItem;
