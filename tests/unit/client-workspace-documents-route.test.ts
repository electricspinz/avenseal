import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCustomerAppointmentByAccessToken: vi.fn(), uploadCustomerAppointmentDocument: vi.fn() }));
vi.mock("@/lib/server/repository", () => ({ repository: { getCustomerAppointmentByAccessToken: mocks.getCustomerAppointmentByAccessToken } }));
vi.mock("@/lib/server/document-upload", () => ({ uploadCustomerAppointmentDocument: mocks.uploadCustomerAppointmentDocument }));

import { POST } from "@/app/api/appointments/access/[token]/documents/route";

const appointment = { organizationId: "org-1", appointmentId: "appointment-1" };
function request(files: File[], replacementDocumentId: string | null = null) { return { formData: async () => ({ getAll: (name: string) => name === "file" ? files : [], get: (name: string) => name === "replacementDocumentId" ? replacementDocumentId : null }) } as unknown as Request; }

describe("Client Workspace document upload endpoint", () => {
  beforeEach(() => vi.resetAllMocks());

  it("uses only token-owned organization and appointment values and returns safe metadata", async () => {
    mocks.getCustomerAppointmentByAccessToken.mockResolvedValue(appointment);
    mocks.uploadCustomerAppointmentDocument.mockResolvedValue({ id: "document-1", originalFilename: "document.pdf", uploadedAt: "2026-08-01T10:00:00.000Z", status: "uploaded", replacementReason: null, storageKey: "private", organizationId: "private", appointmentId: "private" });
    const response = await POST(request([new File(["pdf"], "document.pdf", { type: "application/pdf" })]), { params: Promise.resolve({ token: "valid-token" }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.uploadCustomerAppointmentDocument).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1", appointmentId: "appointment-1", file: expect.any(File) }));
    await expect(response.json()).resolves.toEqual({ status: "uploaded", document: { id: "document-1", originalFilename: "document.pdf", uploadedAt: "2026-08-01T10:00:00.000Z", status: "uploaded", replacementReason: null } });
  });

  it("rejects invalid, expired, revoked, and cross-tenant tokens without invoking upload", async () => {
    mocks.getCustomerAppointmentByAccessToken.mockResolvedValue(null);
    for (const token of ["invalid", "expired", "revoked", "other-tenant"]) {
      const response = await POST(request([new File(["pdf"], "document.pdf", { type: "application/pdf" })]), { params: Promise.resolve({ token }) });
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ status: "unavailable" });
    }
    expect(mocks.uploadCustomerAppointmentDocument).not.toHaveBeenCalled();
  });

  it("rejects missing and multiple multipart files", async () => {
    mocks.getCustomerAppointmentByAccessToken.mockResolvedValue(appointment);
    await expect((await POST(request([]), { params: Promise.resolve({ token: "valid" }) })).json()).resolves.toEqual({ status: "unavailable" });
    await expect((await POST(request([new File(["a"], "a.pdf", { type: "application/pdf" }), new File(["b"], "b.pdf", { type: "application/pdf" })]), { params: Promise.resolve({ token: "valid" }) })).json()).resolves.toEqual({ status: "unavailable" });
    expect(mocks.uploadCustomerAppointmentDocument).not.toHaveBeenCalled();
  });

  it("passes a replacement target only to the token-scoped upload boundary", async () => {
    mocks.getCustomerAppointmentByAccessToken.mockResolvedValue(appointment);
    mocks.uploadCustomerAppointmentDocument.mockResolvedValue({ id: "replacement-1", originalFilename: "replacement.pdf", uploadedAt: "2026-08-02T10:00:00.000Z", status: "uploaded" });
    const response = await POST(request([new File(["pdf"], "replacement.pdf", { type: "application/pdf" })], "rejected-document-1"), { params: Promise.resolve({ token: "valid-token" }) });
    expect(response.status).toBe(200);
    expect(mocks.uploadCustomerAppointmentDocument).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1", appointmentId: "appointment-1", replacementDocumentId: "rejected-document-1" }));
    expect(JSON.stringify(await response.json())).not.toContain("rejected-document-1");
  });

  it("keeps validation and storage errors generic", async () => {
    mocks.getCustomerAppointmentByAccessToken.mockResolvedValue(appointment);
    mocks.uploadCustomerAppointmentDocument.mockRejectedValue(new Error("bucket appointment-documents private failure"));
    const response = await POST(request([new File(["pdf"], "document.pdf", { type: "application/pdf" })]), { params: Promise.resolve({ token: "valid" }) });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ status: "unavailable" });
  });
});
