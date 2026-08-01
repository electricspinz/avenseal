import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdminOrganizationContext: vi.fn(), getSupabaseAdmin: vi.fn(), getDocumentForDownload: vi.fn(), recordDocumentDownload: vi.fn(), download: vi.fn() }));
vi.mock("@/lib/server/admin-context", () => ({ requireAdminOrganizationContext: mocks.requireAdminOrganizationContext }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: mocks.getSupabaseAdmin }));
vi.mock("@/lib/server/document-repository", () => ({ createAppointmentDocumentRepository: () => ({ getDocumentForDownload: mocks.getDocumentForDownload, recordDocumentDownload: mocks.recordDocumentDownload }) }));
vi.mock("@/lib/server/document-storage", () => ({ createSupabaseAppointmentDocumentStorage: () => ({ download: mocks.download }) }));

import { GET } from "@/app/api/admin/appointments/[id]/documents/[documentId]/download/route";

const document = { id: "document-1", organizationId: "org-1", appointmentId: "appointment-1", originalFilename: "unsafe\"name\n.pdf", storageKey: "quarantine/organizations/org-1/appointments/appointment-1/document-1", contentType: "application/pdf", sizeBytes: 3, status: "approved", uploadedByType: "customer", uploadedAt: "2026-08-01T10:00:00.000Z", deletedAt: null, metadata: {}, scanStatus: "clean" as const, storageStatus: "active" as const, scanProvider: null, scanRequestedAt: null, scannedAt: null, scanFailureCategory: null, scanAttemptCount: 1, createdAt: "2026-08-01T10:00:00.000Z", updatedAt: "2026-08-01T10:00:00.000Z" };
const call = (appointmentId = "appointment-1", documentId = "document-1") => GET(new Request("http://localhost/api/admin/appointments/ignored/documents/ignored/download"), { params: Promise.resolve({ id: appointmentId, documentId }) });

describe("admin document download endpoint", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.requireAdminOrganizationContext.mockResolvedValue({ organizationId: "org-1", role: "owner", userId: "user-1", email: "owner@example.com" }); mocks.getSupabaseAdmin.mockReturnValue({}); mocks.getDocumentForDownload.mockResolvedValue(document); mocks.download.mockResolvedValue(new TextEncoder().encode("pdf").buffer); });

  it("streams only a tenant-owned active document and records a safe owner audit", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="unsafe_name_.pdf"');
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(mocks.getDocumentForDownload).toHaveBeenCalledWith("org-1", "appointment-1", "document-1");
    expect(mocks.download).toHaveBeenCalledWith("quarantine/organizations/org-1/appointments/appointment-1/document-1");
    expect(mocks.recordDocumentDownload).toHaveBeenCalledWith(document, "owner");
    expect(response.headers.get("location")).toBeNull();
    expect(await response.text()).toBe("pdf");
    expect(JSON.stringify(Object.fromEntries(response.headers))).not.toContain("quarantine/");
  });

  it.each(["pending scan", "clean but quarantined", "infected", "suspicious", "failed", "removed", "deleted", "unknown", "wrong tenant", "wrong appointment", "invalid scan status", "invalid storage status", "review approved but pending"])("returns a safe unavailable response when %s", async () => {
    mocks.getDocumentForDownload.mockResolvedValue(null);
    const response = await call("other-appointment", "other-document");
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Document download is unavailable." });
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.recordDocumentDownload).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated and lower-privilege users", async () => {
    mocks.requireAdminOrganizationContext.mockRejectedValue(new Error("staff access denied"));
    const response = await call();
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Document download is unavailable." });
    expect(mocks.getDocumentForDownload).not.toHaveBeenCalled();
  });
});
