import { assistantStopReasons, type AssistantStopReason, type FloridaRonModule, type FloridaRonPrepareInput } from "@/lib/server/florida-ron-session-assistant";

export const productionAttemptStates = ["in_progress", "stopped"] as const;
export type ProductionAttemptState = (typeof productionAttemptStates)[number];
export const productionEvidenceSources = ["NOTARY_CONFIRMED", "SYSTEM_OBSERVED", "PROVIDER_VERIFIED"] as const;
export type ProductionEvidenceSource = (typeof productionEvidenceSources)[number];

export type FloridaRonProductionAttempt = Readonly<{
  id: string; organizationId: string; appointmentId: string; preparedSessionId: string;
  workflowVersion: string; preparedParameters: FloridaRonPrepareInput; modules: readonly FloridaRonModule[];
  state: ProductionAttemptState; currentModuleIndex: number; stopReason: AssistantStopReason | null;
  createdBy: string; createdAt: string; startedAt: string; terminalAt: string | null;
}>;

export type FloridaRonProductionEvidence = Readonly<{
  id: string; attemptId: string; moduleId: string; moduleVersion: string; requirementId: string; principalIndex: number | null;
  value: boolean; source: Exclude<ProductionEvidenceSource, "PROVIDER_VERIFIED">; actorId: string; createdAt: string;
}>;

/** Sprint 1 uses a single server-defined operational confirmation per routed module.
 * It deliberately does not create or claim statutory/provider evidence. */
export function productionRequirementId(module: FloridaRonModule) {
  return `module_complete:${module.id}@${module.version}`;
}

export function unresolvedProductionRequirements(attempt: FloridaRonProductionAttempt, evidence: readonly FloridaRonProductionEvidence[]) {
  const current = attempt.modules[attempt.currentModuleIndex];
  if (!current) return ["production_completion_not_enabled"];
  const required = productionRequirementId(current);
  return evidence.some((item) => item.moduleId === current.id && item.moduleVersion === current.version && item.requirementId === required && item.value) ? [] : [required];
}

export function isProductionStopApplicable(module: FloridaRonModule, reason: AssistantStopReason) {
  if (reason === "identity") return module.id === "FL-IDENTITY";
  if (reason === "technology") return ["FL-CORE", "FL-REMOTE-WITNESS"].includes(module.id);
  if (reason === "remote_witness" || reason === "remote_witness_presence") return module.id === "FL-REMOTE-WITNESS";
  if (reason === "outside_florida_confirmation") return module.id === "FL-OUTSIDE-FL";
  if (reason === "acknowledgment_language") return ["FL-ACK-INDIVIDUAL", "FL-ACK-REPRESENTATIVE"].includes(module.id);
  if (reason === "willingness") return module.id === "FL-WILLINGNESS";
  if (reason === "certificate_completion") return module.id === "FL-COMPLETE";
  return true;
}
export function productionApplicableStopReasons(module: FloridaRonModule) { return assistantStopReasons.filter((reason) => isProductionStopApplicable(module, reason)); }
