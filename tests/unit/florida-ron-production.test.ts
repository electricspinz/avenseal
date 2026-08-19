import { describe, expect, it } from "vitest";
import { floridaRonModules11, prepareSession11Schema } from "@/lib/server/florida-ron-session-assistant";
import { isProductionStopApplicable, productionRequirementId, unresolvedProductionRequirements, type FloridaRonProductionAttempt } from "@/lib/server/florida-ron-production";

const attempt: FloridaRonProductionAttempt = { id: "production-1", organizationId: "org-1", appointmentId: "appointment-1", preparedSessionId: "candidate-1", workflowVersion: "FL-RON-1.1", preparedParameters: prepareSession11Schema.parse({ jurisdiction: "Florida", notarialAct: "jurat", supportedSigningProcedure: true, notaryConfirmedNoApplicableDisqualification: true, notaryState: "Florida", notaryCounty: "Orange", principals: [{ fullName: "Principal", location: "florida", identityMethod: "personally_known", identityStatus: "passed", capacity: "individual", documentDescription: "Record", outsideFloridaConfirmation: null, notaryConfirmedDocumentComplete: true, englishLanguageUnderstanding: "yes", notaryConfirmedRequiredTranslationProvided: null }], witnesses: [], special117285: false, physicalWitnessCount: 0, notaryConfirmedProviderScreeningCompleted: null, notaryConfirmedRequiredWrittenNoticeProvided: null, section117285ScreeningResult: "not_applicable" }), modules: [floridaRonModules11.core, floridaRonModules11.identity], state: "in_progress", currentModuleIndex: 0, stopReason: null, createdBy: "admin-1", createdAt: "2026-01-01T00:00:00.000Z", startedAt: "2026-01-01T00:00:00.000Z", terminalAt: null };

describe("Florida RON production workflow foundation", () => {
  it("requires server-defined confirmation for the server current module only", () => {
    expect(unresolvedProductionRequirements(attempt, [])).toEqual([productionRequirementId(floridaRonModules11.core)]);
    expect(unresolvedProductionRequirements(attempt, [{ id: "evidence-1", attemptId: attempt.id, moduleId: "FL-CORE", moduleVersion: "1.0", requirementId: productionRequirementId(floridaRonModules11.core), principalIndex: null, value: true, source: "NOTARY_CONFIRMED", actorId: "admin-1", createdAt: "2026-01-01T00:00:00.000Z" }])).toEqual([]);
  });
  it("does not let an arbitrary STOP reason apply to every module", () => {
    expect(isProductionStopApplicable(floridaRonModules11.core, "identity")).toBe(false);
    expect(isProductionStopApplicable(floridaRonModules11.identity, "identity")).toBe(true);
  });
});
