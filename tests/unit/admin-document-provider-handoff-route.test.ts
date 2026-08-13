import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminOrganizationContext: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  getDocumentForProviderHandoff: vi.fn(),
  recordDocumentProviderHandoffDownload: vi.fn(),
  download: vi.fn()
}));

vi.mock("@/lib/server/admin-context", () => ({ requireAdminOrganizationContext: mocks.requireAdminOrganizationContext }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: mocks.getSupabaseAdmin }));
vi.mock("@/lib/server/document-repository", () => ({
  createAppointmentDocumentRepository: () => ({
    getDocumentForProviderHandoff: mocks.getDocumentForProviderHandoff,
    recordDocumentProviderHandoffDownload: mocks.recordDocumentProviderHandoffDownload
  })
}));
vi.mock("@/lib/server/document-storage", () => ({ createSupabaseAppointmentDocumentStorage: () => ({ download: mocks.download }) }));

import { GET } from "@/app/api/admin/appointments/[id]/documents/[documentId]/provider-handoff/route";

const document = {
  id: "document-1",
  organizationId: "org-1",
  appointmentId: "appointment-1",
  originalFilename: "unsafe/\"name\n.pdf",
  storageKey: "quarantine/organizations/org-1/appointments/appointment-1/document-1",
  contentType: "application/pdf",
  sizeBytes: 3,
  status: "approved",
  uploadedByType: "customer",
  uploadedAt: "2026-08-01T10:00:00.000Z",
  deletedAt: null,
  metadata: {},
  scanStatus: "clean" as const,
  storageStatus: "active" as const,
  scanProvider: null,
  scanRequestedAt: null,
  scannedAt: null,
  scanFailureCategory: null,
  scanAttemptCount: 1,
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-01T10:00:00.000Z"
};

const call = (appointmentId = "appointment-1", documentId = "document-1") => GET(
  new Request("http://localhost/api/admin/appointments/ignored/documents/ignored/provider-handoff"),
  { params: Promise.resolve({ id: appointmentId, documentId }) }
);

describe("admin document provider-handoff endpoint", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireAdminOrganizationContext.mockResolvedValue({ organizationId: "org-1", role: "owner", userId: "user-1", email: "owner@example.com" });
    mocks.getSupabaseAdmin.mockReturnValue({});
    mocks.getDocumentForProviderHandoff.mockResolvedValue(document);
    mocks.download.mockResolvedValue(new TextEncoder().encode("pdf").buffer);
  });

  it.each(["owner", "admin"])("streams a clean active document for an authenticated %s and records only the handoff audit", async (role) => {
    mocks.requireAdminOrganizationContext.mockResolvedValue({ organizationId: "org-1", role, userId: "user-1", email: "owner@example.com" });
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="unsafe__name_.pdf"');
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("location")).toBeNull();
    expect(mocks.getDocumentForProviderHandoff).toHaveBeenCalledWith("org-1", "appointment-1", "document-1");
    expect(mocks.download).toHaveBeenCalledWith(document.storageKey);
    expect(mocks.recordDocumentProviderHandoffDownload).toHaveBeenCalledWith(document, role);
    const body = await response.text();
    expect(body).toBe("pdf");
    expect(JSON.stringify({ headers: Object.fromEntries(response.headers), body })).not.toMatch(/quarantine|storage|signed|provider-file/i);
  });

  it("denies unauthenticated users before document lookup", async () => {
    mocks.requireAdminOrganizationContext.mockRejectedValue(new Error("not authorized"));
    const response = await call();
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Provider handoff download is unavailable." });
    expect(mocks.getDocumentForProviderHandoff).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it.each(["missing document", "cross-tenant document", "wrong appointment", "pending document", "quarantined document", "infected document", "suspicious document", "failed document", "deleted document"])("fails closed without reading storage when repository denies a %s", async () => {
    mocks.getDocumentForProviderHandoff.mockResolvedValue(null);
    const response = await call("other-appointment", "other-document");
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Provider handoff download is unavailable." });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.recordDocumentProviderHandoffDownload).not.toHaveBeenCalled();
  });

  it("does not create an audit entry when storage cannot be read", async () => {
    mocks.download.mockRejectedValue(new Error("private storage failure"));
    const response = await call();
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Provider handoff download is unavailable." });
    expect(mocks.recordDocumentProviderHandoffDownload).not.toHaveBeenCalled();
  });
});
