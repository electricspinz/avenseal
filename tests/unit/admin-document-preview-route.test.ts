import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdminOrganizationContext: vi.fn(), getSupabaseAdmin: vi.fn(), getDocumentForPreview: vi.fn(), recordDocumentPreview: vi.fn(), createSignedUrl: vi.fn() }));
vi.mock("@/lib/server/admin-context", () => ({ requireAdminOrganizationContext: mocks.requireAdminOrganizationContext }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: mocks.getSupabaseAdmin }));
vi.mock("@/lib/server/document-repository", () => ({ createAppointmentDocumentRepository: () => ({ getDocumentForPreview: mocks.getDocumentForPreview, recordDocumentPreview: mocks.recordDocumentPreview }) }));
vi.mock("@/lib/server/document-storage", () => ({ adminDocumentPreviewExpiresInSeconds: 60, createSupabaseAppointmentDocumentPreviewStorage: () => ({ createSignedUrl: mocks.createSignedUrl }) }));

import { GET } from "@/app/api/admin/appointments/[id]/documents/[documentId]/preview/route";
import { adminDocumentPreviewExpiresInSeconds } from "@/lib/server/document-storage";

const document = { id: "document-1", organizationId: "org-1", appointmentId: "appointment-1", originalFilename: "document.pdf", storageKey: "quarantine/organizations/org-1/appointments/appointment-1/document-1", contentType: "application/pdf", sizeBytes: 3, status: "approved", uploadedByType: "customer", uploadedAt: "2026-08-01T10:00:00.000Z", deletedAt: null, metadata: {}, scanStatus: "clean" as const, storageStatus: "active" as const, scanProvider: null, scanRequestedAt: null, scannedAt: null, scanFailureCategory: null, scanAttemptCount: 1, createdAt: "2026-08-01T10:00:00.000Z", updatedAt: "2026-08-01T10:00:00.000Z" };
const call = (appointmentId = "appointment-1", documentId = "document-1") => GET(new Request("http://localhost/api/admin/appointments/ignored/documents/ignored/preview"), { params: Promise.resolve({ id: appointmentId, documentId }) });

describe("admin document preview endpoint", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T12:00:00.000Z"));
    mocks.requireAdminOrganizationContext.mockResolvedValue({ organizationId: "org-1", role: "owner", userId: "user-1", email: "owner@example.com" });
    mocks.getSupabaseAdmin.mockReturnValue({});
    mocks.getDocumentForPreview.mockResolvedValue(document);
    mocks.createSignedUrl.mockResolvedValue("https://storage.example/temporary-preview");
  });

  it.each(["owner", "admin"])("creates a short-lived, audited preview only for an active %s", async (role) => {
    mocks.requireAdminOrganizationContext.mockResolvedValue({ organizationId: "org-1", role, userId: "user-1", email: "owner@example.com" });
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    await expect(response.json()).resolves.toEqual({ previewUrl: "https://storage.example/temporary-preview", contentType: "application/pdf", expiresAt: "2026-08-10T12:01:00.000Z" });
    expect(mocks.getDocumentForPreview).toHaveBeenCalledWith("org-1", "appointment-1", "document-1");
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(document.storageKey, adminDocumentPreviewExpiresInSeconds);
    expect(mocks.recordDocumentPreview).toHaveBeenCalledWith(document, role);
  });

  it.each(["image/png", "image/jpeg", "image/webp"])("supports %s previews", async (contentType) => {
    mocks.getDocumentForPreview.mockResolvedValue({ ...document, contentType });
    const response = await call();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ contentType });
  });

  it("denies unauthenticated access before document lookup", async () => {
    mocks.requireAdminOrganizationContext.mockRejectedValue(new Error("not authorized"));
    const response = await call();
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Preview unavailable." });
    expect(mocks.getDocumentForPreview).not.toHaveBeenCalled();
  });

  it("fails closed for a missing or cross-tenant document", async () => {
    mocks.getDocumentForPreview.mockResolvedValue(null);
    const response = await call("other-appointment", "other-document");
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Preview unavailable." });
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
    expect(mocks.recordDocumentPreview).not.toHaveBeenCalled();
  });

  it("does not sign unsupported content types", async () => {
    mocks.getDocumentForPreview.mockResolvedValue({ ...document, contentType: "application/octet-stream" });
    const response = await call();
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Preview unavailable." });
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });
});
