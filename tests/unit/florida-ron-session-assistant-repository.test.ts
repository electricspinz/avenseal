import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ configured: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ hasSupabaseServiceConfig: mocks.configured, getSupabaseAdmin: mocks.admin }));

import { repository } from "@/lib/server/repository";

const parameters = { jurisdiction: "Florida", notarialAct: "acknowledgment_individual", notaryState: "Florida", notaryCounty: "Orange", principals: [{ fullName: "Principal", location: "florida", identityMethod: "ron_identity_verification", identityStatus: "passed", capacity: "individual", documentDescription: "Record" }], witnesses: [], special117285: false, physicalWitnessCount: 0, providerScreening: "unavailable" };

describe("Florida RON prepared-attempt repository read", () => {
  it("scopes the newest prepared snapshot by both tenant and appointment", async () => {
    const eq = vi.fn();
    const chain = { select: vi.fn(), eq, order: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: "session-1", workflow_version: "FL-RON-1.0", specification_status: "candidate", state: "prepared", stop_reason: null, parameters, module_versions: [{ id: "FL-CORE", version: "1.0", classification: "required_by_florida_law" }] }, error: null }) };
    chain.select.mockReturnValue(chain); eq.mockReturnValue(chain); chain.order.mockReturnValue(chain); chain.limit.mockReturnValue(chain);
    mocks.configured.mockReturnValue(true);
    mocks.admin.mockReturnValue({ from: vi.fn().mockReturnValue(chain) });
    await expect(repository.getFloridaRonPreparedAttempt("org-1", "appointment-1")).resolves.toMatchObject({ sessionId: "session-1", workflowVersion: "FL-RON-1.0", state: "prepared", productionEnabled: false });
    expect(eq.mock.calls).toEqual([["organization_id", "org-1"], ["appointment_request_id", "appointment-1"], ["state", "prepared"]]);
    expect(chain.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });
});
