import type { AIProvider } from "@/lib/server/ai/provider";
import { getAIProvider } from "@/lib/server/ai/provider-factory";
import type { Recommendation, RecommendationContext } from "@/lib/server/recommendation-types";

export type { Recommendation, RecommendationConfidence, RecommendationContext, RecommendationEvidence, RecommendationPriority } from "@/lib/server/recommendation-types";

export function buildRecommendations(context: RecommendationContext, provider: AIProvider = getAIProvider()): Recommendation[] {
  return provider.generateRecommendations(context);
}
