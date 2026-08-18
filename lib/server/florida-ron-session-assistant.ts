import { z } from "zod";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const floridaRonWorkflowVersion = "FL-RON-1.0" as const;
export const floridaRonWorkflowStatus = "candidate" as const;
export const floridaRonSpecificationPath = "docs/compliance/florida-ron-session-assistant-v1.0-candidate.md" as const;

export const complianceClassifications = ["required_by_florida_law", "conditional_florida_requirement", "avenseal_safeguard"] as const;
export type ComplianceClassification = (typeof complianceClassifications)[number];
export const notarialActs = ["acknowledgment_individual", "acknowledgment_representative", "jurat", "other_authorized", "not_established"] as const;
export type NotarialAct = (typeof notarialActs)[number];
export const identityMethods = ["personally_known", "ron_identity_verification"] as const;
export const identityStatuses = ["pending", "passed", "failed"] as const;
export const assistantStopReasons = ["notarial_act_not_established", "notary_not_in_florida", "identity", "technology", "willingness", "capacity", "incomplete_document", "outside_florida_confirmation", "remote_witness", "declined_consent"] as const;
export type AssistantStopReason = (typeof assistantStopReasons)[number];

export type FloridaRonModule = Readonly<{ id: string; version: string; classification: ComplianceClassification }>;
const createModule = (id: string, classification: ComplianceClassification): FloridaRonModule => ({ id, version: "1.0", classification });
export const floridaRonModules = {
  core: createModule("FL-CORE", "required_by_florida_law"), identity: createModule("FL-IDENTITY", "required_by_florida_law"), location: createModule("FL-LOCATION", "required_by_florida_law"), outsideFlorida: createModule("FL-OUTSIDE-FL", "conditional_florida_requirement"), willingness: createModule("FL-WILLINGNESS", "required_by_florida_law"), ackIndividual: createModule("FL-ACK-INDIVIDUAL", "conditional_florida_requirement"), ackRepresentative: createModule("FL-ACK-REPRESENTATIVE", "conditional_florida_requirement"), jurat: createModule("FL-JURAT", "conditional_florida_requirement"), physicalWitness: createModule("FL-PHYSICAL-WITNESS", "conditional_florida_requirement"), remoteWitness: createModule("FL-REMOTE-WITNESS", "conditional_florida_requirement"), special117285: createModule("FL-117285", "conditional_florida_requirement"), multiPrincipal: createModule("FL-MULTI-PRINCIPAL", "conditional_florida_requirement"), complete: createModule("FL-COMPLETE", "required_by_florida_law")
} as const;

export const prepareSessionSchema = z.object({
  jurisdiction: z.literal("Florida"), notarialAct: z.enum(notarialActs), notaryState: z.string().trim().min(1).max(64), notaryCounty: z.string().trim().max(120),
  principals: z.array(z.object({ fullName: z.string().trim().min(1).max(200), location: z.enum(["florida", "outside_florida"]), identityMethod: z.enum(identityMethods), identityStatus: z.enum(identityStatuses), capacity: z.enum(["individual", "representative"]), documentDescription: z.string().trim().max(300) })).min(1).max(20),
  witnesses: z.array(z.object({ fullName: z.string().trim().min(1).max(200), kind: z.enum(["physical", "remote"]), location: z.string().trim().min(1).max(240), identityStatus: z.enum(identityStatuses).nullable(), usResidencyConfirmed: z.boolean().nullable(), usLocationConfirmed: z.boolean().nullable() })).max(20),
  special117285: z.boolean(), physicalWitnessCount: z.number().int().min(0).max(20), providerScreening: z.enum(["unavailable", "passed", "not_permitted"])
});
export type PrepareSessionInput = z.infer<typeof prepareSessionSchema>;

export type RoutingResult = Readonly<{ modules: readonly FloridaRonModule[]; stopReason: AssistantStopReason | null; productionEnabled: false }>;
export function routeFloridaRonSession(input: PrepareSessionInput): RoutingResult {
  // The candidate specification contains no approved module for "other authorized" acts.
  // Fail closed rather than selecting an act from a document title or UI convenience.
  if (input.notarialAct === "not_established" || input.notarialAct === "other_authorized") return { modules: [], stopReason: "notarial_act_not_established", productionEnabled: false };
  if (input.notaryState.trim().toLowerCase() !== "florida") return { modules: [], stopReason: "notary_not_in_florida", productionEnabled: false };
  if (input.principals.some((principal) => principal.identityStatus === "failed")) return { modules: [floridaRonModules.core, floridaRonModules.identity], stopReason: "identity", productionEnabled: false };
  if (input.witnesses.some((witness) => witness.kind === "remote" && (witness.identityStatus !== "passed" || witness.usResidencyConfirmed !== true || witness.usLocationConfirmed !== true))) return { modules: [], stopReason: "remote_witness", productionEnabled: false };
  if (input.special117285 && input.physicalWitnessCount < 2 && input.providerScreening !== "passed") return { modules: [], stopReason: "remote_witness", productionEnabled: false };
  const modules: FloridaRonModule[] = [floridaRonModules.core, floridaRonModules.identity, floridaRonModules.location];
  if (input.principals.length > 1) modules.push(floridaRonModules.multiPrincipal);
  for (const principal of input.principals) { if (principal.location === "outside_florida") modules.push(floridaRonModules.outsideFlorida); modules.push(floridaRonModules.willingness); }
  if (input.special117285 && input.physicalWitnessCount < 2) modules.push(floridaRonModules.special117285);
  for (const witness of input.witnesses) modules.push(witness.kind === "physical" ? floridaRonModules.physicalWitness : floridaRonModules.remoteWitness);
  modules.push(input.notarialAct === "acknowledgment_individual" ? floridaRonModules.ackIndividual : input.notarialAct === "acknowledgment_representative" ? floridaRonModules.ackRepresentative : floridaRonModules.jurat, floridaRonModules.complete);
  return { modules, stopReason: null, productionEnabled: false };
}

