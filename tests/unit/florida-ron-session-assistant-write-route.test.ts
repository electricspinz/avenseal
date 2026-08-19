import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ context: vi.fn(), getAppointment: vi.fn(), getPrepared: vi.fn(), getSupabaseAdmin: vi.fn(), create: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/server/admin-context", () => ({ requireAdminOrganizationContext: mocks.context }));
vi.mock("@/lib/server/repository", () => ({ repository: { getAppointment: mocks.getAppointment, getFloridaRonPreparedAttempt: mocks.getPrepared, createFloridaRonPreparedAttempt: mocks.create, updateFloridaRonPreparedAttempt: mocks.update } }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: mocks.getSupabaseAdmin }));

import { POST, PUT } from "@/app/api/admin/appointments/[id]/session-assistant/route";

const context = { userId: "owner-1", organizationId: "org-1", role: "owner" as const };
const appointment = { id: "appointment-1", organizationId: "org-1" };
const input = { jurisdiction: "Florida", notarialAct: "acknowledgment_individual", supportedSigningProcedure: true, notaryConfirmedNoApplicableDisqualification: true, notaryState: "Florida", notaryCounty: "Orange", principals: [{ fullName: "Principal", location: "florida", identityMethod: "ron_identity_verification", identityStatus: "passed", capacity: "individual", documentDescription: "Record", notaryConfirmedCredentialPresentationCompleted: true, notaryConfirmedCredentialAnalysisPassed: true, notaryConfirmedIdentityProofingPassed: true, outsideFloridaConfirmation: null, notaryConfirmedDocumentComplete: true, englishLanguageUnderstanding: "yes", notaryConfirmedRequiredTranslationProvided: null }], witnesses: [], special117285: false, physicalWitnessCount: 0, notaryConfirmedProviderScreeningCompleted: null, notaryConfirmedRequiredWrittenNoticeProvided: null, section117285ScreeningResult: "not_applicable" };
const originalModules = [{ id: "FL-CORE", version: "1.0", classification: "required_by_florida_law" }];

