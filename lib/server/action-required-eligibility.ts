export type ProductionCutover = Readonly<{ productionCutoverAt: string | null }>;

export type ActionRequiredCandidate = Readonly<{
  archivedAt?: string | null;
  dismissedAt?: string | null;
  isTestData?: boolean;
  operationallyRelevant?: boolean;
  requiresAction: boolean;
}>;

/**
 * The sole eligibility boundary for live Action Required records. Cutover is
 * intentionally not a blind date filter: without an explicit test marker or
 * durable cleanup dismissal, an older real customer record stays actionable.
 */
export function isActionRequiredEligible(candidate: ActionRequiredCandidate, cutover: ProductionCutover): boolean {
  // A configured cutover scopes the cleanup operation; it must not hide an
  // otherwise-live record until that record has a durable dismissal marker.
  void cutover.productionCutoverAt;
  return candidate.requiresAction
    && candidate.operationallyRelevant !== false
    && !candidate.isTestData
    && !candidate.archivedAt
    && !candidate.dismissedAt;
}
