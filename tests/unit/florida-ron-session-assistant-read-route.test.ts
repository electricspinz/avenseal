import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createFloridaRonSessionAssistantReadHandler } from "@/app/api/admin/appointments/[id]/session-assistant/handler";
import type { FloridaRonPreparedAttempt } from "@/lib/server/florida-ron-session-assistant";

const context = { userId: "admin-1", email: "admin@example.com", organizationId: "org-1", role: "owner" as const };
const appointment = { id: "appointment-1", organizationId: "org-1" } as never;
const attempt: FloridaRonPreparedAttempt = {
  sessionId: "session-1",
  parameters: { jurisdiction: "Florida", notarialAct: "acknowledgment_individual", notaryState: "Florida", notaryCounty: "Orange", principals: [{ fullName: "Principal", location: "florida", identityMethod: "ron_identity_verification", identityStatus: "passed", capacity: "individual", documentDescription: "Record" }], witnesses: [], special117285: false, physicalWitnessCount: 0, providerScreening: "unavailable" },
  state: "prepared",
  workflowVersion: "FL-RON-1.0",
  specificationStatus: "candidate",
  modules: [{ id: "FL-CORE", version: "1.0", classification: "required_by_florida_law" }],
  stopReason: "identity",
  controlType: "hard_stop",
  productionEnabled: false
};

function harness(overrides: Record<string, unknown> = {}) {
  const contextLookup = vi.fn().mockResolvedValue(context);
  const getAppointment = vi.fn().mockResolvedValue(appointment);
  const getPreparedAttempt = vi.fn().mockResolvedValue(attempt);
  return { contextLookup, getAppointment, getPreparedAttempt, handle: createFloridaRonSessionAssistantReadHandler({ context: contextLookup, getAppointment, getPreparedAttempt, ...overrides }) };
}

const params = () => ({ params: Promise.resolve({ id: "appointment-1" }) });
const request = () => new NextRequest("http://localhost/api/admin/appointments/appointment-1/session-assistant");

describe("Florida RON session assistant prepared-attempt read route", () => {
  it("returns the immutable prepared snapshot with its routing STOP information", async () => {
    const test = harness();
    const response = await test.handle(request(), params());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ attempt });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(test.getPreparedAttempt).toHaveBeenCalledWith("org-1", "appointment-1");
  });

  it("does not read an appointment outside the authenticated owner/admin organization", async () => {
    const test = harness({ getAppointment: vi.fn().mockResolvedValue({ id: "appointment-1", organizationId: "org-2" } as never) });
    expect((await test.handle(request(), params())).status).toBe(404);
    expect(test.getPreparedAttempt).not.toHaveBeenCalled();
  });

  it("does not read when owner/admin authentication is unavailable", async () => {
    const test = harness({ context: vi.fn().mockRejectedValue(new Error("Admin organization access is required.")) });
    expect((await test.handle(request(), params())).status).toBe(403);
    expect(test.getAppointment).not.toHaveBeenCalled();
    expect(test.getPreparedAttempt).not.toHaveBeenCalled();
  });
});
