import { z } from "zod";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** FL-RON-1.0 is retained as the immutable historical workflow. */
export const floridaRonWorkflowVersion = "FL-RON-1.0" as const;
export const floridaRonWorkflowVersion11 = "FL-RON-1.1" as const;
export type FloridaRonWorkflowVersion = typeof floridaRonWorkflowVersion | typeof floridaRonWorkflowVersion11;
export const floridaRonWorkflowStatus = "candidate" as const;
export const floridaRonSpecificationPath = "docs/compliance/florida-ron-session-assistant-v1.0-candidate.md" as const;
export const floridaRonSpecificationPath11 = "docs/compliance/florida-ron-session-assistant-v1.1-candidate.md" as const;

export const complianceClassifications = ["required_by_florida_law", "conditional_florida_requirement", "avenseal_safeguard"] as const;
export type ComplianceClassification = (typeof complianceClassifications)[number];
export const notarialActs = ["acknowledgment_individual", "acknowledgment_representative", "jurat", "other_authorized", "not_established"] as const;
export type NotarialAct = (typeof notarialActs)[number];
export const identityMethods = ["personally_known", "ron_identity_verification"] as const;
export const identityStatuses = ["pending", "passed", "failed"] as const;
export const assistantStopReasons = ["notarial_act_not_established", "unsupported_notarial_act", "unsupported_signing_procedure", "notary_disqualification", "notary_not_in_florida", "identity", "technology", "willingness", "capacity", "incomplete_document", "outside_florida_confirmation", "remote_witness", "remote_witness_presence", "declined_consent", "acknowledgment_language", "certificate_completion"] as const;
export type AssistantStopReason = (typeof assistantStopReasons)[number];
export const routingControlTypes = ["block_start", "conditional_route", "hard_stop", "block_completion"] as const;
export type RoutingControlType = (typeof routingControlTypes)[number];

export type FloridaRonModule = Readonly<{ id: string; version: string; classification: ComplianceClassification }>;
const createModule = (id: string, classification: ComplianceClassification, version = "1.0"): FloridaRonModule => ({ id, version, classification });
export const floridaRonModules = {
  core: createModule("FL-CORE", "required_by_florida_law"), identity: createModule("FL-IDENTITY", "required_by_florida_law"), location: createModule("FL-LOCATION", "required_by_florida_law"), outsideFlorida: createModule("FL-OUTSIDE-FL", "conditional_florida_requirement"), willingness: createModule("FL-WILLINGNESS", "required_by_florida_law"), ackIndividual: createModule("FL-ACK-INDIVIDUAL", "conditional_florida_requirement"), ackRepresentative: createModule("FL-ACK-REPRESENTATIVE", "conditional_florida_requirement"), jurat: createModule("FL-JURAT", "conditional_florida_requirement"), physicalWitness: createModule("FL-PHYSICAL-WITNESS", "conditional_florida_requirement"), remoteWitness: createModule("FL-REMOTE-WITNESS", "conditional_florida_requirement"), special117285: createModule("FL-117285", "conditional_florida_requirement"), multiPrincipal: createModule("FL-MULTI-PRINCIPAL", "conditional_florida_requirement"), complete: createModule("FL-COMPLETE", "required_by_florida_law")
} as const;
export const floridaRonModules11 = {
  ...floridaRonModules,
  identity: createModule("FL-IDENTITY", "required_by_florida_law", "1.1"),
  special117285: createModule("FL-117285", "conditional_florida_requirement", "1.1"),
  complete: createModule("FL-COMPLETE", "required_by_florida_law", "1.1")
} as const;

const principalSchema = z.object({ fullName: z.string().trim().min(1).max(200), location: z.enum(["florida", "outside_florida"]), identityMethod: z.enum(identityMethods), identityStatus: z.enum(identityStatuses), capacity: z.enum(["individual", "representative"]), documentDescription: z.string().trim().max(300) });
const witnessSchema = z.object({ fullName: z.string().trim().min(1).max(200), kind: z.enum(["physical", "remote"]), location: z.string().trim().min(1).max(240), identityStatus: z.enum(identityStatuses).nullable(), usResidencyConfirmed: z.boolean().nullable(), usLocationConfirmed: z.boolean().nullable() });

/** Immutable FL-RON-1.0 request schema. Do not add v1.1 controls here. */
export const prepareSessionSchema = z.object({
  jurisdiction: z.literal("Florida"), notarialAct: z.enum(notarialActs), notaryState: z.string().trim().min(1).max(64), notaryCounty: z.string().trim().max(120),
  principals: z.array(principalSchema).min(1).max(20), witnesses: z.array(witnessSchema).max(20),
  special117285: z.boolean(), physicalWitnessCount: z.number().int().min(0).max(20), providerScreening: z.enum(["unavailable", "passed", "not_permitted"])
});
export type PrepareSessionInput = z.infer<typeof prepareSessionSchema>;

