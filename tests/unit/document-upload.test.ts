import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadCustomerAppointmentDocument } from "@/lib/server/document-upload";

function uploadClient(metadataFails = false) {
  const inserts: Array<{ table: string; value: Record<string, unknown> }> = [];
  const client = {
    from(table: string) {
      let operation = "select";
      let value: Record<string, unknown> | undefined;
      const result = () => {
        if (table === "appointment_requests") return { data: { id: "appointment-1", organization_id: "org-1" }, error: null };
        if (table === "appointment_document_files" && operation === "insert") return metadataFails ? { data: null, error: new Error("database private error") } : { data: { id: value?.id, organization_id: "org-1", appointment_request_id: "appointment-1", original_filename: "document.pdf", storage_key: value?.storage_key, content_type: "application/pdf", size_bytes: 3, status: "uploaded", uploaded_by_type: "customer", uploaded_at: "2026-08-01T10:00:00.000Z", deleted_at: null, metadata: {}, created_at: "2026-08-01T10:00:00.000Z", updated_at: "2026-08-01T10:00:00.000Z" }, error: null };
        return { data: null, error: null };
      };
      const chain = {
        select() { return chain; },
        insert(input: Record<string, unknown>) { operation = "insert"; value = input; inserts.push({ table, value: input }); return chain; },
        eq() { return chain; },
        maybeSingle: async () => result(), single: async () => result(),
        then<TResult1 = { data: unknown; error: null }, TResult2 = never>(onfulfilled?: ((response: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null) { return Promise.resolve(result() as unknown as { data: unknown; error: null }).then(onfulfilled, onrejected); }
      };
      return chain;
    }
  } as unknown as SupabaseClient;
  return { client, inserts };
}

function uploadFile(name = "document.pdf", type = "application/pdf", bytes = "pdf") {
  return { name, type, size: new TextEncoder().encode(bytes).byteLength, arrayBuffer: async () => new TextEncoder().encode(bytes).buffer } as File;
}

describe("customer appointment document upload", () => {
  it("uploads private bytes before persisting safe metadata and audit", async () => {
    const state = uploadClient();
    const storage = { upload: vi.fn().mockResolvedValue(undefined), download: vi.fn(), remove: vi.fn().mockResolvedValue(undefined) };
    const result = await uploadCustomerAppointmentDocument({ organizationId: "org-1", appointmentId: "appointment-1", file: uploadFile(), storage, supabase: state.client });
    expect(storage.upload).toHaveBeenCalledOnce();
    expect(storage.upload.mock.calls[0][0]).toMatchObject({ key: expect.stringMatching(/^organizations\/org-1\/appointments\/appointment-1\/documents\//), contentType: "application/pdf" });
    expect(result).toMatchObject({ originalFilename: "document.pdf", status: "uploaded" });
    expect(result).not.toHaveProperty("contentType");
    expect(result).not.toHaveProperty("sizeBytes");
    expect(result).not.toHaveProperty("storageKey");
    expect(result).not.toHaveProperty("organizationId");
    expect(JSON.stringify(result)).not.toContain("organizations/");
    expect(state.inserts.map((entry) => entry.table)).toEqual(["appointment_document_files", "audit_logs"]);
  });

  it("compensates by removing the private object when metadata persistence fails", async () => {
    const state = uploadClient(true);
    const storage = { upload: vi.fn().mockResolvedValue(undefined), download: vi.fn(), remove: vi.fn().mockResolvedValue(undefined) };
    await expect(uploadCustomerAppointmentDocument({ organizationId: "org-1", appointmentId: "appointment-1", file: uploadFile(), storage, supabase: state.client })).rejects.toThrow("Document upload could not be completed.");
    expect(storage.upload).toHaveBeenCalledOnce();
    expect(storage.remove).toHaveBeenCalledOnce();
    expect(storage.remove.mock.calls[0][0]).toMatch(/^organizations\/org-1\/appointments\/appointment-1\/documents\//);
  });

  it("rejects invalid file metadata before object storage receives bytes", async () => {
    const state = uploadClient();
    const storage = { upload: vi.fn(), download: vi.fn(), remove: vi.fn() };
    await expect(uploadCustomerAppointmentDocument({ organizationId: "org-1", appointmentId: "appointment-1", file: uploadFile("document.pdf", "image/png", "png"), storage, supabase: state.client })).rejects.toThrow(/extension/i);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("rejects unsupported MIME types and oversized files before object storage receives bytes", async () => {
    const state = uploadClient();
    const storage = { upload: vi.fn(), download: vi.fn(), remove: vi.fn() };
    await expect(uploadCustomerAppointmentDocument({ organizationId: "org-1", appointmentId: "appointment-1", file: uploadFile("document.pdf", "application/zip", "zip"), storage, supabase: state.client })).rejects.toThrow();
    const oversized = { ...uploadFile(), size: 10 * 1024 * 1024 + 1 } as File;
    await expect(uploadCustomerAppointmentDocument({ organizationId: "org-1", appointmentId: "appointment-1", file: oversized, storage, supabase: state.client })).rejects.toThrow();
    expect(storage.upload).not.toHaveBeenCalled();
  });
});