function request(method: "POST" | "PUT", body: unknown) {
  return new NextRequest("http://localhost/api/admin/appointments/appointment-1/session-assistant", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
function params() { return { params: Promise.resolve({ id: "appointment-1" }) }; }

function harness(current: Record<string, unknown> | null = { id: "session-1", state: "prepared", parameters: input, module_versions: originalModules, workflow_version: "FL-RON-1.1" }) {
  const sessionInserts: unknown[] = [];
  const sessionUpdates: unknown[] = [];
  const events: Record<string, unknown>[] = [];
  const filters: Array<[string, unknown]> = [];
  const sessions = {
    insert: (value: unknown) => { sessionInserts.push(value); return { select: () => ({ single: async () => ({ data: { id: "session-1" }, error: null }) }) }; },
    select: () => sessions,
    eq: (key: string, value: unknown) => { filters.push([key, value]); return sessions; },
    order: () => sessions,
    limit: () => sessions,
    maybeSingle: async () => ({ data: current, error: null }),
    update: (value: unknown) => { sessionUpdates.push(value); return sessions; },
    then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve)
  };
  const supabase = { from: (table: string) => table === "florida_ron_session_assistant_sessions" ? sessions : { insert: async (value: Record<string, unknown>) => { events.push(value); return { error: null }; } } };
  mocks.context.mockResolvedValue(context);
  mocks.getAppointment.mockResolvedValue(appointment);
  mocks.getPrepared.mockResolvedValue(current ? { sessionId: String(current.id), state: "prepared", parameters: current.parameters, modules: current.module_versions, workflowVersion: current.workflow_version, specificationStatus: "candidate", stopReason: null, controlType: null, productionEnabled: false } : null);
  mocks.create.mockImplementation(async (value: Record<string, unknown>) => { sessionInserts.push(value); events.push({ session_id: "session-1", organization_id: value.organizationId, event_type: "prepared", actor_id: value.actorId, payload: { previousParameters: null, nextParameters: value.parameters, workflowVersion: value.workflowVersion, moduleVersions: value.modules, stopReason: value.stopReason } }); return { id: "session-1" }; });
  mocks.update.mockImplementation(async (value: Record<string, unknown>) => { if (!current) return null; sessionUpdates.push(value); events.push({ session_id: "session-1", organization_id: value.organizationId, event_type: "parameters_changed", actor_id: value.actorId, payload: { previousParameters: current.parameters, nextParameters: value.parameters, workflowVersion: current.workflow_version, previousModuleVersions: current.module_versions, nextModuleVersions: value.modules, stopReason: value.stopReason } }); return { id: "session-1" }; });
  mocks.getSupabaseAdmin.mockReturnValue(supabase);
  return { sessionInserts, sessionUpdates, events, filters };
}

describe("Florida RON session assistant write routes", () => {
  it("creates an immutable creation audit snapshot with the owner actor and route modules", async () => {
    const test = harness();
    const response = await POST(request("POST", input), params());
    expect(response.status).toBe(201);
    expect(test.sessionInserts[0]).toMatchObject({ organizationId: "org-1", appointmentId: "appointment-1", workflowVersion: "FL-RON-1.1", parameters: input, modules: expect.arrayContaining([expect.objectContaining({ id: "FL-CORE", version: "1.0", classification: "required_by_florida_law" }), expect.objectContaining({ id: "FL-IDENTITY", version: "1.1" })]) });
    expect(test.events).toEqual([expect.objectContaining({ session_id: "session-1", organization_id: "org-1", actor_id: "owner-1", event_type: "prepared", payload: expect.objectContaining({ previousParameters: null, nextParameters: input, workflowVersion: "FL-RON-1.1", moduleVersions: expect.arrayContaining([expect.objectContaining({ id: "FL-IDENTITY", version: "1.1" })]), stopReason: null }) })]);
  });

  it("rejects malformed input, cross-tenant appointments, and non-owner/admin write contexts", async () => {
    const malformed = harness();
    expect((await POST(request("POST", { ...input, jurisdiction: "Georgia" }), params())).status).toBe(400);
    expect(malformed.sessionInserts).toHaveLength(0);

    const wrongTenant = harness();
    mocks.getAppointment.mockResolvedValueOnce({ ...appointment, organizationId: "org-2" });
    expect((await PUT(request("PUT", input), params())).status).toBe(404);
    expect(wrongTenant.sessionUpdates).toHaveLength(0);

    harness();
    mocks.context.mockRejectedValueOnce(new Error("Admin organization access is required."));
    expect((await POST(request("POST", input), params())).status).toBe(403);
  });

  it("edits only the prepared attempt scoped to its appointment and preserves the prior snapshot in append-only audit history", async () => {
    const original = { id: "session-1", state: "prepared", parameters: input, module_versions: originalModules, workflow_version: "FL-RON-1.1" };
    const test = harness(original);
    const georgia = { ...input, principals: [{ ...input.principals[0], location: "outside_florida" }], sessionId: "known-cross-tenant-session-id" };
    const response = await PUT(request("PUT", georgia), params());
    expect(response.status).toBe(200);
    expect((await response.json()).modules.map((module: { id: string }) => module.id)).toContain("FL-OUTSIDE-FL");
    expect(test.sessionUpdates[0]).toMatchObject({ organizationId: "org-1", appointmentId: "appointment-1", parameters: expect.objectContaining({ principals: [expect.objectContaining({ location: "outside_florida" })] }), modules: expect.arrayContaining([expect.objectContaining({ id: "FL-OUTSIDE-FL", version: "1.0", classification: "conditional_florida_requirement" })]) });
    expect(test.events[0]).toMatchObject({ session_id: "session-1", actor_id: "owner-1", event_type: "parameters_changed", payload: { previousParameters: input, nextParameters: expect.objectContaining({ principals: [expect.objectContaining({ location: "outside_florida" })] }), workflowVersion: "FL-RON-1.1", previousModuleVersions: originalModules, nextModuleVersions: expect.arrayContaining([expect.objectContaining({ id: "FL-OUTSIDE-FL", version: "1.0", classification: "conditional_florida_requirement" })]), stopReason: "outside_florida_confirmation" } });
    expect(original.module_versions).toEqual(originalModules);
    expect(original.parameters).toEqual(input);
  });

  it("fails closed for an unsupported act, a failed identity, and a non-prepared attempt", async () => {
    const unsupported = harness();
    const unsupportedResponse = await POST(request("POST", { ...input, notarialAct: "other_authorized" }), params());
    expect(await unsupportedResponse.json()).toMatchObject({ productionEnabled: false, stopReason: "unsupported_notarial_act", modules: [] });
    expect(unsupported.events[0].payload).toMatchObject({ stopReason: "unsupported_notarial_act" });

    const failedIdentity = harness();
    const failedResponse = await PUT(request("PUT", { ...input, principals: [{ ...input.principals[0], identityStatus: "failed" }] }), params());
    expect(await failedResponse.json()).toMatchObject({ productionEnabled: false, stopReason: "identity", modules: [{ id: "FL-CORE" }, { id: "FL-IDENTITY" }] });
    expect(failedIdentity.events[0].payload).toMatchObject({ stopReason: "identity" });

    const notPrepared = harness(null);
    expect((await PUT(request("PUT", input), params())).status).toBe(404);
    expect(notPrepared.sessionUpdates).toHaveLength(0);
  });
});
