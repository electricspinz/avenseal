import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { advanceFloridaRonSession, completeFloridaRonSession, floridaRonWorkflowVersion, floridaRonWorkflowVersion11, prepareSession11Schema, prepareSessionSchema, routeFloridaRonSession, routeFloridaRonSession11, startFloridaRonSession } from "@/lib/server/florida-ron-session-assistant";
import { readFloridaRonCandidatePreviewModules, requiredFloridaRonCandidateCompletionConfirmations } from "@/lib/server/florida-ron-candidate-preview";

const base = prepareSession11Schema.parse({
  jurisdiction: "Florida", notarialAct: "acknowledgment_individual", supportedSigningProcedure: true, notaryConfirmedNoApplicableDisqualification: true, notaryState: "Florida", notaryCounty: "Orange",
  principals: [{ fullName: "Principal One", location: "florida", identityMethod: "ron_identity_verification", identityStatus: "passed", capacity: "individual", documentDescription: "Record", notaryConfirmedCredentialPresentationCompleted: true, notaryConfirmedCredentialAnalysisPassed: true, notaryConfirmedIdentityProofingPassed: true, outsideFloridaConfirmation: null, notaryConfirmedDocumentComplete: true, englishLanguageUnderstanding: "yes", notaryConfirmedRequiredTranslationProvided: null }],
  witnesses: [], special117285: false, physicalWitnessCount: 0, notaryConfirmedProviderScreeningCompleted: null, notaryConfirmedRequiredWrittenNoticeProvided: null, section117285ScreeningResult: "not_applicable"
});

const moduleIds = (input = base) => routeFloridaRonSession11(input).modules.map((entry) => `${entry.id}@${entry.version}`);

