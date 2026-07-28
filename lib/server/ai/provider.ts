import type { Recommendation, RecommendationContext } from "@/lib/server/recommendation-types";

export interface AIProvider {
  generateRecommendations(context: RecommendationContext): Recommendation[];
}