const principal11Schema = principalSchema.extend({
  representativeCapacity: z.string().trim().max(200).optional(),
  representedParty: z.string().trim().max(200).optional(),
  notaryConfirmedCredentialPresentationCompleted: z.boolean().nullable().optional(),
  notaryConfirmedCredentialAnalysisPassed: z.boolean().nullable().optional(),
  notaryConfirmedIdentityProofingPassed: z.boolean().nullable().optional(),
  outsideFloridaConfirmation: z.boolean().nullable(),
  notaryConfirmedDocumentComplete: z.boolean(),
  englishLanguageUnderstanding: z.enum(["yes", "no", "unable_to_determine"]),
  notaryConfirmedRequiredTranslationProvided: z.boolean().nullable()
});
const witness11Schema = witnessSchema.extend({ remotePresenceAtSigning: z.enum(["not_applicable", "present", "lost_restored", "lost_unrestorable"]).optional() });
/** FL-RON-1.1 candidate preparation data. Provider facts are notary confirmations. */
export const prepareSession11Schema = z.object({
  jurisdiction: z.literal("Florida"), notarialAct: z.enum(notarialActs), supportedSigningProcedure: z.boolean(), notaryConfirmedNoApplicableDisqualification: z.boolean(),
  notaryState: z.string().trim().min(1).max(64), notaryCounty: z.string().trim().max(120), principals: z.array(principal11Schema).min(1).max(20), witnesses: z.array(witness11Schema).max(20),
  special117285: z.boolean(), physicalWitnessCount: z.number().int().min(0).max(20),
  notaryConfirmedProviderScreeningCompleted: z.boolean().nullable(), notaryConfirmedRequiredWrittenNoticeProvided: z.boolean().nullable(), section117285ScreeningResult: z.enum(["not_applicable", "remote_witnessing_permitted", "physical_witnesses_required"])
}).superRefine((value, context) => {
  if (value.notarialAct === "acknowledgment_representative") value.principals.forEach((principal, index) => {
    if (principal.capacity !== "representative") context.addIssue({ code: z.ZodIssueCode.custom, path: ["principals", index, "capacity"], message: "Representative acknowledgment requires representative capacity." });
    if (!principal.representativeCapacity) context.addIssue({ code: z.ZodIssueCode.custom, path: ["principals", index, "representativeCapacity"], message: "Representative capacity is required." });
    if (!principal.representedParty) context.addIssue({ code: z.ZodIssueCode.custom, path: ["principals", index, "representedParty"], message: "Represented party is required." });
  });
});
export type PrepareSession11Input = z.infer<typeof prepareSession11Schema>;
export type FloridaRonPrepareInput = PrepareSessionInput | PrepareSession11Input;

export type RoutingResult = Readonly<{ modules: readonly FloridaRonModule[]; stopReason: AssistantStopReason | null; controlType: RoutingControlType | null; productionEnabled: false }>;
const unblocked = (modules: readonly FloridaRonModule[]): RoutingResult => ({ modules, stopReason: null, controlType: null, productionEnabled: false });
const blocked = (stopReason: AssistantStopReason, controlType: RoutingControlType, modules: readonly FloridaRonModule[] = []): RoutingResult => ({ modules, stopReason, controlType, productionEnabled: false });

/** Original routing retained byte-for-byte in behavior for FL-RON-1.0 history. */
export function routeFloridaRonSession(input: PrepareSessionInput): RoutingResult {
  if (input.notarialAct === "not_established" || input.notarialAct === "other_authorized") return blocked("notarial_act_not_established", "block_start");
  if (input.notaryState.trim().toLowerCase() !== "florida") return blocked("notary_not_in_florida", "block_start");
  if (input.principals.some((principal) => principal.identityStatus === "failed")) return blocked("identity", "hard_stop", [floridaRonModules.core, floridaRonModules.identity]);
  if (input.witnesses.some((witness) => witness.kind === "remote" && (witness.identityStatus !== "passed" || witness.usResidencyConfirmed !== true || witness.usLocationConfirmed !== true))) return blocked("remote_witness", "hard_stop");
  if (input.special117285 && input.physicalWitnessCount < 2 && input.providerScreening !== "passed") return blocked("remote_witness", "hard_stop");
  const modules: FloridaRonModule[] = [floridaRonModules.core, floridaRonModules.identity, floridaRonModules.location];
  if (input.principals.length > 1) modules.push(floridaRonModules.multiPrincipal);
  for (const principal of input.principals) { if (principal.location === "outside_florida") modules.push(floridaRonModules.outsideFlorida); modules.push(floridaRonModules.willingness); }
  if (input.special117285 && input.physicalWitnessCount < 2) modules.push(floridaRonModules.special117285);
  for (const witness of input.witnesses) modules.push(witness.kind === "physical" ? floridaRonModules.physicalWitness : floridaRonModules.remoteWitness);
  modules.push(input.notarialAct === "acknowledgment_individual" ? floridaRonModules.ackIndividual : input.notarialAct === "acknowledgment_representative" ? floridaRonModules.ackRepresentative : floridaRonModules.jurat, floridaRonModules.complete);
  return unblocked(modules);
}

