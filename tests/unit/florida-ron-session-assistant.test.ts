import { describe, expect, it } from "vitest";
import { advanceFloridaRonSession, completeFloridaRonSession, prepareSessionSchema, routeFloridaRonSession, startFloridaRonSession, stopFloridaRonSession } from "@/lib/server/florida-ron-session-assistant";

const base = prepareSessionSchema.parse({ jurisdiction: "Florida", notarialAct: "acknowledgment_individual", notaryState: "Florida", notaryCounty: "Orange", principals: [{ fullName: "Principal", location: "florida", identityMethod: "ron_identity_verification", identityStatus: "passed", capacity: "individual", documentDescription: "Record" }], witnesses: [], special117285: false, physicalWitnessCount: 0, providerScreening: "unavailable" });
describe("Florida RON candidate routing", () => {
  it("routes the published Florida acknowledgement example in its controlling order", () => expect(routeFloridaRonSession(base).modules.map((entry) => entry.id)).toEqual(["FL-CORE", "FL-IDENTITY", "FL-LOCATION", "FL-WILLINGNESS", "FL-ACK-INDIVIDUAL", "FL-COMPLETE"]));
  it("adds outside Florida before willingness and jurat", () => expect(routeFloridaRonSession({ ...base, notarialAct: "jurat", principals: [{ ...base.principals[0], location: "outside_florida" }] }).modules.map((entry) => entry.id)).toEqual(["FL-CORE", "FL-IDENTITY", "FL-LOCATION", "FL-OUTSIDE-FL", "FL-WILLINGNESS", "FL-JURAT", "FL-COMPLETE"]));
  it("stops when RON identity verification fails without a credible-witness alternative", () => expect(routeFloridaRonSession({ ...base, principals: [{ ...base.principals[0], identityStatus: "failed" }] }).stopReason).toBe("identity"));
  it("stops an unestablished act and a non-Florida notary", () => { expect(routeFloridaRonSession({ ...base, notarialAct: "not_established" }).stopReason).toBe("notarial_act_not_established"); expect(routeFloridaRonSession({ ...base, notaryState: "Georgia" }).stopReason).toBe("notary_not_in_florida"); });
  it("gates all candidate routes from production activation", () => expect(routeFloridaRonSession(base).productionEnabled).toBe(false));
  it("does not permit a candidate workflow to start, advance, complete, or bypass a STOP", () => {
    const route = routeFloridaRonSession(base);
    const candidate = { specificationStatus: "candidate" as const, state: "prepared" as const, modules: route.modules, currentModuleIndex: 0, stopReason: null, principalProgress: [] };
    expect(startFloridaRonSession(candidate).state).toBe("prepared");
    expect(advanceFloridaRonSession({ ...candidate, state: "in_progress" }).currentModuleIndex).toBe(0);
    const stopped = stopFloridaRonSession({ ...candidate, state: "in_progress" }, "technology");
    expect(advanceFloridaRonSession(stopped).state).toBe("stopped");
    expect(completeFloridaRonSession({ ...stopped, state: "final_review" }, true).state).toBe("final_review");
  });
  it("keeps a failed-identity candidate blocked from every ceremony transition", () => {
    const route = routeFloridaRonSession({ ...base, principals: [{ ...base.principals[0], identityStatus: "failed" }] });
    const blocked = { specificationStatus: "candidate" as const, state: "prepared" as const, modules: route.modules, currentModuleIndex: 0, stopReason: route.stopReason, principalProgress: [] };
    expect(route.stopReason).toBe("identity");
    expect(route.productionEnabled).toBe(false);
    expect(startFloridaRonSession(blocked)).toEqual(blocked);
    expect(advanceFloridaRonSession({ ...blocked, state: "in_progress" })).toEqual({ ...blocked, state: "in_progress" });
    expect(completeFloridaRonSession({ ...blocked, state: "final_review" }, true)).toEqual({ ...blocked, state: "final_review" });
  });
});
