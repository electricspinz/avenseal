import { describe, expect, it } from "vitest";
import { readFloridaRonCandidatePreviewModules } from "@/lib/server/florida-ron-candidate-preview";
import { prepareSessionSchema, routeFloridaRonSession } from "@/lib/server/florida-ron-session-assistant";

const base = prepareSessionSchema.parse({ jurisdiction: "Florida", notarialAct: "acknowledgment_individual", notaryState: "Florida", notaryCounty: "Orange", principals: [{ fullName: "Principal One", location: "florida", identityMethod: "ron_identity_verification", identityStatus: "passed", capacity: "individual", documentDescription: "Record" }], witnesses: [], special117285: false, physicalWitnessCount: 0, providerScreening: "unavailable" });

async function ids(input = base) {
  const route = routeFloridaRonSession(input);
  const preview = await readFloridaRonCandidatePreviewModules(route.modules);
  expect(preview.map((module) => [module.id, module.version])).toEqual(route.modules.map((module) => [module.id, module.version]));
  expect(preview.every((module) => module.content.length > 0)).toBe(true);
  return preview.map((module) => module.id);
}

describe("Florida RON Candidate Preview modules", () => {
  it("uses the exact persisted Florida individual-acknowledgment route and source-backed module identity", async () => {
    await expect(ids()).resolves.toEqual(["FL-CORE", "FL-IDENTITY", "FL-LOCATION", "FL-WILLINGNESS", "FL-ACK-INDIVIDUAL", "FL-COMPLETE"]);
  });

  it("covers outside Florida, jurat, representative acknowledgment, and multiple principals", async () => {
    await expect(ids({ ...base, notarialAct: "jurat", principals: [{ ...base.principals[0], location: "outside_florida" }] })).resolves.toEqual(["FL-CORE", "FL-IDENTITY", "FL-LOCATION", "FL-OUTSIDE-FL", "FL-WILLINGNESS", "FL-JURAT", "FL-COMPLETE"]);
    await expect(ids({ ...base, notarialAct: "acknowledgment_representative", principals: [{ ...base.principals[0], capacity: "representative" }] })).resolves.toEqual(["FL-CORE", "FL-IDENTITY", "FL-LOCATION", "FL-WILLINGNESS", "FL-ACK-REPRESENTATIVE", "FL-COMPLETE"]);
    await expect(ids({ ...base, principals: [base.principals[0], { ...base.principals[0], fullName: "Principal Two" }] })).resolves.toEqual(["FL-CORE", "FL-IDENTITY", "FL-LOCATION", "FL-MULTI-PRINCIPAL", "FL-WILLINGNESS", "FL-WILLINGNESS", "FL-ACK-INDIVIDUAL", "FL-COMPLETE"]);
  });

  it("covers physical witnesses, remote witnesses, and the §117.285 conditional route", async () => {
    await expect(ids({ ...base, witnesses: [{ fullName: "Physical Witness", kind: "physical", location: "Florida", identityStatus: null, usResidencyConfirmed: null, usLocationConfirmed: null }] })).resolves.toEqual(["FL-CORE", "FL-IDENTITY", "FL-LOCATION", "FL-WILLINGNESS", "FL-PHYSICAL-WITNESS", "FL-ACK-INDIVIDUAL", "FL-COMPLETE"]);
    const remoteWitness = { fullName: "Remote Witness", kind: "remote" as const, location: "Georgia", identityStatus: "passed" as const, usResidencyConfirmed: true, usLocationConfirmed: true };
    await expect(ids({ ...base, witnesses: [remoteWitness] })).resolves.toEqual(["FL-CORE", "FL-IDENTITY", "FL-LOCATION", "FL-WILLINGNESS", "FL-REMOTE-WITNESS", "FL-ACK-INDIVIDUAL", "FL-COMPLETE"]);
    await expect(ids({ ...base, special117285: true, physicalWitnessCount: 0, providerScreening: "passed", witnesses: [remoteWitness] })).resolves.toEqual(["FL-CORE", "FL-IDENTITY", "FL-LOCATION", "FL-WILLINGNESS", "FL-117285", "FL-REMOTE-WITNESS", "FL-ACK-INDIVIDUAL", "FL-COMPLETE"]);
  });

  it("fails closed when an immutable module ID or version cannot be found in the locked source", async () => {
    await expect(readFloridaRonCandidatePreviewModules([{ id: "FL-NOT-A-MODULE", version: "1.0", classification: "required_by_florida_law" }])).rejects.toThrow("unavailable");
    await expect(readFloridaRonCandidatePreviewModules([{ id: "FL-CORE", version: "9.9", classification: "required_by_florida_law" }])).rejects.toThrow("unavailable");
  });
});