/** FL-RON-1.1 deterministic Candidate router; all production execution remains disabled. */
export function routeFloridaRonSession11(input: PrepareSession11Input): RoutingResult {
  if (input.notarialAct === "not_established") return blocked("notarial_act_not_established", "block_start");
  if (input.notarialAct === "other_authorized") return blocked("unsupported_notarial_act", "block_start");
  if (!input.supportedSigningProcedure) return blocked("unsupported_signing_procedure", "block_start");
  if (!input.notaryConfirmedNoApplicableDisqualification) return blocked("notary_disqualification", "block_start");
  if (input.notaryState.trim().toLowerCase() !== "florida") return blocked("notary_not_in_florida", "block_start");
  if (input.principals.some((principal) => !principal.notaryConfirmedDocumentComplete)) return blocked("incomplete_document", "hard_stop");
  const identityFailure = input.principals.some((principal) => principal.identityStatus === "failed" || (principal.identityMethod === "ron_identity_verification" && (principal.notaryConfirmedCredentialPresentationCompleted !== true || principal.notaryConfirmedCredentialAnalysisPassed !== true || principal.notaryConfirmedIdentityProofingPassed !== true)));
  if (identityFailure) return blocked("identity", "hard_stop", [floridaRonModules11.core, floridaRonModules11.identity]);
  if (input.principals.some((principal) => principal.location === "outside_florida" && principal.outsideFloridaConfirmation !== true)) return blocked("outside_florida_confirmation", "hard_stop", [floridaRonModules11.core, floridaRonModules11.identity, floridaRonModules11.location, floridaRonModules11.outsideFlorida]);
  if (input.witnesses.some((witness) => witness.kind === "remote" && (witness.identityStatus !== "passed" || witness.usResidencyConfirmed !== true || witness.usLocationConfirmed !== true))) return blocked("remote_witness", "hard_stop");
  if (input.witnesses.some((witness) => witness.kind === "remote" && witness.remotePresenceAtSigning === "lost_unrestorable")) return blocked("technology", "hard_stop");
  if (input.witnesses.some((witness) => witness.kind === "remote" && witness.remotePresenceAtSigning === "lost_restored")) return blocked("remote_witness_presence", "conditional_route");
  const section117285Applies = input.special117285 && input.physicalWitnessCount < 2;
  if (section117285Applies && (input.notaryConfirmedProviderScreeningCompleted !== true || input.notaryConfirmedRequiredWrittenNoticeProvided !== true || input.section117285ScreeningResult === "not_applicable")) return blocked("remote_witness", "block_start");
  if (section117285Applies && input.section117285ScreeningResult === "physical_witnesses_required" && input.witnesses.some((witness) => witness.kind === "remote")) return blocked("remote_witness", "block_start", [floridaRonModules11.special117285]);
  const modules: FloridaRonModule[] = [floridaRonModules11.core, floridaRonModules11.identity, floridaRonModules11.location];
  if (input.principals.length > 1) modules.push(floridaRonModules11.multiPrincipal);
  for (const principal of input.principals) { if (principal.location === "outside_florida") modules.push(floridaRonModules11.outsideFlorida); modules.push(floridaRonModules11.willingness); }
  if (section117285Applies) modules.push(floridaRonModules11.special117285);
  for (const witness of input.witnesses) modules.push(witness.kind === "physical" ? floridaRonModules11.physicalWitness : floridaRonModules11.remoteWitness);
  if (input.notarialAct !== "jurat") {
    if (input.principals.some((principal) => principal.englishLanguageUnderstanding === "unable_to_determine" || (principal.englishLanguageUnderstanding === "no" && principal.notaryConfirmedRequiredTranslationProvided !== true))) return blocked("acknowledgment_language", "block_start", modules);
  }
  modules.push(input.notarialAct === "acknowledgment_individual" ? floridaRonModules11.ackIndividual : input.notarialAct === "acknowledgment_representative" ? floridaRonModules11.ackRepresentative : floridaRonModules11.jurat, floridaRonModules11.complete);
  return unblocked(modules);
}

