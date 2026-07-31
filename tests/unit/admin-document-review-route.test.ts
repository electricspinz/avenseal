import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdminOrganizationContext: vi.fn(), getSupabaseAdmin: vi.fn(), getAppointment: vi.fn(), approveDocument: vi.fn(), rejectDocument: vi.fn() }));
vi.mock("@/lib/server/admin-context", () => ({ requireAdminOrganizationContext: mocks.requireAdminOrganizationContext }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: mocks.getSupabaseAdmin }));
vi.mock("@/lib/server/repository", () => ({ repository: { getAppointment: mocks.getAppointment } }));
vi.mock("@/lib/server/document-repository", () => ({ createAppointmentDocumentRepository: () => ({ approveDocument: mocks.approveDocument, rejectDocument: mocks.rejectDocument }) }));

import { POST } from "@/app/api/admin/appointments/[id]/documents/[documentId]/review/route";

const review = (body: unknown, appointmentId = "appointment-1", documentId = "document-1") => POST(new Request("http://localhost", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }) as never, { params: Promise.resolve({ id: appointmentId, documentId }) } as never);
const reviewed = { id: "document-1", status: "approved", reviewerName: "Avery Admin", reviewedAt: "2026-08-02T10:00:00.000Z", reviewNotes: null };

describe("admin document review endpoint", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.requireAdminOrganizationContext.mockResolvedValue({ organizationId: "org-1", userId: "00000000-0000-4000-8000-000000000001", role: "admin" }); mocks.getSupabaseAdmin.mockReturnValue({}); mocks.getAppointment.mockResolvedValue({ id: "appointment-1", organizationId: "org-1" }); mocks.approveDocument.mockResolvedValue(reviewed); mocks.rejectDocument.mockResolvedValue({ ...reviewed, status: "rejected", reviewNotes: "Needs a clearer image." }); });

  it("authorizes owner/admin context and reuses approveDocument with a safe response", async () => {
    const response = await review({ action: "approve" });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.approveDocument).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1", appointmentId: "appointment-1", documentId: "document-1", reviewer: { id: "00000000-0000-4000-8000-000000000001", role: "admin" } }));
    await expect(response.json()).resolves.toEqual({ document: reviewed });
  });

  it("requires a rejection reason and calls rejectDocument only for valid input", async () => {
    await expect((await review({ action: "reject", reviewNotes: " " })).json()).resolves.toEqual({ error: "Document review is unavailable." });
    expect(mocks.rejectDocument).not.toHaveBeenCalled();
    await review({ action: "reject", reviewNotes: "Needs a clearer image." });
    expect(mocks.rejectDocument).toHaveBeenCalledWith(expect.objectContaining({ reviewNotes: "Needs a clearer image." }));
  });

  it("rejects unauthorized and cross-tenant review without invoking repository review", async () => {
    mocks.requireAdminOrganizationContext.mockRejectedValue(new Error("not authorized"));
    expect((await review({ action: "approve" })).status).toBe(403);
    mocks.requireAdminOrganizationContext.mockResolvedValue({ organizationId: "org-1", userId: "00000000-0000-4000-8000-000000000001", role: "admin" });
    mocks.getAppointment.mockResolvedValue({ id: "appointment-1", organizationId: "org-2" });
    expect((await review({ action: "approve" })).status).toBe(404);
    expect(mocks.approveDocument).not.toHaveBeenCalled();
  });
});