export function complianceLabel(classification: ComplianceClassification) { return classification === "required_by_florida_law" ? "Required by Florida Law" : classification === "conditional_florida_requirement" ? "Conditional Florida Requirement" : "Avenseal Safeguard"; }

export const assistantStates = ["prepared", "in_progress", "final_review", "completed", "stopped"] as const;
export type AssistantState = (typeof assistantStates)[number];
export type AssistantSnapshot = Readonly<{ specificationStatus: "candidate" | "production"; state: AssistantState; modules: readonly FloridaRonModule[]; currentModuleIndex: number; stopReason: AssistantStopReason | null; principalProgress: readonly { principalIndex: number; completedModuleIds: readonly string[] }[] }>;

const floridaRonModuleSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  classification: z.enum(complianceClassifications)
});

const persistedPreparedAttemptSchema = z.object({
  id: z.string().min(1),
  workflow_version: z.string().min(1),
  specification_status: z.enum(["candidate", "production"]),
  state: z.literal("prepared"),
  stop_reason: z.enum(assistantStopReasons).nullable().optional(),
  parameters: prepareSessionSchema,
  module_versions: z.array(floridaRonModuleSchema)
});

export type FloridaRonPreparedAttempt = Readonly<{
  sessionId: string;
  parameters: PrepareSessionInput;
  state: "prepared";
  workflowVersion: string;
  specificationStatus: "candidate" | "production";
  modules: readonly FloridaRonModule[];
  stopReason: AssistantStopReason | null;
  productionEnabled: false;
}>;

/** Maps the immutable, tenant-scoped persistence snapshot into the read model. */
export function mapFloridaRonPreparedAttempt(row: unknown): FloridaRonPreparedAttempt {
  const persisted = persistedPreparedAttemptSchema.parse(row);
  return {
    sessionId: persisted.id,
    parameters: persisted.parameters,
    state: persisted.state,
    workflowVersion: persisted.workflow_version,
    specificationStatus: persisted.specification_status,
    modules: persisted.module_versions,
    // Older prepared records predate stop_reason persistence. Their routing result is
    // deterministic from their immutable parameters, so retain a safe read path for them.
    stopReason: persisted.stop_reason ?? routeFloridaRonSession(persisted.parameters).stopReason,
    productionEnabled: false
  };
}

/** A candidate is never executable. Promotion must create a new immutable production snapshot. */
export function startFloridaRonSession(snapshot: AssistantSnapshot): AssistantSnapshot {
  if (snapshot.specificationStatus !== "production" || snapshot.stopReason) return snapshot;
  return { ...snapshot, state: "in_progress" };
}
export function advanceFloridaRonSession(snapshot: AssistantSnapshot): AssistantSnapshot {
  if (snapshot.specificationStatus !== "production" || snapshot.state !== "in_progress" || snapshot.stopReason) return snapshot;
  const next = snapshot.currentModuleIndex + 1;
  return next >= snapshot.modules.length ? { ...snapshot, state: "final_review", currentModuleIndex: snapshot.modules.length } : { ...snapshot, currentModuleIndex: next };
}
export function stopFloridaRonSession(snapshot: AssistantSnapshot, reason: AssistantStopReason): AssistantSnapshot {
  return { ...snapshot, state: "stopped", stopReason: reason };
}
export function completeFloridaRonSession(snapshot: AssistantSnapshot, finalReviewConfirmed: boolean): AssistantSnapshot {
  if (snapshot.specificationStatus !== "production" || snapshot.state !== "final_review" || !finalReviewConfirmed || snapshot.stopReason) return snapshot;
  return { ...snapshot, state: "completed" };
}

/** Reads the locked source unchanged; UI clients receive only its exact sections through an authorized server boundary. */
export async function readFloridaRonCandidateSpecification() {
  return readFile(join(process.cwd(), floridaRonSpecificationPath), "utf8");
}