export function routeFloridaRonSessionForWorkflow(workflowVersion: string, input: unknown): RoutingResult {
  return workflowVersion === floridaRonWorkflowVersion11 ? routeFloridaRonSession11(prepareSession11Schema.parse(input)) : routeFloridaRonSession(prepareSessionSchema.parse(input));
}
export function prepareFloridaRonSessionForWorkflow(workflowVersion: string, input: unknown): FloridaRonPrepareInput { return workflowVersion === floridaRonWorkflowVersion11 ? prepareSession11Schema.parse(input) : prepareSessionSchema.parse(input); }
export function complianceLabel(classification: ComplianceClassification) { return classification === "required_by_florida_law" ? "Required by Florida Law" : classification === "conditional_florida_requirement" ? "Conditional Florida Requirement" : "Avenseal Safeguard"; }

export const assistantStates = ["prepared", "in_progress", "final_review", "completed", "stopped", "preview_completed"] as const;
export type AssistantState = (typeof assistantStates)[number];
export type AssistantSnapshot = Readonly<{ specificationStatus: "candidate" | "production"; state: AssistantState; modules: readonly FloridaRonModule[]; currentModuleIndex: number; stopReason: AssistantStopReason | null; principalProgress: readonly { principalIndex: number; completedModuleIds: readonly string[] }[] }>;
const floridaRonModuleSchema = z.object({ id: z.string().min(1), version: z.string().min(1), classification: z.enum(complianceClassifications) });
const persistedPreparedAttemptSchema = z.object({ id: z.string().min(1), workflow_version: z.string().min(1), specification_status: z.enum(["candidate", "production"]), state: z.literal("prepared"), stop_reason: z.enum(assistantStopReasons).nullable().optional(), parameters: z.unknown(), module_versions: z.array(floridaRonModuleSchema) });
export type FloridaRonPreparedAttempt = Readonly<{ sessionId: string; parameters: FloridaRonPrepareInput; state: "prepared"; workflowVersion: string; specificationStatus: "candidate" | "production"; modules: readonly FloridaRonModule[]; stopReason: AssistantStopReason | null; controlType: RoutingControlType | null; productionEnabled: false }>;

/** Maps an immutable, tenant-scoped persistence snapshot into its original workflow read model. */
export function mapFloridaRonPreparedAttempt(row: unknown): FloridaRonPreparedAttempt {
  const persisted = persistedPreparedAttemptSchema.parse(row);
  const parameters = prepareFloridaRonSessionForWorkflow(persisted.workflow_version, persisted.parameters);
  const routing = routeFloridaRonSessionForWorkflow(persisted.workflow_version, parameters);
  return { sessionId: persisted.id, parameters, state: persisted.state, workflowVersion: persisted.workflow_version, specificationStatus: persisted.specification_status, modules: persisted.module_versions, stopReason: persisted.stop_reason ?? routing.stopReason, controlType: routing.controlType, productionEnabled: false };
}

/** A Candidate is never executable. A future promotion must create a separate immutable production snapshot. */
export function startFloridaRonSession(snapshot: AssistantSnapshot): AssistantSnapshot { if (snapshot.specificationStatus !== "production" || snapshot.stopReason) return snapshot; return { ...snapshot, state: "in_progress" }; }
export function advanceFloridaRonSession(snapshot: AssistantSnapshot): AssistantSnapshot { if (snapshot.specificationStatus !== "production" || snapshot.state !== "in_progress" || snapshot.stopReason) return snapshot; const next = snapshot.currentModuleIndex + 1; return next >= snapshot.modules.length ? { ...snapshot, state: "final_review", currentModuleIndex: snapshot.modules.length } : { ...snapshot, currentModuleIndex: next }; }
export function stopFloridaRonSession(snapshot: AssistantSnapshot, reason: AssistantStopReason): AssistantSnapshot { return { ...snapshot, state: "stopped", stopReason: reason }; }
export function completeFloridaRonSession(snapshot: AssistantSnapshot, finalReviewConfirmed: boolean): AssistantSnapshot { if (snapshot.specificationStatus !== "production" || snapshot.state !== "final_review" || !finalReviewConfirmed || snapshot.stopReason) return snapshot; return { ...snapshot, state: "completed" }; }

/** Reads locked source unchanged; the source is the only legal/script wording boundary. */
export async function readFloridaRonCandidateSpecification(workflowVersion: string = floridaRonWorkflowVersion) { return readFile(join(process.cwd(), workflowVersion === floridaRonWorkflowVersion11 ? floridaRonSpecificationPath11 : floridaRonSpecificationPath), "utf8"); }