describe("FL-RON-1.1 Candidate acceptance matrix", () => {
  it("uses the approved individual-acknowledgment order and versions", async () => {
    expect(moduleIds()).toEqual(["FL-CORE@1.0", "FL-IDENTITY@1.1", "FL-LOCATION@1.0", "FL-WILLINGNESS@1.0", "FL-ACK-INDIVIDUAL@1.0", "FL-COMPLETE@1.1"]);
    const preview = await readFloridaRonCandidatePreviewModules(routeFloridaRonSession11(base).modules, floridaRonWorkflowVersion11);
    expect(preview.map((entry) => `${entry.id}@${entry.version}`)).toEqual(moduleIds());
    expect(preview.some((entry) => entry.id === "FL-ACK-LANGUAGE")).toBe(false);
  });

  it("routes a jurat without the acknowledgment-language prerequisite and supports representative acknowledgments", () => {
    expect(moduleIds({ ...base, notarialAct: "jurat" })).not.toContain("FL-ACK-LANGUAGE@1.1");
    const representative = { ...base, notarialAct: "acknowledgment_representative" as const, principals: [{ ...base.principals[0], capacity: "representative" as const, representativeCapacity: "Manager", representedParty: "Example LLC" }] };
    expect(moduleIds(representative)).toContain("FL-ACK-REPRESENTATIVE@1.0");
    expect(() => prepareSession11Schema.parse({ ...representative, principals: [{ ...representative.principals[0], representedParty: "" }] })).toThrow();
  });

  it("inserts Outside Florida and preserves independently routed multiple principals", () => {
    const input = { ...base, principals: [{ ...base.principals[0], location: "outside_florida" as const, outsideFloridaConfirmation: true }, { ...base.principals[0], fullName: "Principal Two" }] };
    expect(moduleIds(input)).toEqual(expect.arrayContaining(["FL-MULTI-PRINCIPAL@1.0", "FL-OUTSIDE-FL@1.0"]));
  });

  it("distinguishes all preflight block-start conditions without declaring an underlying act illegal", () => {
    expect(routeFloridaRonSession11({ ...base, notarialAct: "not_established" }).controlType).toBe("block_start");
    expect(routeFloridaRonSession11({ ...base, notarialAct: "other_authorized" }).stopReason).toBe("unsupported_notarial_act");
    expect(routeFloridaRonSession11({ ...base, supportedSigningProcedure: false }).stopReason).toBe("unsupported_signing_procedure");
    expect(routeFloridaRonSession11({ ...base, notaryConfirmedNoApplicableDisqualification: false }).stopReason).toBe("notary_disqualification");
  });

  it("keeps personally known identity distinct and treats provider statuses only as notary confirmations", () => {
    expect(routeFloridaRonSession11({ ...base, principals: [{ ...base.principals[0], identityMethod: "personally_known", notaryConfirmedCredentialPresentationCompleted: null, notaryConfirmedCredentialAnalysisPassed: null, notaryConfirmedIdentityProofingPassed: null }] }).stopReason).toBeNull();
    for (const field of ["notaryConfirmedCredentialPresentationCompleted", "notaryConfirmedCredentialAnalysisPassed", "notaryConfirmedIdentityProofingPassed"] as const) expect(routeFloridaRonSession11({ ...base, principals: [{ ...base.principals[0], [field]: false }] }).stopReason).toBe("identity");
    expect(Object.keys(base.principals[0])).not.toContain("credentialAnalysisPassed");
  });

  it("hard-stops identity and technical failures and blocks remote signing until compliant presence returns", () => {
    expect(routeFloridaRonSession11({ ...base, principals: [{ ...base.principals[0], identityStatus: "failed" }] })).toMatchObject({ stopReason: "identity", controlType: "hard_stop" });
    const remote = { fullName: "Remote", kind: "remote" as const, location: "Georgia", identityStatus: "passed" as const, usResidencyConfirmed: true, usLocationConfirmed: true, remotePresenceAtSigning: "lost_restored" as const };
    expect(routeFloridaRonSession11({ ...base, witnesses: [remote] })).toMatchObject({ stopReason: "remote_witness_presence", controlType: "conditional_route" });
    expect(routeFloridaRonSession11({ ...base, witnesses: [{ ...remote, remotePresenceAtSigning: "lost_unrestorable" }] })).toMatchObject({ stopReason: "technology", controlType: "hard_stop" });
    expect(routeFloridaRonSession11({ ...base, witnesses: [{ ...remote, usLocationConfirmed: false, remotePresenceAtSigning: "present" }] }).stopReason).toBe("remote_witness");
  });

  it("routes physical and remote witnesses plus the revised §117.285 procedure in order", () => {
    const remote = { fullName: "Remote", kind: "remote" as const, location: "Georgia", identityStatus: "passed" as const, usResidencyConfirmed: true, usLocationConfirmed: true, remotePresenceAtSigning: "present" as const };
    expect(moduleIds({ ...base, witnesses: [{ ...remote, kind: "physical", identityStatus: null, usResidencyConfirmed: null, usLocationConfirmed: null, remotePresenceAtSigning: "not_applicable" }] })).toContain("FL-PHYSICAL-WITNESS@1.0");
    const section = { ...base, special117285: true, physicalWitnessCount: 0, notaryConfirmedProviderScreeningCompleted: true, notaryConfirmedRequiredWrittenNoticeProvided: true, section117285ScreeningResult: "remote_witnessing_permitted" as const, witnesses: [remote] };
    expect(moduleIds(section)).toEqual(expect.arrayContaining(["FL-117285@1.1", "FL-REMOTE-WITNESS@1.0"]));
    expect(routeFloridaRonSession11({ ...section, section117285ScreeningResult: "physical_witnesses_required" }).stopReason).toBe("remote_witness");
  });

  it("requires translation only for acknowledgments and never determines its adequacy", () => {
    expect(moduleIds({ ...base, principals: [{ ...base.principals[0], englishLanguageUnderstanding: "no", notaryConfirmedRequiredTranslationProvided: true }] })).toContain("FL-ACK-INDIVIDUAL@1.0");
    expect(routeFloridaRonSession11({ ...base, principals: [{ ...base.principals[0], englishLanguageUnderstanding: "no", notaryConfirmedRequiredTranslationProvided: false }] })).toMatchObject({ stopReason: "acknowledgment_language", controlType: "block_start" });
    expect(moduleIds({ ...base, notarialAct: "jurat" })).not.toContain("FL-ACK-LANGUAGE@1.1");
    expect(base).not.toHaveProperty("translationAdequate");
  });

  it("keeps legacy providerScreening only in FL-RON-1.0 while v1.1 records notary confirmations", () => {
    expect(Object.keys(base)).not.toContain("providerScreening");
    expect(prepareSessionSchema.parse({ jurisdiction: "Florida", notarialAct: "jurat", notaryState: "Florida", notaryCounty: "Orange", principals: [{ fullName: "Legacy", location: "florida", identityMethod: "personally_known", identityStatus: "passed", capacity: "individual", documentDescription: "Record" }], witnesses: [], special117285: false, physicalWitnessCount: 0, providerScreening: "passed" }).providerScreening).toBe("passed");
    const section = prepareSession11Schema.parse({ ...base, special117285: true, physicalWitnessCount: 0, notaryConfirmedProviderScreeningCompleted: true, notaryConfirmedRequiredWrittenNoticeProvided: true, section117285ScreeningResult: "remote_witnessing_permitted" });
    expect(section).toMatchObject({ notaryConfirmedProviderScreeningCompleted: true, notaryConfirmedRequiredWrittenNoticeProvided: true, section117285ScreeningResult: "remote_witnessing_permitted" });
  });

  it("derives exact applicable final-review confirmations from the locked completion module", async () => {
    const normal = await requiredFloridaRonCandidateCompletionConfirmations(floridaRonWorkflowVersion11, base);
    expect(normal.some((item) => item.includes("Outside-Florida"))).toBe(false);
    expect(normal.some((item) => item.includes("witness"))).toBe(false);
    expect(normal.some((item) => item.includes("Correct certificate"))).toBe(true);
    const applicable = await requiredFloridaRonCandidateCompletionConfirmations(floridaRonWorkflowVersion11, { ...base, notarialAct: "acknowledgment_representative", principals: [{ ...base.principals[0], capacity: "representative", representativeCapacity: "Manager", representedParty: "Example LLC" }], witnesses: [{ fullName: "Remote", kind: "remote" }], special117285: true });
    expect(applicable.some((item) => item.includes("Representative capacity"))).toBe(true);
    expect(applicable.some((item) => item.includes("remote-witness"))).toBe(true);
  });

  it("preserves FL-RON-1.0 routing and source content while FL-RON-1.1 remains Candidate-only", async () => {
    const legacy = prepareSessionSchema.parse({ jurisdiction: "Florida", notarialAct: "acknowledgment_individual", notaryState: "Florida", notaryCounty: "Orange", principals: [{ fullName: "Legacy", location: "florida", identityMethod: "ron_identity_verification", identityStatus: "passed", capacity: "individual", documentDescription: "Record" }], witnesses: [], special117285: false, physicalWitnessCount: 0, providerScreening: "unavailable" });
    expect(routeFloridaRonSession(legacy).modules.map((entry) => `${entry.id}@${entry.version}`)).toEqual(["FL-CORE@1.0", "FL-IDENTITY@1.0", "FL-LOCATION@1.0", "FL-WILLINGNESS@1.0", "FL-ACK-INDIVIDUAL@1.0", "FL-COMPLETE@1.0"]);
    const content = await readFile("docs/compliance/florida-ron-session-assistant-v1.0-candidate.md");
    expect(createHash("sha256").update(content).digest("hex")).toBe("a962af857fc35b24d256670b880e318133f79d13a085d3edcb94af36128bdacd");
    expect(floridaRonWorkflowVersion).toBe("FL-RON-1.0");
    const candidate = { specificationStatus: "candidate" as const, state: "prepared" as const, modules: routeFloridaRonSession11(base).modules, currentModuleIndex: 0, stopReason: null, principalProgress: [] };
    expect(startFloridaRonSession(candidate)).toEqual(candidate);
    expect(advanceFloridaRonSession({ ...candidate, state: "in_progress" })).toEqual({ ...candidate, state: "in_progress" });
    expect(completeFloridaRonSession({ ...candidate, state: "final_review" }, true)).toEqual({ ...candidate, state: "final_review" });
  });
});
