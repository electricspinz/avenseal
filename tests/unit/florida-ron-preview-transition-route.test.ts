import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ context: vi.fn(), getAppointment: vi.fn(), getPrepared: vi.fn(), transition: vi.fn(), required: vi.fn() }));
vi.mock("@/lib/server/admin-context", () => ({ requireAdminOrganizationContext: mocks.context }));
vi.mock("@/lib/server/repository", () => ({ repository: { getAppointment: mocks.getAppointment, getFloridaRonPreparedAttempt: mocks.getPrepared, transitionFloridaRonPreparedAttempt: mocks.transition } }));
vi.mock("@/lib/server/florida-ron-candidate-preview", () => ({ requiredFloridaRonCandidateCompletionConfirmations: mocks.required }));

import { POST } from "@/app/api/admin/appointments/[id]/session-assistant/preview/transition/route";

describe("Florida RON Candidate Preview completion transition", () => {
  it("returns an explicit non-terminal BLOCK COMPLETION without creating an event or state transition", async () => {
    mocks.context.mockResolvedValue({ userId: "admin-1", organizationId: "org-1", role: "owner" });
    mocks.getAppointment.mockResolvedValue({ id: "appointment-1", organizationId: "org-1" });
    mocks.getPrepared.mockResolvedValue({ sessionId: "session-1", workflowVersion: "FL-RON-1.1", specificationStatus: "candidate", parameters: {}, modules: [], productionEnabled: false });
    mocks.required.mockResolvedValue(["Required locked confirmation"]);
    const request = new NextRequest("http://localhost/api/admin/appointments/appointment-1/session-assistant/preview/transition", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "preview_complete", moduleId: "FL-COMPLETE", confirmations: ["Different confirmation"] }) });
    const response = await POST(request, { params: Promise.resolve({ id: "appointment-1" }) });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Candidate final-compliance review remains unresolved.", controlType: "block_completion", missingConfirmations: ["Required locked confirmation"] });
    expect(mocks.transition).not.toHaveBeenCalled();
  });
});
